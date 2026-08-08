from __future__ import annotations

from retrieval.models import Chunk
from retrieval.reranker import rerank


def make_chunk(chunk_id: str, text: str) -> Chunk:
    return Chunk(id=chunk_id, document_id="doc", heading=None, text=text, position=0)


def test_higher_combined_signal_ranks_first() -> None:
    candidates = [make_chunk("a", "bounded concurrency"), make_chunk("b", "unrelated text")]
    results = rerank(
        "concurrency",
        candidates,
        bm25_scores={"a": 5.0, "b": 0.5},
        cosine_scores={"a": 0.8, "b": 0.1},
    )
    assert results[0][0] == "a"


def test_equal_bm25_scores_do_not_collapse_to_zero() -> None:
    candidates = [make_chunk("a", "text one"), make_chunk("b", "text two")]
    results = rerank(
        "query", candidates, bm25_scores={"a": 3.0, "b": 3.0}, cosine_scores={"a": 0.0, "b": 0.0}
    )
    scores = dict(results)
    assert scores["a"] > 0.0
    assert scores["b"] > 0.0


def test_exact_phrase_match_gets_a_bonus() -> None:
    candidates = [
        make_chunk("a", "this chunk contains the exact query phrase"),
        make_chunk("b", "this chunk does not"),
    ]
    results = rerank(
        "exact query phrase",
        candidates,
        bm25_scores={"a": 1.0, "b": 1.0},
        cosine_scores={"a": 0.0, "b": 0.0},
    )
    scores = dict(results)
    assert scores["a"] > scores["b"]


def test_no_candidates_returns_empty_list() -> None:
    assert rerank("query", [], bm25_scores={}, cosine_scores={}) == []
