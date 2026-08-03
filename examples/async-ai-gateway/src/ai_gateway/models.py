from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    provider: str | None = None
    timeout_seconds: float = Field(default=15.0, gt=0, le=120)


class GenerateResponse(BaseModel):
    provider: str
    text: str
    attempts: int
    latency_ms: float


@dataclass(frozen=True, slots=True)
class ProviderResult:
    provider: str
    text: str


class AIProvider(Protocol):
    name: str

    async def generate(self, prompt: str) -> ProviderResult: ...

    def stream(self, prompt: str) -> AsyncIterator[str]: ...
