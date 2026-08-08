from __future__ import annotations

from retrieval.index import RetrievalIndex


def build_index() -> RetrievalIndex:
    index = RetrievalIndex(max_chars=300)
    index.add_document(
        "concurrency",
        "# Bounded Concurrency\n\n"
        "Use a semaphore to bound how many requests run at once.\n\n"
        "# Retries\n\n"
        "Retry transient failures with capped exponential backoff.\n",
    )
    index.add_document(
        "vectors",
        "# Vector Search\n\n"
        "Embeddings capture semantic similarity between passages.\n\n"
        "# Hybrid Search\n\n"
        "Combining lexical and vector search covers each method's blind spots.\n",
    )
    return index


def test_relevant_chunk_ranks_first_for_a_matching_query() -> None:
    index = build_index()
    results = index.search("semaphore bound concurrent requests", k=3)
    assert results[0].chunk.id == "concurrency#0"


def test_k_limits_the_number_of_results() -> None:
    index = build_index()
    results = index.search("search", k=1)
    assert len(results) == 1


def test_empty_index_returns_no_results() -> None:
    index = RetrievalIndex()
    assert index.search("anything") == []


def test_get_returns_a_previously_ingested_chunk() -> None:
    index = build_index()
    chunk = index.get("concurrency#0")
    assert chunk is not None
    assert chunk.heading == "Bounded Concurrency"


def test_get_returns_none_for_unknown_chunk() -> None:
    index = build_index()
    assert index.get("does-not-exist") is None


def test_two_semantically_distinct_topics_do_not_cross_contaminate_top_result() -> None:
    index = build_index()
    concurrency_hit = index.search("bounding request concurrency", k=1)[0]
    vector_hit = index.search("semantic embedding similarity", k=1)[0]
    assert concurrency_hit.chunk.document_id == "concurrency"
    assert vector_hit.chunk.document_id == "vectors"
