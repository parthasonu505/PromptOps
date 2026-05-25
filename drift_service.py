"""
Drift detection service.

Analyses recent ProductionLog records to identify quality regressions
and raises DriftAlert records when anomalies are found.

Detection strategies
--------------------
constraint_violation   — keyword/pattern scan against prompt's stated constraints
negative_feedback_spike — negative:positive ratio exceeds threshold
output_length_drift     — median output length deviates >30% from baseline
low_volume_sentinel     — no production calls in expected window (prompt gone silent)
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import DriftAlert, ProductionLog, Prompt, PromptVersion

# Patterns that indicate a constraint may have been violated in an LLM output.
# Keys are fragment / category slugs; values are regexes that indicate a violation.
_VIOLATION_PATTERNS: Dict[str, re.Pattern] = {
    "refund":    re.compile(r"\b(I('ll| will) refund|you('ll| will) receive a refund|refund (has been|is) processed)\b", re.I),
    "promise":   re.compile(r"\b(I (guarantee|promise|assure you))\b", re.I),
    "personal":  re.compile(r"\b(my personal (opinion|view)|personally I think)\b", re.I),
}

_LOOKBACK_HOURS   = 24
_MIN_SAMPLE_SIZE  = 10   # don't alert unless we have enough data
_NEG_RATIO_THRESH = 0.25  # alert when >25% feedback is negative
_LENGTH_DRIFT_PCT = 0.35  # alert when median length drifts >35%


def _recent_logs(db: Session, prompt_id: int, hours: int = _LOOKBACK_HOURS) -> List[ProductionLog]:
    since = datetime.utcnow() - timedelta(hours=hours)
    return (
        db.query(ProductionLog)
        .filter(ProductionLog.prompt_id == prompt_id, ProductionLog.logged_at >= since)
        .all()
    )


def _baseline_logs(db: Session, prompt_id: int, days_back: int = 7) -> List[ProductionLog]:
    end   = datetime.utcnow() - timedelta(hours=_LOOKBACK_HOURS)
    start = end - timedelta(days=days_back)
    return (
        db.query(ProductionLog)
        .filter(
            ProductionLog.prompt_id == prompt_id,
            ProductionLog.logged_at >= start,
            ProductionLog.logged_at < end,
        )
        .all()
    )


def _open_alert_exists(db: Session, prompt_id: int, alert_type: str) -> bool:
    return (
        db.query(DriftAlert.id)
        .filter(
            DriftAlert.prompt_id == prompt_id,
            DriftAlert.alert_type == alert_type,
            DriftAlert.status == "open",
        )
        .first()
    ) is not None


def _create_alert(
    db: Session,
    prompt_id: int,
    version_id: Optional[int],
    alert_type: str,
    severity: str,
    description: str,
    evidence: Dict[str, Any],
) -> DriftAlert:
    alert = DriftAlert(
        prompt_id=prompt_id,
        version_id=version_id,
        alert_type=alert_type,
        severity=severity,
        description=description,
        evidence=evidence,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


def analyze_prompt(db: Session, prompt_id: int) -> List[DriftAlert]:
    """Run all drift detectors for a single prompt. Returns newly created alerts."""
    recent   = _recent_logs(db, prompt_id)
    baseline = _baseline_logs(db, prompt_id)
    alerts: List[DriftAlert] = []

    if len(recent) < _MIN_SAMPLE_SIZE:
        return alerts

    latest_version_id = recent[-1].version_id if recent else None

    # ── 1. Constraint violation scan ────────────────────────────────────────
    if not _open_alert_exists(db, prompt_id, "constraint_violation"):
        violations: Dict[str, List[str]] = {}
        for log in recent:
            if not log.llm_output:
                continue
            for key, pattern in _VIOLATION_PATTERNS.items():
                if pattern.search(log.llm_output):
                    violations.setdefault(key, []).append(log.llm_output[:200])

        if violations:
            violation_rate = sum(len(v) for v in violations.items()) / len(recent)
            severity = "critical" if violation_rate > 0.1 else "high"
            alerts.append(_create_alert(
                db, prompt_id, latest_version_id,
                "constraint_violation", severity,
                f"Detected possible constraint violations in {len(violations)} categories "
                f"across {sum(len(v) for v in violations.values())} of the last {len(recent)} outputs.",
                {"categories": list(violations.keys()), "samples": {k: v[:3] for k, v in violations.items()}},
            ))

    # ── 2. Negative feedback spike ───────────────────────────────────────────
    if not _open_alert_exists(db, prompt_id, "negative_feedback_spike"):
        with_feedback = [l for l in recent if l.feedback in ("positive", "negative")]
        if len(with_feedback) >= _MIN_SAMPLE_SIZE:
            neg_count = sum(1 for l in with_feedback if l.feedback == "negative")
            neg_ratio = neg_count / len(with_feedback)
            if neg_ratio > _NEG_RATIO_THRESH:
                alerts.append(_create_alert(
                    db, prompt_id, latest_version_id,
                    "negative_feedback_spike", "high",
                    f"{neg_ratio:.0%} of feedback in the last {_LOOKBACK_HOURS}h is negative "
                    f"({neg_count}/{len(with_feedback)} interactions).",
                    {"negative_count": neg_count, "total_with_feedback": len(with_feedback), "ratio": round(neg_ratio, 3)},
                ))

    # ── 3. Output length drift ───────────────────────────────────────────────
    if baseline and not _open_alert_exists(db, prompt_id, "output_length_drift"):
        def median_len(logs: List[ProductionLog]) -> float:
            lengths = sorted(len(l.llm_output or "") for l in logs)
            mid = len(lengths) // 2
            return (lengths[mid] + lengths[~mid]) / 2 if lengths else 0

        recent_med   = median_len(recent)
        baseline_med = median_len(baseline)
        if baseline_med > 0:
            drift = abs(recent_med - baseline_med) / baseline_med
            if drift > _LENGTH_DRIFT_PCT:
                direction = "longer" if recent_med > baseline_med else "shorter"
                alerts.append(_create_alert(
                    db, prompt_id, latest_version_id,
                    "output_length_drift", "medium",
                    f"Output length has drifted {drift:.0%} {direction} compared to 7-day baseline "
                    f"(baseline median: {baseline_med:.0f} chars, recent median: {recent_med:.0f} chars).",
                    {"baseline_median": round(baseline_med), "recent_median": round(recent_med), "drift_pct": round(drift, 3)},
                ))

    return alerts


def run_full_scan(db: Session) -> Dict[str, Any]:
    """Scan all active prompts with production logs. Called by a scheduled job."""
    prompt_ids = [r[0] for r in db.query(ProductionLog.prompt_id).distinct().all()]
    total_alerts = 0
    scanned = 0
    for pid in prompt_ids:
        new_alerts = analyze_prompt(db, pid)
        total_alerts += len(new_alerts)
        scanned += 1
    return {"prompts_scanned": scanned, "alerts_raised": total_alerts, "scanned_at": datetime.utcnow().isoformat()}
