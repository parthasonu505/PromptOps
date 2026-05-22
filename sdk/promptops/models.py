from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PromptVariable(BaseModel):
    name: str
    description: Optional[str] = None
    required: bool = True
    default: Optional[str] = None


class Prompt(BaseModel):
    """A resolved prompt returned by the PromptOps SDK."""

    id: int
    name: str
    slug: str
    description: Optional[str] = None
    content: str
    version: Optional[str] = None
    version_id: Optional[int] = None
    category: str
    environment: str
    variables: List[Dict[str, Any]] = Field(default_factory=list)
    updated_at: datetime

    def render(self, variables: Optional[Dict[str, str]] = None, strict: bool = False) -> str:
        """
        Substitute ``{{variable}}`` placeholders in the prompt content.

        Args:
            variables: Mapping of variable name → value.
            strict: When *True*, raise ``RenderError`` if any declared variable
                    is not supplied.  When *False* (default), missing variables
                    are left as-is in the output.

        Returns:
            The rendered prompt string.
        """
        import re
        from .exceptions import RenderError

        variables = variables or {}
        declared = set(re.findall(r"\{\{(\w+)\}\}", self.content))
        missing = [k for k in declared if k not in variables]

        if strict and missing:
            raise RenderError(missing)

        result = self.content
        for key, value in variables.items():
            result = result.replace("{{" + key + "}}", value)
        return result


class PromptVersion(BaseModel):
    id: int
    prompt_id: int
    version: str
    content: str
    changelog: Optional[str] = None
    status: str
    created_at: datetime


class RenderResult(BaseModel):
    """Result of a server-side render call."""

    slug: str
    version: Optional[str] = None
    rendered: str
    variables_used: List[str] = Field(default_factory=list)
    variables_missing: List[str] = Field(default_factory=list)
