"""
Eval execution engine.

Supports four evaluator types:

  prompt_contains   — rendered prompt must contain `expected` string (case-insensitive)
  prompt_regex      — rendered prompt must match `expected` as a regex
  output_contains   — LLM response to the rendered prompt must contain `expected`
  output_regex      — LLM response must match `expected` regex
  llm_judge         — an LLM grades the response against a `rubric`;
                      passes when the judge returns PASS (case-insensitive)

LLM-based types require a judge_provider / judge_model on the PromptEval and
a decrypted API key supplied at run-time.
"""

from __future__ import annotations

import re
import asyncio
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database import EvalRun, PromptEval, PromptVersion
from llm_service import llm_service

_JUDGE_PROMPT = """\
You are an impartial evaluator. A language model was given the following system prompt and user message.
Evaluate whether the *criteria* below are satisfied by the model's response.

--- SYSTEM PROMPT ---
{system_prompt}

--- USER MESSAGE ---
{user_message}

--- MODEL RESPONSE ---
{response}

--- CRITERIA ---
{rubric}

Reply with exactly one word: PASS or FAIL, followed by a brief explanation on the same line.
Example: PASS - the response is polite and addresses the issue."""

_RENDER_RE = re.compile(r"\{\{(\w+)\}\}")


def _render(content: str, variables: Dict[str, str]) -> str:
    return _RENDER_RE.sub(lambda m: variables.get(m.group(1), m.group(0)), content)


async def _call_llm(
    prompt: str,
    provider: str,
    model: str,
    encrypted_api_key: str,
) -> str:
    result = await llm_service.send_prompt(provider, model, prompt, encrypted_api_key)
    if not result.success:
        raise RuntimeError(result.error or "LLM call failed")
    return result.response


async def _run_test_case(
    tc: Dict[str, Any],
    rendered_prompt: str,
    provider: Optional[str],
    model: Optional[str],
    encrypted_api_key: Optional[str],
) -> Dict[str, Any]:
    """Execute a single test case and return an EvalTestResult dict."""
    eval_type: str = tc.get("eval_type", "")
    expected: str = tc.get("expected") or ""
    rubric: str = tc.get("rubric") or ""
    test_input: str = tc.get("test_input") or ""

    actual: Optional[str] = None
    error: Optional[str] = None
    passed = False

    try:
        if eval_type == "prompt_contains":
            actual = rendered_prompt
            passed = expected.lower() in rendered_prompt.lower()

        elif eval_type == "prompt_regex":
            actual = rendered_prompt
            passed = bool(re.search(expected, rendered_prompt))

        elif eval_type in ("output_contains", "output_regex", "llm_judge"):
            if not (provider and model and encrypted_api_key):
                raise ValueError(
                    f"eval_type '{eval_type}' requires a configured LLM judge "
                    "(set judge_provider/judge_model on the eval suite and supply llm_config_id when triggering a run)"
                )
            # Build prompt: rendered system prompt + test_input as a user turn
            full_prompt = f"{rendered_prompt}\n\nUser: {test_input}" if test_input else rendered_prompt
            actual = await _call_llm(full_prompt, provider, model, encrypted_api_key)

            if eval_type == "output_contains":
                passed = expected.lower() in actual.lower()
            elif eval_type == "output_regex":
                passed = bool(re.search(expected, actual))
            else:  # llm_judge
                judge_prompt = _JUDGE_PROMPT.format(
                    system_prompt=rendered_prompt,
                    user_message=test_input or "(no user message)",
                    response=actual,
                    rubric=rubric,
                )
                verdict = await _call_llm(judge_prompt, provider, model, encrypted_api_key)
                passed = verdict.strip().upper().startswith("PASS")
        else:
            raise ValueError(f"Unknown eval_type: '{eval_type}'")

    except Exception as exc:
        error = str(exc)
        passed = False

    return {
        "test_case_id": tc.get("id", ""),
        "test_case_name": tc.get("name", ""),
        "passed": passed,
        "actual": actual,
        "expected": expected or rubric or None,
        "error": error,
    }


async def execute_eval_run(
    eval_run: EvalRun,
    eval_suite: PromptEval,
    version: PromptVersion,
    db: Session,
    encrypted_api_key: Optional[str] = None,
) -> EvalRun:
    """
    Run every test case in the suite against the given version,
    update the EvalRun and PromptVersion in the database, and return
    the completed EvalRun.
    """
    test_cases: List[Dict[str, Any]] = eval_suite.test_cases or []
    provider: Optional[str] = eval_suite.judge_provider
    model: Optional[str] = eval_suite.judge_model

    tasks = [
        _run_test_case(
            tc,
            _render(version.content, tc.get("input_variables") or {}),
            provider,
            model,
            encrypted_api_key,
        )
        for tc in test_cases
    ]

    results = await asyncio.gather(*tasks)

    total = len(results)
    passed_count = sum(1 for r in results if r["passed"])
    score = int((passed_count / total * 100)) if total else 0
    status = "passed" if score >= eval_suite.pass_threshold else "failed"

    eval_run.results = results
    eval_run.score = score
    eval_run.status = status
    eval_run.completed_at = datetime.utcnow()

    # Propagate to version so approvals / SDK can read it without joining
    version.eval_status = status
    version.eval_score = score

    db.commit()
    db.refresh(eval_run)
    return eval_run
