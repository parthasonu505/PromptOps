"""
PromptOps SDK — Google Cloud Agent Engine integration.

This example shows two complementary patterns:

1. Using PromptOps inside a Vertex AI Agent Engine custom reasoning engine
   (google-cloud-aiplatform >= 1.87 with the Agent Engine API).

2. Using PromptOps with the Google Agent Development Kit (ADK,
   google-adk package) as a reusable prompt-fetching tool.

Environment variables expected at runtime
-----------------------------------------
    PROMPTOPS_BASE_URL      — e.g. https://promptops.internal.example.com
    PROMPTOPS_API_KEY       — API key from the PromptOps dashboard
    PROMPTOPS_ENVIRONMENT   — "production" (recommended for Agent Engine)
    GOOGLE_CLOUD_PROJECT    — your GCP project ID
    GOOGLE_CLOUD_LOCATION   — e.g. "us-central1"

Recommended: store PROMPTOPS_API_KEY in Google Secret Manager and inject it
at deploy time via the Agent Engine secret mapping, or via a Cloud Run env var.

Deploy to Agent Engine
----------------------
    gcloud ai agent-engines create \
        --display-name="my-agent" \
        --region=us-central1 \
        --container-uri=gcr.io/my-project/my-agent:latest \
        --set-env-vars=PROMPTOPS_BASE_URL=https://...,PROMPTOPS_ENVIRONMENT=production \
        --set-secrets=PROMPTOPS_API_KEY=projects/my-project/secrets/promptops-api-key/versions/latest
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

# PromptOps SDK — only dependency beyond the Google SDKs
from promptops import AsyncPromptOpsClient, PromptOpsClient
from promptops.exceptions import PromptNotFoundError

# ---------------------------------------------------------------------------
# Pattern 1: Custom Reasoning Engine for Vertex AI Agent Engine
# ---------------------------------------------------------------------------
# The Agent Engine calls query() for every user turn.  We initialise the
# PromptOps client once at class level so the in-process TTL cache is warm
# across invocations within the same container instance.

class PromptOpsReasoningEngine:
    """
    Vertex AI Agent Engine – compatible reasoning engine.

    Register with:
        import vertexai
        from vertexai.preview import reasoning_engines

        vertexai.init(project=PROJECT, location=LOCATION)

        remote_agent = reasoning_engines.ReasoningEngine.create(
            reasoning_engines.AdkApp(agent=PromptOpsReasoningEngine()),
            requirements=["promptops-sdk", "google-cloud-aiplatform"],
        )
    """

    def __init__(self) -> None:
        self._promptops = PromptOpsClient(
            base_url=os.environ["PROMPTOPS_BASE_URL"],
            api_key=os.environ["PROMPTOPS_API_KEY"],
            environment=os.environ.get("PROMPTOPS_ENVIRONMENT", "production"),
            cache_ttl=300,
        )

    def set_up(self) -> None:
        """Called once by Agent Engine after the container starts."""
        # Pre-warm the cache with the prompts we know we'll need.
        try:
            self._promptops.get("customer-support-assistant")
        except PromptNotFoundError:
            pass

    def query(self, *, input: str, **kwargs: Any) -> Dict[str, Any]:
        """Called for every user message."""
        system_prompt = self._promptops.render(
            "customer-support-assistant",
            variables={"user_input": input},
        )
        # In a real agent you would call your LLM here with system_prompt + input.
        # This stub just returns the resolved prompt so you can verify it works.
        return {
            "output": f"[System prompt applied] {system_prompt[:80]}...",
            "prompt_version": self._promptops.get("customer-support-assistant").version,
        }


# ---------------------------------------------------------------------------
# Pattern 2: Google ADK Tool wrapping PromptOps
# ---------------------------------------------------------------------------
# Install: pip install google-adk
# This turns PromptOps into a reusable ADK Tool that any ADK agent can call.

def build_adk_agent():
    """
    Construct a Google ADK Agent that resolves prompts from PromptOps at runtime.

    Usage:
        agent = build_adk_agent()
        result = await agent.run_async("Help me with my billing issue")
    """
    try:
        from google.adk.agents import Agent
        from google.adk.tools import FunctionTool
    except ImportError:
        raise ImportError(
            "google-adk is required for this example: pip install google-adk"
        )

    _client = AsyncPromptOpsClient(
        base_url=os.environ["PROMPTOPS_BASE_URL"],
        api_key=os.environ["PROMPTOPS_API_KEY"],
        environment=os.environ.get("PROMPTOPS_ENVIRONMENT", "production"),
    )

    async def get_system_prompt(
        prompt_slug: str,
        variables: Optional[Dict[str, str]] = None,
        version: Optional[str] = None,
    ) -> str:
        """
        Retrieve and render a versioned system prompt from PromptOps.

        Args:
            prompt_slug: The prompt's name or URL-safe slug.
            variables: Key/value pairs to substitute into the prompt template.
            version: Pin to a specific version (e.g. "1.2.0"). Omit for latest.

        Returns:
            The fully rendered prompt string.
        """
        return await _client.render(prompt_slug, variables or {}, version=version)

    tool = FunctionTool(get_system_prompt)

    agent = Agent(
        name="promptops-agent",
        model="gemini-2.0-flash",
        description="Agent that fetches versioned prompts from PromptOps at runtime.",
        instruction=(
            "You are a helpful assistant. Before responding to the user, "
            "call get_system_prompt to retrieve the appropriate system prompt "
            "for the current task context."
        ),
        tools=[tool],
    )
    return agent


# ---------------------------------------------------------------------------
# Minimal smoke-test (no GCP credentials required)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    # Verify the SDK can reach PromptOps
    client = PromptOpsClient()
    prompts = client.list()
    print(f"PromptOps reachable — {len(prompts)} prompt(s) available:")
    for p in prompts:
        print(f"  {p.slug}  v{p.version}  [{p.environment}]")
    client.close()
    print("\nAgent Engine integration ready. Deploy with:")
    print("  gcloud ai agent-engines create --display-name=my-agent ...")
