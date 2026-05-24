"""
PromptOps SDK — framework-agnostic runtime client.

Works in any Python environment: GCP Agent Engine, AWS Lambda, Azure Functions,
LangChain agents, LlamaIndex, bare scripts, FastAPI, Django, Flask, etc.

Configuration via constructor args or environment variables:
    PROMPTOPS_BASE_URL   — e.g. https://your-promptops.example.com
    PROMPTOPS_API_KEY    — API key created in the PromptOps dashboard
    PROMPTOPS_ENVIRONMENT — default prompt environment (production / staging / development)
    PROMPTOPS_CACHE_TTL  — cache TTL in seconds (default: 300)
"""

from __future__ import annotations

import os
from typing import Dict, List, Optional

import httpx

from .cache import TTLCache
from .exceptions import (
    AuthenticationError,
    PromptNotFoundError,
    RenderError,
    ServerError,
    VersionNotFoundError,
)
from .models import Prompt, PromptVersion, RenderResult

_DEFAULT_TTL = 300
_SDK_PATH = "/api/sdk/v1"


def _env(name: str, default: Optional[str] = None) -> Optional[str]:
    return os.environ.get(name, default)


class PromptOpsClient:
    """
    Synchronous PromptOps client.

    Instantiate once (e.g. at module level) and reuse across requests.
    All prompt data is cached with a configurable TTL so hot paths never
    block on a network round-trip.

    Example::

        from promptops import PromptOpsClient

        client = PromptOpsClient(
            base_url="https://promptops.example.com",
            api_key="po_...",
            environment="production",
        )

        # Fetch the latest approved version
        prompt = client.get("customer-support-assistant")
        print(prompt.render({"customer_name": "Alice"}))

        # Pin to a specific version
        prompt = client.get("customer-support-assistant", version="1.2.0")
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        environment: Optional[str] = None,
        cache_ttl: Optional[int] = None,
        timeout: float = 10.0,
    ) -> None:
        self._base_url = (base_url or _env("PROMPTOPS_BASE_URL", "")).rstrip("/")
        self._api_key = api_key or _env("PROMPTOPS_API_KEY", "")
        self._environment = environment or _env("PROMPTOPS_ENVIRONMENT")
        ttl = cache_ttl if cache_ttl is not None else int(_env("PROMPTOPS_CACHE_TTL", str(_DEFAULT_TTL)))
        self._cache: TTLCache = TTLCache(ttl=ttl)
        self._http = httpx.Client(
            base_url=self._base_url,
            headers={"X-API-Key": self._api_key or ""},
            timeout=timeout,
        )

        if not self._base_url:
            raise ValueError("base_url is required (or set PROMPTOPS_BASE_URL env var)")
        if not self._api_key:
            raise ValueError("api_key is required (or set PROMPTOPS_API_KEY env var)")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(
        self,
        slug: str,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
    ) -> Prompt:
        """
        Fetch a prompt by name or slug.

        Args:
            slug: The prompt name or URL-safe slug (e.g. ``customer-support-assistant``).
            version: Pin to a specific semantic version (e.g. ``"1.2.0"``).
                     Omit to receive the latest approved version.
            environment: Override the client-level default environment.

        Returns:
            A :class:`~promptops.models.Prompt` object.  Call ``.render(variables)``
            on it to substitute ``{{variable}}`` placeholders.

        Raises:
            PromptNotFoundError: Prompt or version does not exist.
            AuthenticationError: API key is invalid or missing.
            ServerError: Unexpected server-side error.
        """
        env = environment or self._environment
        cache_key = f"prompt:{slug}:{version or 'latest'}:{env or '*'}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        params: Dict[str, str] = {}
        if version:
            params["version"] = version
        if env:
            params["environment"] = env

        resp = self._http.get(f"{_SDK_PATH}/prompts/{slug}", params=params)
        self._raise_for_status(resp, slug=slug, version=version)

        prompt = Prompt.model_validate(resp.json())
        self._cache.set(cache_key, prompt)
        return prompt

    def render(
        self,
        slug: str,
        variables: Optional[Dict[str, str]] = None,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
        strict: bool = False,
    ) -> str:
        """
        Convenience method: fetch a prompt and render it in one call.

        Args:
            slug: Prompt name or slug.
            variables: Template variable substitutions.
            version: Pin to a specific version.
            environment: Override default environment.
            strict: Raise :class:`~promptops.exceptions.RenderError` if any
                    declared variable is not supplied.

        Returns:
            The rendered prompt string.
        """
        prompt = self.get(slug, version=version, environment=environment)
        return prompt.render(variables, strict=strict)

    def server_render(
        self,
        slug: str,
        variables: Optional[Dict[str, str]] = None,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
    ) -> RenderResult:
        """
        Ask the PromptOps server to perform variable substitution.

        Unlike :meth:`render`, this sends variables to the server and receives
        back the substituted text — useful when you want server-side logging of
        render events or when local template logic is undesirable.
        """
        env = environment or self._environment
        payload: Dict = {"variables": variables or {}}
        if version:
            payload["version"] = version
        if env:
            payload["environment"] = env

        resp = self._http.post(f"{_SDK_PATH}/prompts/{slug}/render", json=payload)
        self._raise_for_status(resp, slug=slug, version=version)
        return RenderResult.model_validate(resp.json())

    def list(
        self,
        *,
        environment: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[Prompt]:
        """List all approved prompts visible to the API key owner."""
        env = environment or self._environment
        params: Dict[str, str] = {}
        if env:
            params["environment"] = env
        if category:
            params["category"] = category

        resp = self._http.get(f"{_SDK_PATH}/prompts", params=params)
        self._raise_for_status(resp)
        return [Prompt.model_validate(p) for p in resp.json()]

    def versions(self, slug: str) -> List[PromptVersion]:
        """List all versions of a prompt (most recent first)."""
        resp = self._http.get(f"{_SDK_PATH}/prompts/{slug}/versions")
        self._raise_for_status(resp, slug=slug)
        return [PromptVersion.model_validate(v) for v in resp.json()]

    def invalidate(self, slug: Optional[str] = None) -> None:
        """Manually invalidate the local cache.

        Pass a slug to invalidate only that prompt; omit to clear everything.
        """
        if slug:
            self._cache.invalidate_prefix(f"prompt:{slug}:")
        else:
            self._cache.clear()

    def close(self) -> None:
        """Release the underlying HTTP connection pool."""
        self._http.close()

    def __enter__(self) -> "PromptOpsClient":
        return self

    def __exit__(self, *_) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _raise_for_status(
        resp: httpx.Response,
        slug: Optional[str] = None,
        version: Optional[str] = None,
    ) -> None:
        if resp.status_code == 200 or resp.status_code == 201:
            return
        detail = _extract_detail(resp)
        if resp.status_code == 401:
            raise AuthenticationError(detail)
        if resp.status_code == 404:
            if version:
                raise VersionNotFoundError(detail or f"Version '{version}' of '{slug}' not found")
            raise PromptNotFoundError(detail or f"Prompt '{slug}' not found")
        raise ServerError(f"HTTP {resp.status_code}: {detail}")


class AsyncPromptOpsClient:
    """
    Async variant of :class:`PromptOpsClient`.

    Drop-in for async frameworks (FastAPI, async LangChain, Google ADK, etc.).

    Example::

        from promptops import AsyncPromptOpsClient

        client = AsyncPromptOpsClient(
            base_url="https://promptops.example.com",
            api_key="po_...",
        )

        prompt = await client.get("my-prompt")
        text = prompt.render({"name": "world"})
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        environment: Optional[str] = None,
        cache_ttl: Optional[int] = None,
        timeout: float = 10.0,
    ) -> None:
        self._base_url = (base_url or _env("PROMPTOPS_BASE_URL", "")).rstrip("/")
        self._api_key = api_key or _env("PROMPTOPS_API_KEY", "")
        self._environment = environment or _env("PROMPTOPS_ENVIRONMENT")
        ttl = cache_ttl if cache_ttl is not None else int(_env("PROMPTOPS_CACHE_TTL", str(_DEFAULT_TTL)))
        self._cache: TTLCache = TTLCache(ttl=ttl)
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            headers={"X-API-Key": self._api_key or ""},
            timeout=timeout,
        )

        if not self._base_url:
            raise ValueError("base_url is required (or set PROMPTOPS_BASE_URL env var)")
        if not self._api_key:
            raise ValueError("api_key is required (or set PROMPTOPS_API_KEY env var)")

    async def get(
        self,
        slug: str,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
    ) -> Prompt:
        """Async version of :meth:`PromptOpsClient.get`."""
        env = environment or self._environment
        cache_key = f"prompt:{slug}:{version or 'latest'}:{env or '*'}"
        cached = self._cache.get(cache_key)
        if cached is not None:
            return cached

        params: Dict[str, str] = {}
        if version:
            params["version"] = version
        if env:
            params["environment"] = env

        resp = await self._http.get(f"{_SDK_PATH}/prompts/{slug}", params=params)
        PromptOpsClient._raise_for_status(resp, slug=slug, version=version)

        prompt = Prompt.model_validate(resp.json())
        self._cache.set(cache_key, prompt)
        return prompt

    async def render(
        self,
        slug: str,
        variables: Optional[Dict[str, str]] = None,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
        strict: bool = False,
    ) -> str:
        """Async version of :meth:`PromptOpsClient.render`."""
        prompt = await self.get(slug, version=version, environment=environment)
        return prompt.render(variables, strict=strict)

    async def server_render(
        self,
        slug: str,
        variables: Optional[Dict[str, str]] = None,
        *,
        version: Optional[str] = None,
        environment: Optional[str] = None,
    ) -> RenderResult:
        """Async version of :meth:`PromptOpsClient.server_render`."""
        env = environment or self._environment
        payload: Dict = {"variables": variables or {}}
        if version:
            payload["version"] = version
        if env:
            payload["environment"] = env

        resp = await self._http.post(f"{_SDK_PATH}/prompts/{slug}/render", json=payload)
        PromptOpsClient._raise_for_status(resp, slug=slug, version=version)
        return RenderResult.model_validate(resp.json())

    async def list(
        self,
        *,
        environment: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[Prompt]:
        """Async version of :meth:`PromptOpsClient.list`."""
        env = environment or self._environment
        params: Dict[str, str] = {}
        if env:
            params["environment"] = env
        if category:
            params["category"] = category

        resp = await self._http.get(f"{_SDK_PATH}/prompts", params=params)
        PromptOpsClient._raise_for_status(resp)
        return [Prompt.model_validate(p) for p in resp.json()]

    async def versions(self, slug: str) -> List[PromptVersion]:
        """Async: list all versions of a prompt."""
        resp = await self._http.get(f"{_SDK_PATH}/prompts/{slug}/versions")
        PromptOpsClient._raise_for_status(resp, slug=slug)
        return [PromptVersion.model_validate(v) for v in resp.json()]

    def invalidate(self, slug: Optional[str] = None) -> None:
        if slug:
            self._cache.invalidate_prefix(f"prompt:{slug}:")
        else:
            self._cache.clear()

    async def aclose(self) -> None:
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncPromptOpsClient":
        return self

    async def __aexit__(self, *_) -> None:
        await self.aclose()


def _extract_detail(resp: httpx.Response) -> str:
    try:
        return resp.json().get("detail", resp.text)
    except Exception:
        return resp.text
