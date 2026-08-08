from __future__ import annotations

from retrieval.evaluation import EvalCase, evaluate
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
    return index


def test_perfect_retrieval_scores_maximally() -> None:
    index = build_index()
    cases = [
        EvalCase(
            "bounding concurrent requests with a semaphore", frozenset({"concurrency#0"})
        )
    ]
    report = evaluate(index, cases, k=3)

    assert report.mean_reciprocal_rank == 1.0
    assert report.mean_recall_at_k == 1.0
    [result] = report.case_results
    assert result.retrieved_chunk_ids[0] == "concurrency#0"


def test_missing_relevant_chunk_reduces_recall_and_mrr() -> None:
    index = build_index()
    cases = [EvalCase("bounding concurrent requests", frozenset({"does-not-exist#0"}))]
    report = evaluate(index, cases, k=3)

    assert report.mean_recall_at_k == 0.0
    assert report.mean_reciprocal_rank == 0.0


def test_mean_metrics_average_across_multiple_cases() -> None:
    index = build_index()
    cases = [
        EvalCase("bounding concurrent requests with a semaphore", frozenset({"concurrency#0"})),
        EvalCase("bounding concurrent requests with a semaphore", frozenset({"nonexistent#0"})),
    ]
    report = evaluate(index, cases, k=3)

    assert report.mean_reciprocal_rank == 0.5
    assert len(report.case_results) == 2


def test_empty_case_list_reports_zero_without_dividing_by_zero() -> None:
    index = build_index()
    report = evaluate(index, [], k=3)
    assert report.mean_precision_at_k == 0.0
    assert report.mean_recall_at_k == 0.0
    assert report.mean_reciprocal_rank == 0.0
    assert report.case_results == ()
