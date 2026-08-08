from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .index import RetrievalIndex


@dataclass(frozen=True, slots=True)
class EvalCase:
    """A query with the ground truth of which chunks should come back."""

    query: str
    relevant_chunk_ids: frozenset[str]


@dataclass(frozen=True, slots=True)
class EvalCaseResult:
    query: str
    retrieved_chunk_ids: tuple[str, ...]
    precision_at_k: float
    recall_at_k: float
    reciprocal_rank: float


@dataclass(frozen=True, slots=True)
class EvalReport:
    case_results: tuple[EvalCaseResult, ...]
    mean_precision_at_k: float
    mean_recall_at_k: float
    mean_reciprocal_rank: float


def evaluate(index: RetrievalIndex, cases: Sequence[EvalCase], *, k: int = 5) -> EvalReport:
    """Run every labeled case through the index and score retrieval quality.

    Precision and recall answer different questions: precision asks how
    much of what came back was relevant, recall asks how much of what was
    relevant came back at all. A retriever can be precise but incomplete,
    or complete but noisy — reporting only one metric hides which failure
    mode you actually have.
    """
    case_results = []
    for case in cases:
        results = index.search(case.query, k=k)
        retrieved_ids = tuple(result.chunk.id for result in results)
        relevant = case.relevant_chunk_ids

        hits = [chunk_id for chunk_id in retrieved_ids if chunk_id in relevant]
        precision = len(hits) / len(retrieved_ids) if retrieved_ids else 0.0
        recall = len(set(hits)) / len(relevant) if relevant else 0.0

        reciprocal_rank = 0.0
        for rank, chunk_id in enumerate(retrieved_ids, start=1):
            if chunk_id in relevant:
                reciprocal_rank = 1.0 / rank
                break

        case_results.append(
            EvalCaseResult(
                query=case.query,
                retrieved_chunk_ids=retrieved_ids,
                precision_at_k=precision,
                recall_at_k=recall,
                reciprocal_rank=reciprocal_rank,
            )
        )

    count = len(case_results) or 1
    return EvalReport(
        case_results=tuple(case_results),
        mean_precision_at_k=sum(r.precision_at_k for r in case_results) / count,
        mean_recall_at_k=sum(r.recall_at_k for r in case_results) / count,
        mean_reciprocal_rank=sum(r.reciprocal_rank for r in case_results) / count,
    )
