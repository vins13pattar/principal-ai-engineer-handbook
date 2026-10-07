from __future__ import annotations

import pytest
from conftest import FakeClock

from task_queue.store import InMemoryTaskStore


@pytest.mark.asyncio
async def test_submitted_task_timestamps_resolve_through_the_patched_clock(
    clock: FakeClock,
) -> None:
    """A task's timestamp defaults must read the clock at call time.

    ``field(default_factory=time.monotonic)`` captures the real function when
    the class is defined, so it escapes the patch the ``clock`` fixture
    installs. The suite only noticed on a host whose uptime exceeded the fake
    clock's start value: every new task was stamped with the host's uptime,
    looked scheduled for the distant future, and was never leased. On a freshly
    booted machine the same bug passed. This asserts the timestamps directly,
    so it fails on any host.
    """
    clock.advance(1_234.5)  # a value the real monotonic clock will not land on

    task = await InMemoryTaskStore().submit("ingest", "doc-1", {})

    assert task.available_at == clock()
    assert task.created_at == clock()
    assert task.updated_at == clock()
