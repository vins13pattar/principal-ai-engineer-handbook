from __future__ import annotations

import asyncio
import random
import time
from collections.abc import AsyncIterator, Mapping

from .health_aware import HealthAwareSelector
from .models import AIProvider, GenerateResponse
from .rate_limit import AsyncTokenBucket


class GatewayOverloadedError(RuntimeError):
    pass


class AsyncAIGateway:
    def __init__(
        self,
        providers: Mapping[str, AIProvider],
        *,
        max_concurrency: int = 32,
        max_queue_wait_seconds: float = 0.25,
        max_attempts: int = 3,
        base_backoff_seconds: float = 0.05,
        rate_limiter: AsyncTokenBucket | None = None,
        health_aware_routing: bool = True,
    ) -> None:
        if not providers:
            raise ValueError("At least one provider is required")
        self._providers = dict(providers)
        self._selector = HealthAwareSelector(self._providers) if health_aware_routing else None
        self._capacity = asyncio.Semaphore(max_concurrency)
        self._max_queue_wait_seconds = max_queue_wait_seconds
        self._max_attempts = max_attempts
        self._base_backoff_seconds = base_backoff_seconds
        self._rate_limiter = rate_limiter
        self._closing = False

    def _select(self, requested: str | None) -> AIProvider:
        if self._selector is not None:
            return self._selector.select(requested)
        if requested is not None:
            try:
                return self._providers[requested]
            except KeyError as exc:
                raise ValueError(f"Unknown provider: {requested}") from exc
        return next(iter(self._providers.values()))

    async def _admit(self) -> None:
        if self._closing:
            raise RuntimeError("Gateway is shutting down")
        if self._rate_limiter is not None:
            await self._rate_limiter.acquire()
        try:
            await asyncio.wait_for(
                self._capacity.acquire(), timeout=self._max_queue_wait_seconds
            )
        except TimeoutError as exc:
            raise GatewayOverloadedError("Gateway concurrency limit reached") from exc

    async def generate(
        self,
        prompt: str,
        *,
        provider_name: str | None = None,
        timeout_seconds: float = 15.0,
    ) -> GenerateResponse:
        started = time.perf_counter()
        await self._admit()

        try:
            async with asyncio.timeout(timeout_seconds):
                last_error: Exception | None = None
                for attempt in range(1, self._max_attempts + 1):
                    provider = self._select(provider_name)
                    provider_started = time.perf_counter()
                    try:
                        result = await provider.generate(prompt)
                        if self._selector is not None:
                            self._selector.record_success(
                                provider.name,
                                (time.perf_counter() - provider_started) * 1000,
                            )
                        return GenerateResponse(
                            provider=result.provider,
                            text=result.text,
                            attempts=attempt,
                            latency_ms=(time.perf_counter() - started) * 1000,
                        )
                    except (ConnectionError, TimeoutError) as exc:
                        last_error = exc
                        if self._selector is not None:
                            self._selector.record_failure(provider.name)
                        if provider_name is not None or attempt == self._max_attempts:
                            raise
                        exponential = self._base_backoff_seconds * (2 ** (attempt - 1))
                        await asyncio.sleep(random.uniform(0, exponential))
                if last_error is not None:
                    raise last_error
        finally:
            self._capacity.release()

        raise RuntimeError("Unreachable retry state")

    async def stream(
        self,
        prompt: str,
        *,
        provider_name: str | None = None,
    ) -> AsyncIterator[str]:
        provider = self._select(provider_name)
        await self._admit()
        started = time.perf_counter()

        try:
            async for chunk in provider.stream(prompt):
                yield chunk
            if self._selector is not None:
                self._selector.record_success(
                    provider.name,
                    (time.perf_counter() - started) * 1000,
                )
        except (ConnectionError, TimeoutError):
            if self._selector is not None:
                self._selector.record_failure(provider.name)
            raise
        finally:
            self._capacity.release()

    def begin_shutdown(self) -> None:
        self._closing = True
