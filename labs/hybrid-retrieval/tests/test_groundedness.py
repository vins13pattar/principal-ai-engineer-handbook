from __future__ import annotations

from retrieval.groundedness import check_groundedness, extract_citations


def test_extract_citations_finds_bracketed_chunk_ids() -> None:
    answer = "Bound concurrency with a semaphore [concurrency#0], then retry [concurrency#1]."
    assert extract_citations(answer) == frozenset({"concurrency#0", "concurrency#1"})


def test_fully_grounded_when_every_citation_was_retrieved() -> None:
    answer = "Use a semaphore [concurrency#0]."
    report = check_groundedness(answer, frozenset({"concurrency#0", "concurrency#1"}))
    assert report.is_fully_grounded
    assert report.ungrounded_chunk_ids == frozenset()


def test_citation_outside_retrieved_set_is_ungrounded() -> None:
    answer = "Use a semaphore [concurrency#0] and check tenancy [mcp#0]."
    report = check_groundedness(answer, frozenset({"concurrency#0"}))
    assert not report.is_fully_grounded
    assert report.ungrounded_chunk_ids == frozenset({"mcp#0"})


def test_answer_with_no_citations_is_trivially_grounded() -> None:
    report = check_groundedness("No citations here.", frozenset({"concurrency#0"}))
    assert report.is_fully_grounded
    assert report.cited_chunk_ids == frozenset()
