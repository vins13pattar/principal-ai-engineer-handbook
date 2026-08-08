from __future__ import annotations

import asyncio
from typing import Any

from .worker import TaskContext


class FlakyDemoHandler:
    """Fails the first ``fail_before_attempt - 1`` attempts of each task.

    Demonstrates checkpointing: a "steps completed" counter is saved after
    each unit of simulated work and resumed from on retry, instead of
    starting the whole task over.
    """

    def __init__(self, *, fail_before_attempt: int = 3, steps: int = 3) -> None:
        self._fail_before_attempt = fail_before_attempt
        self._steps = steps

    async def __call__(self, payload: dict[str, Any], ctx: TaskContext) -> None:
        completed = (ctx.checkpoint or {}).get("steps_completed", 0)
        for step in range(completed, self._steps):
            await asyncio.sleep(0)
            if ctx.attempt < self._fail_before_attempt and step == self._steps - 1:
                await ctx.save_checkpoint({"steps_completed": step})
                raise RuntimeError(f"simulated transient failure on attempt {ctx.attempt}")
            await ctx.save_checkpoint({"steps_completed": step + 1})
