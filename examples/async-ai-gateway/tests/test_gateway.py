import asyncio

import pytest

from ai_gateway.gateway import AsyncAIGateway, GatewayOverloadedError
from ai_gateway.providers import DemoProvider


@pytest.mark.asyncio
async def test_retries_transient_provider_failure() -> None:
    gateway = AsyncAIGateway(
        {"primary": DemoProvider("primary", fail_times=1)},
        max_attempts=2,
        base_backoff_seconds=0,
    )

    response = await gateway.generate("hello")

    assert response.text == "primary: hello"
    assert response.attempts == 2


@pytest.mark.asyncio
async def test_rejects_when_concurrency_queue_expires() -> None:
    gateway = AsyncAIGateway(
        {"slow": DemoProvider("slow", delay_seconds=0.1)},
        max_concurrency=1,
        max_queue_wait_seconds=0.01,
    )

    first = asyncio.create_task(gateway.generate("first"))
    await asyncio.sleep(0)

    with pytest.raises(GatewayOverloadedError):
        await gateway.generate("second")

    await first


@pytest.mark.asyncio
async def test_stream_releases_capacity_after_completion() -> None:
    gateway = AsyncAIGateway(
        {"primary": DemoProvider("primary", delay_seconds=0)},
        max_concurrency=1,
    )

    chunks = [chunk async for chunk in gateway.stream("hello world")]
    response = await gateway.generate("next")

    assert "".join(chunks) == "primary: hello world "
    assert response.text == "primary: next"


@pytest.mark.asyncio
async def test_shutdown_rejects_new_requests() -> None:
    gateway = AsyncAIGateway({"primary": DemoProvider("primary")})
    gateway.begin_shutdown()

    with pytest.raises(RuntimeError, match="shutting down"):
        await gateway.generate("hello")
