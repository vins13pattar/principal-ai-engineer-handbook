from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Chunk:
    """A retrievable unit of a document, scoped to the section it came from."""

    id: str
    document_id: str
    heading: str | None
    text: str
    position: int


@dataclass(frozen=True, slots=True)
class SearchResult:
    chunk: Chunk
    score: float
