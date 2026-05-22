"""
PromptOps SDK
=============

Framework-agnostic runtime client for the PromptOps prompt management platform.

Quick start
-----------

    pip install promptops-sdk

    from promptops import PromptOpsClient

    client = PromptOpsClient(
        base_url="https://your-promptops.example.com",
        api_key="po_...",
        environment="production",
    )

    # Fetch the latest approved version and render it
    text = client.render("customer-support-assistant", {"customer_name": "Alice"})

Async usage (FastAPI, Google ADK, etc.)
---------------------------------------

    from promptops import AsyncPromptOpsClient

    client = AsyncPromptOpsClient(base_url=..., api_key=...)
    text = await client.render("my-prompt", {"name": "world"})

Environment variables
---------------------

    PROMPTOPS_BASE_URL      — PromptOps server URL
    PROMPTOPS_API_KEY       — API key
    PROMPTOPS_ENVIRONMENT   — default environment (production / staging / development)
    PROMPTOPS_CACHE_TTL     — in-process cache TTL in seconds (default: 300)
"""

from .client import AsyncPromptOpsClient, PromptOpsClient
from .exceptions import (
    AuthenticationError,
    PromptNotFoundError,
    PromptOpsError,
    RenderError,
    ServerError,
    VersionNotFoundError,
)
from .models import Prompt, PromptVersion, RenderResult

__all__ = [
    "PromptOpsClient",
    "AsyncPromptOpsClient",
    "Prompt",
    "PromptVersion",
    "RenderResult",
    "PromptOpsError",
    "AuthenticationError",
    "PromptNotFoundError",
    "VersionNotFoundError",
    "RenderError",
    "ServerError",
]

__version__ = "1.0.0"
