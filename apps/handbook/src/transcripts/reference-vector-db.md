### 1. It's not storage — it's a search category

**Host:** So let's start with the phrase everyone throws around: vector database. I think most people hear that and picture a database that stores embeddings, basically a fancy filing cabinet for vectors. Is that actually right?

**Guest:** It's the most common misconception, and it undersells the whole thing. A vector DB is a search system for high-dimensional vectors — given a query vector, it returns the nearest ones fast, approximately. Storage is the least interesting part of it, and honestly hasn't been the differentiator in a long time. And here's the other thing: there's no single 'vector DB version' to point to. It's a category, not a product — index implementations differ enough between vendors that what sounds like a portable claim often isn't. We'll use Pinecone's 2026-04 API as a concrete anchor when we need one, but the concepts are vendor-neutral.

**Host:** Okay so if it's a search category, what's actually being searched? I keep hearing about dense vectors and lexical search like they're competing approaches.

**Guest:** They used to be treated as separate paths — embeddings go into a vector index for ANN search, while raw text goes into a lexical or full-text index for keyword search. But the category is converging: platforms increasingly fuse both into hybrid retrieval, then rerank before handing off context. Pinecone's full-text search preview is a good signal of that — in July 2026 it picked up fuzzy matching and n-gram substring search, which tells you where this is headed: the vector store is becoming the retrieval layer, not just the vector layer.

### 2. The vocabulary that actually determines behavior

**Host:** Okay, so before we go further, let's nail down the vocabulary, because I think this is where people's mental models get fuzzy. Start with the basics — dense versus sparse, and then this ANN thing everyone name-drops.

**Guest:** Dense means an embedding, a vector — similarity there is geometric, so meaning-adjacent text scores highly even if the words don't match. Sparse or lexical is term-based, so exact identifiers, codes, and rare words that embeddings tend to blur actually live there. ANN, approximate nearest-neighbor, is the index structure that makes searching millions of dense vectors fast — it trades perfect recall for speed, and the tuning knobs for that tradeoff vary a lot by vendor. On top of that you've got two things fixed at index creation time that people don't realize are permanent: the similarity metric — cosine, dot product, or Euclidean, which has to match how the embedding model was actually trained — and the embedding dimension, so if you swap models later, you're not updating an index, you're building a new one.

**Host:** So those two are basically load-bearing walls you can't move after the fact. What about the knobs people actually touch at query time — top-k, filtering, namespaces, reranking?

**Guest:** Top-k is how many candidates come back, and it's really a recall ceiling — if the right document isn't in that returned set, no amount of clever reranking downstream saves you. Metadata filtering restricts candidates by tenant, ACL, source, or recency, and critically it's evaluated as part of the search itself, not as a filter bolted on after. Namespace is your partition within an index, usually the unit of tenant isolation, and reranking is a stronger model re-scoring that shortlist afterward — often served by the platform itself now rather than something you bolt on separately.

### 3. The numbers that bite: versioning, fixed choices, and latency

**Host:** Let's get concrete, because I feel like this is where teams get burned in production. You mentioned Pinecone has date-based API versioning — walk me through why that's not just a footnote.

**Guest:** So Pinecone ships a new stable API version quarterly, and each one is supported for at least twelve months, which gives you roughly nine months of overlap to migrate. Current stable is 2026-04, and you're supposed to send that explicitly as a header. The trap is what happens if you don't: an unversioned call doesn't default to the newest version, it falls back to the oldest supported stable one — so silently, you're pinned to the past, not the present.

**Host:** That's a nasty default. What are the other choices that quietly lock you in, ones you don't get a do-over on?

**Guest:** Embedding dimension and similarity metric are both fixed the moment you create the index. Change your embedding model down the line and that's not a config tweak, it's a full reindex of your entire corpus. And if the similarity metric doesn't match what the embedding model was trained for, you don't get an error — you get results that are wrong but not obviously wrong, which is worse. On top of that, don't assume index type either, since 'all vector databases use HNSW' is false and tuning advice doesn't port between vendors. And the latency gotcha nobody budgets for is reranking — ANN search plus filtering plus network is often smaller than that final rerank pass.

### 4. Where teams actually get burned

**Host:** Let's get concrete about the war stories. What's the failure mode that keeps showing up when teams put multi-tenant data into one of these systems?

**Guest:** The filtering-after-retrieval trap. If the tenant filter isn't part of the actual ANN query, the system has already read another tenant's documents in the traversal and is just deciding afterward whether to show them to you. That's not a filter, that's a leak that happened to not surface this time — and restrictive filters have their own version of this problem, where they interact badly with the approximate index and quietly return way fewer than k results, or worse ones, unless you actually measure recall with your real filters applied.

**Host:** And the deletes issue — walk me through why that one's so insidious compared to a normal bug.

**Guest:** Because it doesn't fail loudly, it fails convincingly. A document gets removed at the source, nobody removes it from the index, and it keeps getting retrieved and cited as if it's current — the system isn't broken, it's confidently wrong. Pair that with people assuming 'approximate' is just a performance knob rather than a stated tradeoff, or copying another vendor's tuning advice wholesale, and you get the same pattern every time: it looks like it's working until someone checks.

### 5. The store inside the bigger system

**Host:** So if the vector DB isn't the whole story, where does it actually sit? Because everything we've talked about — the ANN math, the fixed choices, the fragile syncing — feels like it's solving one piece of a much bigger puzzle.

**Guest:** It's the retrieval half of a RAG pipeline, and the crucial thing people miss is that retrieval quality and answer quality get measured separately — a wrong answer should be traceable to a document, not a mystery. The vector store is doing candidate retrieval; there's still chunking, hybrid search, reranking, and access control sitting around it, and those are architecture decisions, not store features. So 'just add a vector DB' undersells the job — you're really building a retrieval system, and the store is just the piece that happens to do the ANN search.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Benchmark comparisons between specific vector DB vendors' throughput or cost
- A walkthrough of setting up a live Pinecone index or writing queries against it
