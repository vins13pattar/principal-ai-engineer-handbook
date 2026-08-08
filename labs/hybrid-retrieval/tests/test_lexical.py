from __future__ import annotations

from retrieval.lexical import BM25Index
from retrieval.models import Chunk


def make_chunk(chunk_id: str, text: str) -> Chunk:
    return Chunk(id=chunk_id, document_id="doc", heading=None, text=text, position=0)


def test_document_containing_the_query_term_outranks_one_that_does_not() -> None:
    index = BM25Index()
    index.build(
        [
            make_chunk("a", "retry with exponential backoff and jitter"),
            make_chunk("b", "use a semaphore to bound concurrency"),
        ]
    )

    ranking = index.rank("backoff jitter")
    assert ranking[0][0] == "a"


def test_absent_term_scores_zero() -> None:
    index = BM25Index()
    index.build([make_chunk("a", "retry with exponential backoff")])
    assert index.score("nothing in common", "a") == 0.0


def test_rank_excludes_zero_score_documents() -> None:
    index = BM25Index()
    index.build(
        [
            make_chunk("a", "retry with backoff"),
            make_chunk("b", "completely unrelated content here"),
        ]
    )
    ranking = index.rank("backoff")
    assert [chunk_id for chunk_id, _ in ranking] == ["a"]


def test_empty_index_returns_no_results() -> None:
    index = BM25Index()
    index.build([])
    assert index.rank("anything") == []


def test_rarer_term_scores_higher_than_a_common_one_at_equal_frequency() -> None:
    index = BM25Index()
    index.build(
        [
            make_chunk("a", "concurrency semaphore"),
            make_chunk("b", "concurrency is used everywhere in this corpus"),
            make_chunk("c", "concurrency shows up in every single document"),
        ]
    )
    # "semaphore" appears in only one doc; "concurrency" appears in all three,
    # so it carries a smaller IDF weight despite matching in the same chunk
    assert index.score("semaphore", "a") > index.score("concurrency", "a")
