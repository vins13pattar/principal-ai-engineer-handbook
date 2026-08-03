from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping

import httpx

from .models import ProviderResult


class HTTPJSONProvider:
    """Generic provider adapter for OpenAI-compatible JSON and SSE APIs."""

    def __init__(
        self,
        name: str,
        base_url: str,
        *,
        api_key: str | None = None,
        model: str = "default",
        timeout_seconds: float = 20.0,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        auth = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        self.name = name
        self.model = model
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={**auth, **dict(headers or {})},
            timeout=httpx.Timeout(timeout_seconds, connect=5.0),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

    async def generate(self, prompt: str) -> ProviderResult:
        response = await self._client.post(
            "/v1/chat/completions",
            json={"model": self.model, "messages": [{"role": "user", "content": prompt}]},
        )
        response.raise_for_status()
        payload = response.json()
        text = str(payload["choices"][0]["message"]["content"])
        return ProviderResult(provider=self.name, text=text)

    async def stream(self, prompt: str) -> AsyncIterator[str]:
        async with self._client.stream(
            "POST",
            "/v1/chat/completions",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": True,
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                payload = json.loads(data)
                content = payload["choices"][0].get("delta", {}).get("content")
                if content:
                    yield str(content)

    async def close(self) -> None:
        await self._client.aclose()
