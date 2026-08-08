from __future__ import annotations

from collections.abc import Sequence

DEFAULT_RRF_K = 60


def reciprocal_rank_fusion(
    rankings: Sequence[Sequence[str]], *, k: int = DEFAULT_RRF_K
) -> list[tuple[str, float]]:
    """Combine multiple ranked ID lists into one, by rank position rather than raw score.

    Lexical (BM25) and vector (cosine) scores live on different, incomparable
    scales, so averaging them directly is meaningless. Reciprocal Rank
    Fusion sidesteps that: an ID's contribution from each ranking is
    ``1 / (k + rank)``, so only *position* matters, not the underlying
    score's magnitude. An ID that ranks well in both lists rises to the
    top; one that only one method found still gets partial credit.
    """
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, doc_id in enumerate(ranking, start=1):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)

    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
