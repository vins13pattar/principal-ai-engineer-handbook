from __future__ import annotations

import asyncio
import random
import time
from collections.abc import AsyncIterator, Mapping

from .models import AIProvider, GenerateResponse


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
    ) -> None:
        if not providers:
            raise ValueError("At least one provider is required")
        self._providers = dict(providers)
        self._capacity = asyncio.Semaphore(max_concurrency)
        self._max_queue_wait_seconds = max_queue_wait_seconds
        self._max_attempts = max_attempts
        self._base_backoff_seconds = base_backoff_seconds
        self._closing = False

    def _select(self, requested: str | None) -> AIProvider:
        if requested is not None:
            try:
                return self._providers[requested]
            except KeyError as exc:
                raise ValueError(f"Unknown provider: {requested}") from exc
        return next(iter(self._providers.values()))

    async def generate(
        self,
        prompt: str,
        *,
        provider_name: str | None = None,
        timeout_seconds: float = 15.0,
    ) -> GenerateResponse:
        if self._closing:
            raise RuntimeError("Gateway is shutting down")

        provider = self._select(provider_name)
        started = time.perf_counter()

        try:
            await asyncio.wait_for(
                self._capacity.acquire(), timeout=self._max_queue_wait_seconds
            )
        except TimeoutError as exc:
            raise GatewayOverloadedError("Gateway concurrency limit reached") from exc

        try:
            async with asyncio.timeout(timeout_seconds):
                for attempt in range(1, self._max_attempts + 1):
                    try:
                        result = await provider.generate(prompt)
                        return GenerateResponse(
                            provider=result.provider,
                            text=result.text,
                            attempts=attempt,
                            latency_ms=(time.perf_counter() - started) * 1000,
                        )
                    except (ConnectionError, TimeoutError):
                        if attempt == self._max_attempts:
                            raise
                        exponential = self._base_backoff_seconds * (2 ** (attempt - 1))
                        await asyncio.sleep(random.uniform(0, exponential))
        finally:
            self._capacity.release()

        raise RuntimeError("Unreachable retry state")

    async def stream(
        self,
        prompt: str,
        *,
        provider_name: str | None = None,
    ) -> AsyncIterator[str]:
        if self._closing:
            raise RuntimeError("Gateway is shutting down")
        provider = self._select(provider_name)
        try:
            await asyncio.wait_for(
                self._capacity.acquire(), timeout=self._max_queue_wait_seconds
            )
        except TimeoutError as exc:
            raise GatewayOverloadedError("Gateway concurrency limit reached") from exc

        try:
            async for chunk in provider.stream(prompt):
                yield chunk
        finally:
            self._capacity.release()

    def begin_shutdown(self) -> None:
        self._closing = True
