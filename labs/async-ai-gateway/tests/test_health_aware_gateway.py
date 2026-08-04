from __future__ import annotations

import pytest

from ai_gateway.gateway import AsyncAIGateway
from ai_gateway.models import ProviderResult


class FailingProvider:
    name = "failing"

    async def generate(self, prompt: str) -> ProviderResult:
        raise ConnectionError("down")

    async def stream(self, prompt: str):
        if False:
            yield prompt
        raise ConnectionError("down")


class HealthyProvider:
    name = "healthy"

    async def generate(self, prompt: str) -> ProviderResult:
        return ProviderResult(provider=self.name, text=f"ok:{prompt}")

    async def stream(self, prompt: str):
        yield f"ok:{prompt}"


@pytest.mark.asyncio
async def test_gateway_falls_back_to_healthier_provider() -> None:
    gateway = AsyncAIGateway(
        {"failing": FailingProvider(), "healthy": HealthyProvider()},
        max_attempts=2,
        base_backoff_seconds=0,
    )

    result = await gateway.generate("hello")

    assert result.provider == "healthy"
    assert result.text == "ok:hello"
    assert result.attempts == 2


@pytest.mark.asyncio
async def test_explicit_provider_does_not_silently_fallback() -> None:
    gateway = AsyncAIGateway(
        {"failing": FailingProvider(), "healthy": HealthyProvider()},
        max_attempts=2,
        base_backoff_seconds=0,
    )

    with pytest.raises(ConnectionError):
        await gateway.generate("hello", provider_name="failing")
