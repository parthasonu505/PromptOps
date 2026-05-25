"""
Fragment composition service.

Prompts can reference reusable fragments with {{fragment:slug}} syntax.
Fragments are injected at serve time so every consumer always gets the latest
approved version of each fragment without touching the prompt itself.

Example prompt content:
    {{fragment:professional-tone}}
    You are helping {{customer_name}} with {{issue_category}}.
    {{fragment:refund-policy}}
    {{fragment:response-format}}
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from database import PromptFragment

_FRAGMENT_RE = re.compile(r"\{\{fragment:([a-z0-9_-]+)\}\}")


def compose(content: str, db: Session) -> tuple[str, List[str], List[str]]:
    """
    Replace all ``{{fragment:slug}}`` references with fragment content.

    Returns:
        (composed_content, injected_slugs, missing_slugs)
    """
    slugs_needed = _FRAGMENT_RE.findall(content)
    if not slugs_needed:
        return content, [], []

    fragments: Dict[str, PromptFragment] = {}
    for slug in set(slugs_needed):
        frag = (
            db.query(PromptFragment)
            .filter(PromptFragment.slug == slug, PromptFragment.is_active == True)
            .first()
        )
        if frag:
            fragments[slug] = frag

    injected, missing = [], []
    result = content
    for slug in slugs_needed:
        if slug in fragments:
            result = result.replace("{{fragment:" + slug + "}}", fragments[slug].content, 1)
            if slug not in injected:
                injected.append(slug)
        else:
            if slug not in missing:
                missing.append(slug)

    return result, injected, missing


def validate_fragment_slugs(slugs: List[str], db: Session) -> List[str]:
    """Return the subset of slugs that do not exist or are inactive."""
    missing = []
    for slug in slugs:
        exists = (
            db.query(PromptFragment.id)
            .filter(PromptFragment.slug == slug, PromptFragment.is_active == True)
            .first()
        )
        if not exists:
            missing.append(slug)
    return missing


def get_fragment_preview(content: str, db: Session) -> str:
    """Compose and return the full prompt text — useful for the UI preview."""
    composed, _, _ = compose(content, db)
    return composed
