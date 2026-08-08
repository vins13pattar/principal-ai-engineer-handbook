from __future__ import annotations

import pytest

from retrieval.vectorize import cosine_similarity, embed


def test_identical_text_has_similarity_one() -> None:
    vector = embed("bounded concurrency semaphore")
    assert cosine_similarity(vector, vector) == pytest.approx(1.0)


def test_shared_vocabulary_scores_higher_than_disjoint_vocabulary() -> None:
    query = embed("semaphore bounded concurrency")
    related = embed("use a semaphore to bound concurrency")
    unrelated = embed("retry backoff jitter exponential")

    assert cosine_similarity(query, related) > cosine_similarity(query, unrelated)


def test_empty_text_produces_a_zero_vector() -> None:
    vector = embed("")
    assert all(v == 0.0 for v in vector)
    assert cosine_similarity(vector, embed("anything")) == 0.0


def test_embedding_is_deterministic_across_calls() -> None:
    assert embed("bounded concurrency") == embed("bounded concurrency")
