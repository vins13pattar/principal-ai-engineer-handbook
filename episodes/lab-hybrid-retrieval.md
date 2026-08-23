# Hybrid Retrieval and Evaluation: Fusing by Rank, Not by Faith

_A retrieval pipeline that measures itself — structure-aware chunking, rank-based fusion, bounded reranking, and groundedness checking — turns 'we improved retrieval' from an impression into a number, and the lab is explicit about the one place it fakes it._

- **Source:** [lab:hybrid-retrieval](/build/labs/hybrid-retrieval/)
- **Runtime:** 5:19 · 10 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. A Retrieval Pipeline Built to Be Measured

**Host:** Today we're digging into a retrieval lab that its own authors describe as being built to be measured, not just built to work. The premise is that a pipeline should tell you, in numbers, whether a change to chunking or fusion actually helped, instead of leaving you with a vague sense that the answers seem better. So before we get into the fusion math and the reranking, I want to start with the foundation: what makes this a real engineering artifact instead of a demo you'd throw together in an afternoon?

**Guest:** The tell is in the boring details nobody bothers with in a toy. Chunking here respects section headings and only splits a paragraph if that paragraph alone blows the size budget, with overlap carried across boundaries inside a section, because chunking on a fixed character count is the single most common way to quietly wreck retrieval. Then the lexical side is real Okapi BM25 with IDF computed over the actual corpus, not a keyword filter pretending to be search, and reranking only ever touches the fused candidate set so the expensive scoring function stays affordable. On top of that, groundedness is checked as a retrieval-boundary property, catching citations that point at chunks the retriever never returned, and everything gets scored with precision at k, recall at k, and MRR against a labeled set — so a change produces a number that moved, not just a feeling that it did.

---

## 2. Why You Can't Average BM25 and Cosine Similarity

**Host:** So once you've got BM25 scores and cosine similarities sitting side by side, the obvious move is to normalize both to zero-one and average them. Why doesn't that hold up?

**Guest:** Because they're not just on different scales, they're different kinds of quantity. BM25 is an unbounded sum of IDF-weighted term contributions, so its range shifts with query length and corpus statistics, while cosine is always bounded in negative one to one regardless of query. Whatever normalization you pick only reflects the distribution of the query you tuned it on, so the next query silently breaks it.

**Host:** So Reciprocal Rank Fusion is the answer specifically because it refuses to touch magnitude at all.

**Guest:** Right, it only looks at position — a document ranked second by both retrievers scores the same whether its BM25 score was 4 or 400. That's a real cost, you're throwing away information about how confident each retriever was. But what you buy is a fusion method that behaves the same way query after query, which is worth more than the precision you lose, since the averaging alternative was never consistent to begin with.

---

## 3. The Honesty of a Fake Embedding

**Host:** So let's talk about the embedding side of this vector retriever, because I noticed you're not calling out to an actual model — you're using something called deterministic feature hashing. What is that actually doing, and what does it get you?

**Guest:** It exercises the vector-retrieval code path without needing API keys or ML dependencies, and it keeps fusion honest because BM25 and this hashed vector are genuinely two different ranking signals, not the same thing computed twice. But it's not semantic similarity — it matches on shared tokens, so a query and a chunk saying the same thing in different words will score near zero, which means nothing in this lab supports a claim like 'vector search found the paraphrase.' That's actually the point I want people to take away: the harness itself is the transferable artifact, so swap in a real embedding model and you should watch precision and recall visibly move, and if they don't, you've just found out the problem lives somewhere else in the pipeline.

---

## 4. From Lab Loop to Production Checklist

**Host:** So let's actually close the loop for people who want to try this. You spin up the app, hit slash v1 evaluate to get your baseline precision, recall, and MRR, then go change one thing — shrink the chunk size, or just disable reranking — and run it again. What should they expect to see, and why does that small loop matter more than the numbers themselves?

**Guest:** You'll see the metrics move either way, but for different reasons: chunking is a retrieval decision, not a preprocessing detail, so getting it wrong degrades every downstream stage, often invisibly, while reranking works on the small fused candidate set and is supposed to clean up the top of the list. The point isn't the specific numbers on a four-document toy corpus, it's that you now have a mechanical way to ask 'did that change help' instead of eyeballing a few search results and declaring victory. And that's exactly the habit the enterprise RAG architecture insists on at production scale too — it lists continuous evaluation on a labeled set and groundedness rate as the only real detectors for retrieval failures that are otherwise silent, because a system can serve confident, well-formatted, completely wrong answers all day with no error in your logs. This lab is the small, honest version of that discipline: the same loop, the same instinct to measure rather than believe, just without the traffic and the stakes yet.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A live demonstration of swapping in a real embedding model and observing the precision/recall delta
- A detailed walkthrough of the async-ai-gateway's Redis atomicity fix as a parallel case study
- Specific numeric results from running the eight-case labeled evaluation set
