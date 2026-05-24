"""
PromptOps SDK — LangChain integration.

Wraps PromptOps as a LangChain BasePromptTemplate so versioned prompts
drop into any existing LangChain chain or LCEL pipeline without friction.

Install: pip install promptops-sdk langchain langchain-openai
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from promptops import PromptOpsClient

# ---------------------------------------------------------------------------
# LangChain integration — PromptOps as a BasePromptTemplate
# ---------------------------------------------------------------------------

try:
    from langchain_core.prompt_values import StringPromptValue
    from langchain_core.prompts import BasePromptTemplate

    class PromptOpsTemplate(BasePromptTemplate):
        """
        LangChain ``BasePromptTemplate`` backed by PromptOps.

        All versioning, approval, and caching is handled transparently.

        Example::

            from promptops.integrations.langchain import PromptOpsTemplate
            from langchain_openai import ChatOpenAI

            template = PromptOpsTemplate(
                slug="customer-support-assistant",
                version="1.2.0",           # optional — defaults to latest
                input_variables=["customer_name", "issue"],
            )

            chain = template | ChatOpenAI(model="gpt-4o-mini")
            result = chain.invoke({"customer_name": "Alice", "issue": "billing"})
        """

        slug: str
        version: Optional[str] = None
        environment: Optional[str] = None
        _client: Optional[PromptOpsClient] = None

        class Config:
            arbitrary_types_allowed = True

        @property
        def client(self) -> PromptOpsClient:
            if self._client is None:
                self._client = PromptOpsClient(
                    base_url=os.environ["PROMPTOPS_BASE_URL"],
                    api_key=os.environ["PROMPTOPS_API_KEY"],
                    environment=self.environment,
                )
            return self._client

        @property
        def _prompt_type(self) -> str:
            return "promptops"

        def format(self, **kwargs: Any) -> str:
            return self.client.render(
                self.slug,
                variables={k: str(v) for k, v in kwargs.items()},
                version=self.version,
                environment=self.environment,
            )

        def format_prompt(self, **kwargs: Any) -> StringPromptValue:
            return StringPromptValue(text=self.format(**kwargs))

        def _get_input_variables(self) -> List[str]:
            prompt = self.client.get(self.slug, version=self.version)
            return [v["name"] for v in prompt.variables if isinstance(v, dict) and "name" in v]

except ImportError:
    PromptOpsTemplate = None  # type: ignore


# ---------------------------------------------------------------------------
# LangChain Tool — look up prompts dynamically inside a ReAct agent
# ---------------------------------------------------------------------------

try:
    from langchain_core.tools import tool as lc_tool

    def make_promptops_tool(client: Optional[PromptOpsClient] = None):
        """
        Return a LangChain Tool that fetches and renders prompts.

        Agents can invoke this tool when they need to load a specialised
        persona or instruction set at runtime rather than baking it in.
        """
        _client = client or PromptOpsClient()

        @lc_tool
        def get_prompt(slug: str, variables: str = "") -> str:
            """
            Retrieve a versioned prompt from PromptOps and render it.

            Args:
                slug: The prompt name or slug (e.g. 'customer-support-assistant').
                variables: Optional JSON string of variable substitutions,
                           e.g. '{"customer_name":"Alice"}'.

            Returns:
                The rendered prompt text.
            """
            import json
            var_dict: Dict[str, str] = {}
            if variables:
                try:
                    var_dict = json.loads(variables)
                except json.JSONDecodeError:
                    pass
            return _client.render(slug, var_dict)

        return get_prompt

except ImportError:
    make_promptops_tool = None  # type: ignore


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    client = PromptOpsClient()
    prompts = client.list()
    print(f"Available prompts: {[p.slug for p in prompts]}")

    if prompts:
        slug = prompts[0].slug
        print(f"\nFetching '{slug}'...")
        rendered = client.render(slug, {})
        print(f"Rendered ({len(rendered)} chars):\n{rendered[:200]}")

    if PromptOpsTemplate is not None:
        print("\nLangChain PromptOpsTemplate is ready to use.")
    else:
        print("\nInstall langchain-core to use PromptOpsTemplate.")

    client.close()
