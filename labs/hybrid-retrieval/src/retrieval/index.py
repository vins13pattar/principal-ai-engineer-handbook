from __future__ import annotations

from .chunking import chunk_document
from .fusion import reciprocal_rank_fusion
from .lexical import BM25Index
from .models import Chunk, SearchResult
from .reranker import rerank
from .vectorize import cosine_similarity, embed


class RetrievalIndex:
    """Ingests documents and answers hybrid, reranked searches over them.

    The search pipeline has three stages: two independent cheap rankings
    (BM25 and cosine similarity) are fused by rank position, then the
    fused candidate set is rescored precisely by the reranker. Each stage
    only does expensive work on a shrinking set of candidates.
    """

    def __init__(self, *, max_chars: int = 800, overlap_chars: int = 100) -> None:
        self._max_chars = max_chars
        self._overlap_chars = overlap_chars
        self._chunks: dict[str, Chunk] = {}
        self._embeddings: dict[str, list[float]] = {}
        self._bm25 = BM25Index()

    def add_document(self, document_id: str, text: str) -> list[Chunk]:
        chunks = chunk_document(
            document_id, text, max_chars=self._max_chars, overlap_chars=self._overlap_chars
        )
        for chunk in chunks:
            self._chunks[chunk.id] = chunk
            self._embeddings[chunk.id] = embed(chunk.text)
        self._bm25.build(list(self._chunks.values()))
        return chunks

    def get(self, chunk_id: str) -> Chunk | None:
        return self._chunks.get(chunk_id)

    def search(self, query: str, *, k: int = 5, fetch_k: int = 20) -> list[SearchResult]:
        if not self._chunks:
            return []

        lexical_ranking = [chunk_id for chunk_id, _ in self._bm25.rank(query)][:fetch_k]

        query_vector = embed(query)
        vector_ranking = sorted(
            self._embeddings,
            key=lambda chunk_id: cosine_similarity(query_vector, self._embeddings[chunk_id]),
            reverse=True,
        )[:fetch_k]

        fused = reciprocal_rank_fusion([lexical_ranking, vector_ranking])
        candidate_ids = [chunk_id for chunk_id, _ in fused][:fetch_k]
        if not candidate_ids:
            return []
        candidates = [self._chunks[chunk_id] for chunk_id in candidate_ids]

        bm25_scores = {
            chunk_id: score
            for chunk_id, score in self._bm25.rank(query)
            if chunk_id in candidate_ids
        }
        cosine_scores = {
            chunk_id: cosine_similarity(query_vector, self._embeddings[chunk_id])
            for chunk_id in candidate_ids
        }

        reranked = rerank(query, candidates, bm25_scores=bm25_scores, cosine_scores=cosine_scores)
        return [
            SearchResult(chunk=self._chunks[chunk_id], score=score)
            for chunk_id, score in reranked[:k]
        ]
