"""
PromptOps SDK — basic usage examples (sync + async).

Run with:
    PROMPTOPS_BASE_URL=http://localhost:5000 \
    PROMPTOPS_API_KEY=po_your_key_here \
    python examples/basic_usage.py
"""

import asyncio
import os

from promptops import AsyncPromptOpsClient, PromptOpsClient
from promptops.exceptions import PromptNotFoundError, RenderError


# ---------------------------------------------------------------------------
# Synchronous usage
# ---------------------------------------------------------------------------

def sync_demo() -> None:
    client = PromptOpsClient(
        base_url=os.environ["PROMPTOPS_BASE_URL"],
        api_key=os.environ["PROMPTOPS_API_KEY"],
        environment="production",
    )

    with client:
        # List all approved prompts in production
        prompts = client.list(environment="production")
        print(f"Found {len(prompts)} production prompts")
        for p in prompts:
            print(f"  • {p.slug} (v{p.version})")

        # Fetch and render inline
        try:
            text = client.render(
                "customer-support-assistant",
                {"customer_name": "Alice", "issue": "billing"},
            )
            print("\nRendered prompt:\n", text)
        except PromptNotFoundError as exc:
            print(f"Prompt not found: {exc}")

        # Pin to a specific version
        try:
            prompt = client.get("customer-support-assistant", version="1.0.0")
            print(f"\nPinned version content: {prompt.content[:80]}...")
        except PromptNotFoundError:
            print("That version doesn't exist yet.")

        # strict=True raises RenderError when a variable is missing
        try:
            client.render("customer-support-assistant", {}, strict=True)
        except RenderError as exc:
            print(f"\nMissing variables: {exc.missing}")


# ---------------------------------------------------------------------------
# Asynchronous usage
# ---------------------------------------------------------------------------

async def async_demo() -> None:
    async with AsyncPromptOpsClient(
        base_url=os.environ["PROMPTOPS_BASE_URL"],
        api_key=os.environ["PROMPTOPS_API_KEY"],
    ) as client:
        prompts = await client.list()
        print(f"\n[async] {len(prompts)} prompts available")

        if prompts:
            rendered = await client.render(prompts[0].slug, {})
            print(f"[async] rendered ({prompts[0].slug}):\n  {rendered[:120]}")


if __name__ == "__main__":
    sync_demo()
    asyncio.run(async_demo())
