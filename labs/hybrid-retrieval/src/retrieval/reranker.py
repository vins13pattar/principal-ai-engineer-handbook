from __future__ import annotations

from collections.abc import Sequence

from .models import Chunk

BM25_WEIGHT = 0.6
COSINE_WEIGHT = 0.3
PHRASE_MATCH_BONUS = 0.1


def _normalize(values: dict[str, float]) -> dict[str, float]:
    if not values:
        return {}
    lo, hi = min(values.values()), max(values.values())
    if hi == lo:
        return dict.fromkeys(values, 1.0)  # all-equal scores shouldn't collapse to 0
    return {k: (v - lo) / (hi - lo) for k, v in values.items()}


def rerank(
    query: str,
    candidates: Sequence[Chunk],
    *,
    bm25_scores: dict[str, float],
    cosine_scores: dict[str, float],
) -> list[tuple[str, float]]:
    """Reorder a small fetched candidate set precisely, after a cheap broad fetch found it.

    Combining both retrieval signals plus an exact-phrase bonus is
    affordable here specifically because it only runs over the fetched
    candidates, not the whole corpus. A production reranker would
    typically be a cross-encoder model instead of this heuristic
    combination; see the README.
    """
    normalized_bm25 = _normalize(bm25_scores)
    query_lower = query.lower()

    results = []
    for chunk in candidates:
        combined = BM25_WEIGHT * normalized_bm25.get(
            chunk.id, 0.0
        ) + COSINE_WEIGHT * cosine_scores.get(chunk.id, 0.0)
        if query_lower and query_lower in chunk.text.lower():
            combined += PHRASE_MATCH_BONUS
        results.append((chunk.id, combined))

    results.sort(key=lambda kv: kv[1], reverse=True)
    return results
