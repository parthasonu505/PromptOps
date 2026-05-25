"""
Model-Prompt Certification Service.

Runs the full eval suite for a prompt version against a specific LLM model
and records a ModelCertification result. Produces a certification matrix so
teams can see at a glance which prompts are safe to use on which models.

When a provider silently updates a model, re-running certifications surfaces
regressions before they hit production.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database import (
    EvalRun, ModelCertification, PromptEval, PromptVersion,
)
from eval_service import execute_eval_run


async def certify_version(
    version_id: int,
    model_provider: str,
    model_id: str,
    db: Session,
    encrypted_api_key: Optional[str] = None,
    triggered_by_user_id: int = 0,
) -> ModelCertification:
    """
    Run every active eval suite for a prompt version against the specified model
    and store the aggregated result as a ModelCertification record.

    Returns the certification record (status: passed | failed).
    """
    version = db.query(PromptVersion).filter(PromptVersion.id == version_id).first()
    if not version:
        raise ValueError(f"PromptVersion {version_id} not found")

    suites = (
        db.query(PromptEval)
        .filter(PromptEval.prompt_id == version.prompt_id, PromptEval.is_active == True)
        .all()
    )

    if not suites:
        raise ValueError(f"No active eval suites found for prompt {version.prompt_id}")

    # Override the judge model on each suite so results reflect the target model
    scores: List[int] = []
    last_run_id: Optional[int] = None

    for suite in suites:
        # Temporarily set judge to target model for this certification run
        original_provider = suite.judge_provider
        original_model    = suite.judge_model
        suite.judge_provider = model_provider
        suite.judge_model    = model_id

        run = EvalRun(
            eval_id=suite.id,
            version_id=version_id,
            status="running",
            triggered_by=triggered_by_user_id,
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        completed_run = await execute_eval_run(run, suite, version, db, encrypted_api_key)
        scores.append(completed_run.score or 0)
        last_run_id = completed_run.id

        # Restore original judge settings
        suite.judge_provider = original_provider
        suite.judge_model    = original_model
        db.commit()

    overall_score = int(sum(scores) / len(scores)) if scores else 0
    # Use the minimum threshold across all suites for the pass gate
    min_threshold = min(s.pass_threshold for s in suites)
    status = "passed" if overall_score >= min_threshold else "failed"

    cert = ModelCertification(
        eval_run_id=last_run_id,
        prompt_id=version.prompt_id,
        version_id=version_id,
        model_provider=model_provider,
        model_id=model_id,
        score=overall_score,
        status=status,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


def get_matrix(prompt_id: int, db: Session) -> List[Dict[str, Any]]:
    """
    Return a flat list of the latest certification result per
    (version, model_provider, model_id) triple — ready to pivot into a matrix.
    """
    certs = (
        db.query(ModelCertification)
        .filter(ModelCertification.prompt_id == prompt_id)
        .order_by(ModelCertification.certified_at.desc())
        .all()
    )

    # Deduplicate: keep only the latest cert per (version_id, provider, model)
    seen = set()
    rows: List[Dict[str, Any]] = []
    for c in certs:
        key = (c.version_id, c.model_provider, c.model_id)
        if key in seen:
            continue
        seen.add(key)
        version = db.query(PromptVersion).filter(PromptVersion.id == c.version_id).first()
        rows.append({
            "version_id":     c.version_id,
            "version_str":    version.version if version else "unknown",
            "model_provider": c.model_provider,
            "model_id":       c.model_id,
            "score":          c.score,
            "status":         c.status,
            "certified_at":   c.certified_at.isoformat() if c.certified_at else None,
        })
    return rows
