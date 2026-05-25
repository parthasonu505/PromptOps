"""
Prompt Intelligence Agent.

Autonomous agents that analyse production data and create AgentTask records
for human review. Each task type uses an LLM with a carefully crafted
meta-prompt; humans approve or reject via the /api/agent-tasks endpoints.

Task types
----------
propose_fix       — diagnose a drift alert and propose a targeted prompt edit
generate_evals    — auto-generate test cases from a prompt's content
optimize_variant  — produce a token-optimised variant with the same eval quality
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database import (
    AgentTask, DriftAlert, ProductionLog, Prompt, PromptEval, PromptVersion,
)
from llm_service import llm_service

# ── Meta-prompts ─────────────────────────────────────────────────────────────

_FIX_PROMPT = """You are a PromptOps Intelligence Agent performing root-cause analysis on a production quality issue.

PROMPT NAME: {prompt_name}
CURRENT VERSION: {version}
CURRENT CONTENT:
{content}

DRIFT ALERT TYPE: {alert_type}
ALERT DESCRIPTION: {alert_description}
EVIDENCE: {evidence}

RECENT PRODUCTION SAMPLES (last 5 flagged outputs):
{samples}

Your task:
1. Diagnose the specific root cause in the prompt content that is causing this issue.
2. Propose a minimal, targeted edit — change only what is necessary.
3. Write a changelog entry for the proposed change.
4. Suggest 2-3 new test cases that would catch this issue.

Respond ONLY with valid JSON matching this schema:
{{
  "diagnosis": "<one paragraph explaining the root cause>",
  "proposed_content": "<full updated prompt content>",
  "changelog": "<one sentence describing what changed and why>",
  "confidence": <integer 0-100>,
  "suggested_test_cases": [
    {{
      "id": "agent_tc_1",
      "name": "<test name>",
      "input_variables": {{}},
      "eval_type": "llm_judge",
      "rubric": "<what a passing response must satisfy>"
    }}
  ]
}}"""

_EVAL_GEN_PROMPT = """You are an AI quality engineer. Generate comprehensive test cases for the following prompt template.

PROMPT NAME: {prompt_name}
VARIABLES: {variables}
CONTENT:
{content}

Generate 8-12 diverse test cases covering:
- Normal usage (happy path)
- Edge cases (unusual but valid inputs)
- Constraint checks (verify each stated rule is enforced)
- Adversarial inputs (inputs that might cause misbehaviour)

Respond ONLY with valid JSON:
{{
  "test_cases": [
    {{
      "id": "gen_tc_<n>",
      "name": "<descriptive name>",
      "input_variables": {{"var": "value"}},
      "eval_type": "<prompt_contains|prompt_regex|llm_judge>",
      "expected": "<string to match, if applicable>",
      "rubric": "<evaluation criteria for llm_judge>",
      "test_input": "<optional user message for output-based evals>"
    }}
  ]
}}"""

_OPTIMIZE_PROMPT = """You are a prompt engineer specialising in efficiency optimisation.

PROMPT NAME: {prompt_name}
CURRENT TOKEN COUNT (approximate): {token_count}
TARGET REDUCTION: {target_pct}%
CURRENT EVAL SCORE: {eval_score}%
CURRENT CONTENT:
{content}

Produce a shorter variant that:
1. Preserves all constraints and instructions
2. Maintains the same semantic intent
3. Reduces token count by approximately {target_pct}%
4. Should still pass the same eval suite

