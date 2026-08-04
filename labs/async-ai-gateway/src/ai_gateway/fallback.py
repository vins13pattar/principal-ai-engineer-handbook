from __future__ import annotations

from collections.abc import Sequence

from .models import AIProvider, ProviderResult
from .resilience import CircuitBreaker, CircuitOpenError


class AllProvidersFailedError(RuntimeError):
    pass


class FallbackProvider:
    """Tries providers in order while respecting a circuit breaker per dependency."""

    def __init__(self, providers: Sequence[AIProvider]) -> None:
        if not providers:
            raise ValueError("At least one provider is required")
        self.name = "fallback"
        self._providers = list(providers)
        self._breakers = {provider.name: CircuitBreaker() for provider in providers}

    async def generate(self, prompt: str) -> ProviderResult:
        failures: list[str] = []
        for provider in self._providers:
            breaker = self._breakers[provider.name]
            try:
                await breaker.allow()
                result = await provider.generate(prompt)
                breaker.record_success()
                return result
            except CircuitOpenError:
                failures.append(f"{provider.name}: circuit open")
            except (ConnectionError, TimeoutError) as exc:
                breaker.record_failure()
                failures.append(f"{provider.name}: {type(exc).__name__}")
        raise AllProvidersFailedError("; ".join(failures))

    async def stream(self, prompt: str):  # type: ignore[no-untyped-def]
        # Streaming fallback after bytes are emitted can duplicate partial output.
        # This lab deliberately selects the first healthy provider before streaming.
        for provider in self._providers:
            breaker = self._breakers[provider.name]
            try:
                await breaker.allow()
                async for chunk in provider.stream(prompt):
                    yield chunk
                breaker.record_success()
                return
            except CircuitOpenError:
                continue
            except (ConnectionError, TimeoutError):
                breaker.record_failure()
                continue
        raise AllProvidersFailedError("No healthy streaming provider")
