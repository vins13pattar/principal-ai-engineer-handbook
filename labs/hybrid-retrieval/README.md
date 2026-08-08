# Hybrid Retrieval and Evaluation Lab

**Status: `production-shaped`** — the retrieval pipeline, fusion, reranking, and evaluation harness
are real; the embedding function is a deterministic hashing stand-in rather than a model. See
[What would make this production-ready](#what-would-make-this-production-ready).

A Python 3.12+ lab for learning how retrieval quality is built and measured, not assumed.

## What this demonstrates

- structure-aware chunking that respects section headings and never splits a paragraph unless it alone exceeds the size budget, carrying overlap across chunk boundaries within a section;
- a from-scratch, dependency-free hashed embedding (the "hashing trick") standing in for a real embedding model, so the lab runs with no API keys and no ML dependencies;
- a proper Okapi BM25 lexical index with real IDF over the corpus;
- Reciprocal Rank Fusion combining the lexical and vector rankings by position, not by directly averaging incomparable scores;
- a reranking stage that rescores only the fused candidate set with a combined, normalized signal plus an exact-phrase bonus;
- a groundedness checker that flags citations pointing at chunks the retriever never actually returned;
- a retrieval evaluation harness computing precision@k, recall@k, and mean reciprocal rank over a labeled query set;
- a FastAPI service exposing ingestion, search, groundedness checking, and evaluation;
- deterministic tests for every stage, including an end-to-end check that the demo corpus retrieves perfectly.

The embedding function here is intentionally not a real model call — see [Remaining exercises](#remaining-exercises) for what a production system would swap in.

## Run locally

```bash
cd labs/hybrid-retrieval
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
uvicorn retrieval.app:app --reload
```

The app starts pre-loaded with a small demo corpus (four short documents, each with two headed sections) and a matching eight-case labeled evaluation set.

Search it:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/search \
  -H 'content-type: application/json' \
  -d '{"query": "scoping agent credentials narrowly", "k": 3}'
```

Ingest a new document:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/documents \
  -H 'content-type: application/json' \
  -d '{"document_id": "runbook", "text": "# Incident Response\n\nPage on-call, open a channel, assign an incident commander.\n"}'
```

Check whether an answer's citations are actually grounded in what was retrieved:

```bash
curl -s -X POST http://127.0.0.1:8000/v1/groundedness \
  -H 'content-type: application/json' \
  -d '{"answer": "Bound requests with a semaphore [concurrency#0].", "retrieved_chunk_ids": ["concurrency#0"]}'
```

Run the evaluation harness against the built-in labeled set:

```bash
curl -s "http://127.0.0.1:8000/v1/evaluate?k=3"
```

## Verify quality

```bash
pytest
ruff check .
mypy src
```

GitHub Actions runs these checks for changes under `labs/hybrid-retrieval`.

## Architecture

```text
Document text
  |
chunk_document()          -- heading-aware paragraph grouping, sentence-level
  |                           splitting only when a paragraph alone overflows
  v
Chunk[]  --------------------------+
  |                                |
embed()                        BM25Index.build()
  |  (hashed TF vector)            |  (real IDF over the corpus)
  v                                v
RetrievalIndex.search(query)
  |-- lexical ranking  (BM25, top fetch_k)
  |-- vector ranking   (cosine similarity, top fetch_k)
  |-- reciprocal_rank_fusion()             -- combine by rank, not raw score
  |-- rerank()          -- normalized BM25 + cosine + phrase bonus, top k
  v
SearchResult[]  -> groundedness / evaluation
```

## Why hashed embeddings instead of a real model

A real embedding model call needs an API key, network access, and a service that can't be relied on in a deterministic test suite. The hashing trick — hash each token into one of a fixed number of buckets and count — captures term overlap with no learned vocabulary at all. It is not semantically aware (no synonyms, no paraphrase understanding), and it is here specifically so this lab's retrieval *pipeline* — fusion, reranking, evaluation — is runnable and testable end-to-end without a dependency this handbook cannot guarantee you have. Swapping in a real embedding model changes exactly one function: `vectorize.embed`.

## Why precision and recall are reported separately

A retriever tuned purely for precision can be too conservative and miss relevant passages; one tuned purely for recall can flood the context window with noise the model has to sort through. Reporting only one number hides which failure mode a change actually produced. Mean reciprocal rank adds a third view: it rewards getting *any* relevant passage near the top, which matters most when a single well-placed citation is enough for a correct answer.

## Principal-level discussion points

1. Fusing rankings by position (RRF) rather than averaging raw scores sidesteps the problem that BM25 and cosine similarity live on incomparable scales — there is no principled way to average them directly.
2. A reranker earns its cost by only running on a small fetched candidate set, not the whole corpus; the "cheap first pass, precise second pass" pattern shows up everywhere retrieval meets a latency budget.
3. Groundedness-by-citation-membership is a cheap, reliable check for outright fabricated references. It does not verify the cited passage actually supports the specific claim next to it — that needs a stronger check, typically another model call, layered on top.
4. Chunking decisions are retrieval decisions: a chunk boundary that splits a definition from its explanation makes both halves individually less retrievable, no matter how good the ranking is afterward.
5. An evaluation harness only tells you what its labeled set covers. A retriever that scores perfectly on eight hand-picked queries can still fail on the long tail of real ones — the harness is a regression guard, not proof of production quality.

## What would make this production-ready

The pipeline — chunking, dual retrieval, rank fusion, reranking, groundedness checking, and the
evaluation harness — is complete and tested. What is simulated is the *semantic* component.

| Simulated here | Production needs |
| --- | --- |
| `vectorize.embed`, a hashed-feature stand-in | A real embedding model, called behind the same interface |
| Heuristic reranker (normalized signals + phrase bonus) | A cross-encoder scoring `(query, chunk)` pairs directly |
| In-memory chunk store and BM25 index | A vector database and search engine, with incremental index updates |
| Citation-membership groundedness check | Claim-level entailment, not just "was this chunk retrieved" |

### What the hashing trick does and does not demonstrate

The embedding function is deterministic feature hashing, not a model. It is genuinely useful for
what this lab teaches — it exercises the vector-retrieval *path*, makes every test reproducible
with no API keys, and keeps fusion and reranking honest because their inputs really are two
different ranking signals.

It demonstrably does **not** provide semantic similarity. Hashed features match on shared tokens,
so a query and a chunk that mean the same thing in different words score near zero. Any conclusion
of the form "vector search found the paraphrase" is not something this lab can support. That is
precisely why the evaluation harness matters: swapping in a real embedding model should move
precision and recall on the labeled set, and if it does not, the retrieval path is wrong somewhere
else.

## Remaining exercises

- Replace `vectorize.embed` with a real embedding model API call, keeping the rest of the pipeline unchanged.
- Replace the heuristic reranker with a cross-encoder model that scores (query, chunk) pairs directly.
- Add an incremental index update instead of rebuilding BM25 on every `add_document` call.
- Persist chunks, embeddings, and the BM25 index in a real vector database and search engine instead of in-memory dictionaries.
- Extend groundedness checking with a claim-level entailment check, not just citation-membership.
- Grow the labeled evaluation set and track metrics over time as a regression suite, the way the other labs' test suites guard their own behavior.
