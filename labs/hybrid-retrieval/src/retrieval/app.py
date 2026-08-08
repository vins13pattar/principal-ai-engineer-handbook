from __future__ import annotations

from fastapi import FastAPI

from .api_models import (
    ChunkResponse,
    EvalReportResponse,
    GroundednessRequest,
    GroundednessResponse,
    IngestRequest,
    SearchRequest,
    SearchResultResponse,
)
from .demo import build_demo_eval_cases, build_demo_index
from .evaluation import evaluate
from .groundedness import check_groundedness

index = build_demo_index()
demo_eval_cases = build_demo_eval_cases()

app = FastAPI(title="Hybrid Retrieval and Evaluation Lab", version="0.5.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/documents", response_model=list[ChunkResponse], status_code=201)
async def ingest_document(request: IngestRequest) -> list[ChunkResponse]:
    chunks = index.add_document(request.document_id, request.text)
    return [ChunkResponse.from_chunk(c) for c in chunks]


@app.post("/v1/search", response_model=list[SearchResultResponse])
async def search(request: SearchRequest) -> list[SearchResultResponse]:
    results = index.search(request.query, k=request.k)
    return [SearchResultResponse.from_result(r) for r in results]


@app.post("/v1/groundedness", response_model=GroundednessResponse)
async def groundedness(request: GroundednessRequest) -> GroundednessResponse:
    report = check_groundedness(request.answer, frozenset(request.retrieved_chunk_ids))
    return GroundednessResponse.from_report(report)


@app.get("/v1/evaluate", response_model=EvalReportResponse)
async def run_evaluation(k: int = 5) -> EvalReportResponse:
    report = evaluate(index, demo_eval_cases, k=k)
    return EvalReportResponse.from_report(report)
