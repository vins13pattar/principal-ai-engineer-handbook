"""The cache itself: an exact tier, a semantic tier, and the scope key both share."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from semantic_cache.embedding import cosine, embed


class HitKind(StrEnum):
    """How an answer was served. Kept distinct because the risk profile differs."""

    MISS = "miss"
    #: Byte-identical question within the same scope. Always safe.
    EXACT = "exact"
    #: Similar enough under the configured threshold. Safe only sometimes — that
    #: "sometimes" is what `evaluation.py` measures.
    SEMANTIC = "semantic"


@dataclass(frozen=True)
class Scope:
    """Everything that changes the correct answer but is not the question text.

    A cache key that omits any of these will serve one tenant's answer to another, or
    yesterday's model's answer today. This is the same failure as keying a token cache
    by user alone and getting back a credential for the wrong audience — the key must
    cover every input the answer depends on.
    """

    tenant: str
    model: str
    prompt_version: str


@dataclass(frozen=True)
class Entry:
    question: str
    answer: str
    scope: Scope
    vector: tuple[float, ...]
    stored_at: float


@dataclass(frozen=True)
class Lookup:
    """What a lookup returned, and on what evidence."""

    kind: HitKind
    answer: str | None = None
    similarity: float | None = None
    matched_question: str | None = None


@dataclass
class SemanticCache:
    """Exact tier first, then nearest neighbour above a similarity threshold.

    The exact tier is not an optimisation — it is the part that is always correct, and
    keeping it separate means the semantic tier's risk can be measured on its own.
    """

    threshold: float = 0.95
    ttl_seconds: float = 3600.0
    _entries: list[Entry] = field(default_factory=list)
    _exact: dict[tuple[Scope, str], Entry] = field(default_factory=dict)

    def put(self, question: str, answer: str, scope: Scope, *, now: float) -> None:
        entry = Entry(question, answer, scope, embed(question), now)
        self._entries.append(entry)
        self._exact[(scope, question)] = entry

    def get(self, question: str, scope: Scope, *, now: float) -> Lookup:
        exact = self._exact.get((scope, question))
        if exact is not None and not self._expired(exact, now):
            return Lookup(HitKind.EXACT, exact.answer, 1.0, exact.question)

        # Scope is filtered *before* similarity, not after. Filtering afterwards means
        # the nearest neighbour was already read from another tenant's data and is
        # being discarded — see the Vector DB lookup's first gotcha.
        candidates = [
            e for e in self._entries if e.scope == scope and not self._expired(e, now)
        ]
        if not candidates:
            return Lookup(HitKind.MISS)

        query = embed(question)
        best = max(candidates, key=lambda e: cosine(query, e.vector))
        score = cosine(query, best.vector)
        if score >= self.threshold:
            return Lookup(HitKind.SEMANTIC, best.answer, score, best.question)
        return Lookup(HitKind.MISS, similarity=score)

    def _expired(self, entry: Entry, now: float) -> bool:
        return (now - entry.stored_at) >= self.ttl_seconds
