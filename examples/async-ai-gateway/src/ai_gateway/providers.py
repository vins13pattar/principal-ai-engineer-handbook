from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from .models import ProviderResult


class DemoProvider:
    """Deterministic provider used by the lab and tests.

    Replace this adapter with an httpx-based OpenAI, Anthropic, Bedrock, or local-model client.
    """

    def __init__(self, name: str, *, delay_seconds: float = 0.02, fail_times: int = 0) -> None:
        self.name = name
        self._delay_seconds = delay_seconds
        self._failures_remaining = fail_times

    async def generate(self, prompt: str) -> ProviderResult:
        await asyncio.sleep(self._delay_seconds)
        if self._failures_remaining > 0:
            self._failures_remaining -= 1
            raise ConnectionError(f"Transient failure from {self.name}")
        return ProviderResult(provider=self.name, text=f"{self.name}: {prompt}")

    async def stream(self, prompt: str) -> AsyncIterator[str]:
        for token in f"{self.name}: {prompt}".split():
            await asyncio.sleep(self._delay_seconds)
            yield token + " "
