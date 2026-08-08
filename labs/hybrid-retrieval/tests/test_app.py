from __future__ import annotations

import httpx
import pytest

from retrieval.app import app


def client() -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_health() -> None:
    async with client() as c:
        response = await c.get("/health")
    assert response.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ingest_document_returns_created_chunks() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/documents",
            json={
                "document_id": "test-doc",
                "text": "# Heading\n\nSome content about caching strategies.\n",
            },
        )
    assert response.status_code == 201
    [chunk] = response.json()
    assert chunk["id"] == "test-doc#0"
    assert chunk["heading"] == "Heading"


@pytest.mark.asyncio
async def test_search_returns_ranked_results() -> None:
    async with client() as c:
        await c.post(
            "/v1/documents",
            json={
                "document_id": "search-test",
                "text": (
                    "# Topic\n\nRetrieval augmented generation grounds answers "
                    "in retrieved evidence.\n"
                ),
            },
        )
        response = await c.post(
            "/v1/search", json={"query": "grounding answers in retrieved evidence", "k": 3}
        )
    results = response.json()
    assert results
    assert results[0]["chunk"]["document_id"] == "search-test"


@pytest.mark.asyncio
async def test_groundedness_endpoint_flags_ungrounded_citation() -> None:
    async with client() as c:
        response = await c.post(
            "/v1/groundedness",
            json={
                "answer": "Bound requests with a semaphore [concurrency#0] and check [mcp#0].",
                "retrieved_chunk_ids": ["concurrency#0"],
            },
        )
    body = response.json()
    assert body["is_fully_grounded"] is False
    assert body["ungrounded_chunk_ids"] == ["mcp#0"]


@pytest.mark.asyncio
async def test_evaluate_endpoint_reports_perfect_retrieval_on_the_demo_corpus() -> None:
    async with client() as c:
        response = await c.get("/v1/evaluate", params={"k": 3})
    body = response.json()
    assert body["mean_reciprocal_rank"] == 1.0
    assert len(body["case_results"]) == 8