Respond ONLY with valid JSON:
{{
  "variant_content": "<optimised prompt content>",
  "estimated_token_count": <integer>,
  "changes_summary": "<bullet list of what was shortened and how>",
  "risk_assessment": "<what might be lost — be honest>",
  "confidence": <integer 0-100>
}}"""


# ── Dispatcher ────────────────────────────────────────────────────────────────

async def run_agent_task(
    task: AgentTask,
    db: Session,
    encrypted_api_key: str,
    provider: str = "openai",
    model: str = "gpt-4o-mini",
) -> AgentTask:
    """Execute the appropriate agent logic for a task and persist the result."""
    task.status = "in_progress"
    task.updated_at = datetime.utcnow()
    db.commit()

    try:
        if task.task_type == "propose_fix":
            output = await _propose_fix(task, db, provider, model, encrypted_api_key)
        elif task.task_type == "generate_evals":
            output = await _generate_evals(task, db, provider, model, encrypted_api_key)
        elif task.task_type == "optimize_variant":
            output = await _optimize_variant(task, db, provider, model, encrypted_api_key)
        else:
            raise ValueError(f"Unknown task_type: {task.task_type}")

        task.output_data = output
        task.reasoning   = output.get("diagnosis") or output.get("changes_summary") or ""
        task.confidence  = output.get("confidence", 0)
        task.status      = "awaiting_review"
    except Exception as exc:
        task.status     = "completed"
        task.output_data = {"error": str(exc)}

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task


# ── Task implementations ──────────────────────────────────────────────────────

async def _call_llm(meta_prompt: str, provider: str, model: str, encrypted_api_key: str) -> Dict[str, Any]:
    result = await llm_service.send_prompt(provider, model, meta_prompt, encrypted_api_key)
    if not result.success:
        raise RuntimeError(f"LLM call failed: {result.error}")
    text = result.response.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return json.loads(text)


async def _propose_fix(
    task: AgentTask, db: Session, provider: str, model: str, encrypted_api_key: str
) -> Dict[str, Any]:
    input_d: Dict = task.input_data or {}
    alert_id = input_d.get("alert_id")
    prompt   = db.query(Prompt).filter(Prompt.id == task.prompt_id).first()
    version  = db.query(PromptVersion).filter(PromptVersion.id == task.version_id).first()
    alert    = db.query(DriftAlert).filter(DriftAlert.id == alert_id).first() if alert_id else None

    # Gather recent flagged production samples
    samples_text = "\n---\n".join(
        (s.llm_output or "")[:300]
        for s in (input_d.get("production_samples") or [])
    ) or "(no samples available)"

    meta = _FIX_PROMPT.format(
        prompt_name=prompt.name if prompt else "unknown",
        version=version.version if version else "unknown",
        content=version.content if version else "",
        alert_type=alert.alert_type if alert else input_d.get("alert_type", "unknown"),
        alert_description=alert.description if alert else input_d.get("description", ""),
        evidence=json.dumps(alert.evidence if alert else {}, indent=2),
        samples=samples_text,
    )
    return await _call_llm(meta, provider, model, encrypted_api_key)


async def _generate_evals(
    task: AgentTask, db: Session, provider: str, model: str, encrypted_api_key: str
) -> Dict[str, Any]:
    prompt  = db.query(Prompt).filter(Prompt.id == task.prompt_id).first()
    version = db.query(PromptVersion).filter(PromptVersion.id == task.version_id).first()
    content = (version.content if version else prompt.content) if prompt else ""
    variables = json.dumps([v.get("name") for v in (prompt.variables or [])] if prompt else [])

    meta = _EVAL_GEN_PROMPT.format(
        prompt_name=prompt.name if prompt else "unknown",
        variables=variables,
        content=content,
    )
    return await _call_llm(meta, provider, model, encrypted_api_key)


async def _optimize_variant(
    task: AgentTask, db: Session, provider: str, model: str, encrypted_api_key: str
) -> Dict[str, Any]:
    input_d: Dict = task.input_data or {}
    prompt  = db.query(Prompt).filter(Prompt.id == task.prompt_id).first()
    version = db.query(PromptVersion).filter(PromptVersion.id == task.version_id).first()
    content = version.content if version else ""
    token_count = len(content.split()) * 1.3  # rough estimate

    meta = _OPTIMIZE_PROMPT.format(
        prompt_name=prompt.name if prompt else "unknown",
        token_count=int(token_count),
        target_pct=input_d.get("target_token_reduction", 20),
        eval_score=version.eval_score if version else 0,
        content=content,
    )
    return await _call_llm(meta, provider, model, encrypted_api_key)
