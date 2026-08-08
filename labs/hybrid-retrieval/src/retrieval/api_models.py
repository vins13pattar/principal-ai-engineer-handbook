from __future__ import annotations

from pydantic import BaseModel, Field

from .evaluation import EvalCaseResult, EvalReport
from .groundedness import GroundednessReport
from .models import Chunk, SearchResult


class IngestRequest(BaseModel):
    document_id: str = Field(min_length=1)
    text: str = Field(min_length=1)


class ChunkResponse(BaseModel):
    id: str
    document_id: str
    heading: str | None
    text: str
    position: int

    @classmethod
    def from_chunk(cls, chunk: Chunk) -> ChunkResponse:
        return cls(
            id=chunk.id,
            document_id=chunk.document_id,
            heading=chunk.heading,
            text=chunk.text,
            position=chunk.position,
        )


class SearchRequest(BaseModel):
    query: str = Field(min_length=1)
    k: int = Field(default=5, ge=1, le=50)


class SearchResultResponse(BaseModel):
    chunk: ChunkResponse
    score: float

    @classmethod
    def from_result(cls, result: SearchResult) -> SearchResultResponse:
        return cls(chunk=ChunkResponse.from_chunk(result.chunk), score=result.score)


class GroundednessRequest(BaseModel):
    answer: str
    retrieved_chunk_ids: list[str]


class GroundednessResponse(BaseModel):
    cited_chunk_ids: list[str]
    ungrounded_chunk_ids: list[str]
    is_fully_grounded: bool

    @classmethod
    def from_report(cls, report: GroundednessReport) -> GroundednessResponse:
        return cls(
            cited_chunk_ids=sorted(report.cited_chunk_ids),
            ungrounded_chunk_ids=sorted(report.ungrounded_chunk_ids),
            is_fully_grounded=report.is_fully_grounded,
        )


class EvalCaseResultResponse(BaseModel):
    query: str
    retrieved_chunk_ids: list[str]
    precision_at_k: float
    recall_at_k: float
    reciprocal_rank: float

    @classmethod
    def from_result(cls, result: EvalCaseResult) -> EvalCaseResultResponse:
        return cls(
            query=result.query,
            retrieved_chunk_ids=list(result.retrieved_chunk_ids),
            precision_at_k=result.precision_at_k,
            recall_at_k=result.recall_at_k,
            reciprocal_rank=result.reciprocal_rank,
        )


class EvalReportResponse(BaseModel):
    case_results: list[EvalCaseResultResponse]
    mean_precision_at_k: float
    mean_recall_at_k: float
    mean_reciprocal_rank: float

    @classmethod
    def from_report(cls, report: EvalReport) -> EvalReportResponse:
        return cls(
            case_results=[EvalCaseResultResponse.from_result(r) for r in report.case_results],
            mean_precision_at_k=report.mean_precision_at_k,
            mean_recall_at_k=report.mean_recall_at_k,
            mean_reciprocal_rank=report.mean_reciprocal_rank,
        )
