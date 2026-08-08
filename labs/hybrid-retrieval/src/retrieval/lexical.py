from __future__ import annotations

import math
from collections import Counter
from collections.abc import Sequence

from .models import Chunk
from .tokenize import tokenize


class BM25Index:
    """Okapi BM25 lexical scoring over a corpus of chunks.

    Vector search finds semantically related passages but can miss exact
    terms, IDs, and rare vocabulary. BM25 catches exactly those: it scores
    a document higher for containing a rare query term many times,
    normalized by document length so long documents don't win purely by
    repeating words.
    """

    def __init__(self, *, k1: float = 1.5, b: float = 0.75) -> None:
        self._k1 = k1
        self._b = b
        self._doc_term_counts: dict[str, Counter[str]] = {}
        self._doc_lengths: dict[str, int] = {}
        self._doc_freq: Counter[str] = Counter()
        self._avg_doc_length = 0.0

    def build(self, chunks: Sequence[Chunk]) -> None:
        self._doc_term_counts.clear()
        self._doc_lengths.clear()
        self._doc_freq.clear()

        for chunk in chunks:
            tokens = tokenize(chunk.text)
            counts = Counter(tokens)
            self._doc_term_counts[chunk.id] = counts
            self._doc_lengths[chunk.id] = len(tokens)
            for term in counts:
                self._doc_freq[term] += 1

        self._avg_doc_length = (
            sum(self._doc_lengths.values()) / len(self._doc_lengths) if self._doc_lengths else 0.0
        )

    def _idf(self, term: str) -> float:
        n = len(self._doc_term_counts)
        df = self._doc_freq.get(term, 0)
        return math.log((n - df + 0.5) / (df + 0.5) + 1)

    def score(self, query: str, chunk_id: str) -> float:
        counts = self._doc_term_counts.get(chunk_id)
        if counts is None:
            return 0.0

        doc_length = self._doc_lengths[chunk_id]
        length_norm = 1 - self._b + self._b * doc_length / (self._avg_doc_length or 1)

        score = 0.0
        for term in tokenize(query):
            freq = counts.get(term, 0)
            if freq == 0:
                continue
            idf = self._idf(term)
            denom = freq + self._k1 * length_norm
            score += idf * (freq * (self._k1 + 1)) / denom
        return score

    def rank(self, query: str) -> list[tuple[str, float]]:
        scored = [(chunk_id, self.score(query, chunk_id)) for chunk_id in self._doc_term_counts]
        positive = [(chunk_id, s) for chunk_id, s in scored if s > 0]
        positive.sort(key=lambda kv: kv[1], reverse=True)
        return positive
