# Semantic Cache

Companion lab for [Module 4: AI Infrastructure](https://handbook.vinodspattar.in/learn/modules/04-ai-infrastructure/).

**Status: production-shaped.** The cache logic is complete and tested; the embedding model is a
lexical stand-in. Read [What is deliberately simulated](#what-is-deliberately-simulated) before
quoting any number here — the caveat is load-bearing for this lab in particular.

A semantic cache trades correctness for cost, and the similarity threshold is the dial. This lab
measures what that dial actually costs.

## The finding

Sweeping the threshold produces two curves. Hit rate is the one that gets reported. **False-hit
rate** — a wrong cached answer, served fast, downstream indistinguishable from a right one — is the
one that decides whether the cache is a saving or a correctness bug.

```
thresh  hit rate  false-hit  precision  true  false  miss
  0.99     0.00%      0.00%    100.00%     0      0     9
  0.95     0.00%      0.00%    100.00%     0      0     9
  0.90    22.22%     22.22%      0.00%     0      2     7
  0.85    44.44%     44.44%      0.00%     0      4     5
  0.80    55.56%     44.44%     20.00%     1      4     4
  0.60    88.89%     55.56%     37.50%     3      5     1
```

At **every** threshold that serves anything at all, precision is below 100%. Tightening until the
wrong answers disappear removes every right one too. There is no safe operating point on this
corpus.

The reason is that the two distributions are *inverted*, not merely overlapping:

| | Similarity range |
| --- | --- |
| Genuine paraphrases — *should* hit | 0.45 – 0.83 |
| Near-duplicates with different answers — *must not* hit | 0.60 – 0.91 |

"What is the refund policy for **EU** customers?" and "...for **US** customers?" score **0.875**
against each other. "How **do** I reset my password?" and "How **can** I reset my password?" score
0.833. The pair that must never be conflated is more similar than the pair that should be.

## Why, and how much of it is the simulation

The mechanism: **the token carrying the semantic difference is the short, low-weight one.** `EU` vs
`US`, `2025` vs `2026`, `Pro` vs `Team`, `free` vs `paid` — one token out of eight, swamped by the
long shared framing around it. Meanwhile paraphrases differ in function words, which are a larger
fraction of a short question.

How much is artefact: **a real dense embedding model would separate these groups better than the
lexical proxy in `embedding.py` does**, and the inversion would likely soften to an overlap. The
specific thresholds here should not be ported anywhere. What survives the change of model is the
mechanism — entity swaps are a known hard case for dense embeddings too — and therefore the
engineering conclusion:

> **A tighter threshold is not the fix.** The fix is detecting that two questions differ on an
> entity that changes the answer. Threshold tuning trades one error for the other; it cannot
> eliminate both, and on some corpora it cannot find any usable point at all.

And the portable process point: you cannot inherit a threshold. It is a property of your corpus and
your embedding model together, and the only way to know yours is to build a labelled set of
near-duplicates and measure both curves.

## What it implements

| Piece | What it does |
| --- | --- |
| `embedding.py` | Deterministic lexical embedding — reproducible, no network |
| `cache.py` | Exact tier, semantic tier, scope key, TTL |
| `corpus.py` | Paraphrase pairs and near-duplicate pairs, each with its correct answer |
| `evaluation.py` | Threshold sweep reporting hit rate, false-hit rate, and precision |

The scope key is the other half of the lab. A cached answer is an answer *from a particular model,
under a particular prompt version, for a particular tenant*. Tests pin that changing any of the
three misses — the prompt version being the one people forget, because prompts get edited far more
often than models change.

Scope is filtered **before** the similarity search, not after. Filtering afterwards means the
nearest neighbour was already read out of another tenant's data.

## Run it

```bash
uv venv .venv && uv pip install --python .venv/bin/python -e '.[dev]'
./.venv/bin/python -m ruff check . && ./.venv/bin/python -m mypy src && ./.venv/bin/python -m pytest -q
```

15 tests, `ruff` clean, `mypy --strict` clean.

## What is deliberately simulated

- **The embedding model.** Lexical, not learned. This is the big one, and its effect on the headline
  result is discussed above rather than buried.
- **The LLM.** Nothing is called. Answers are opaque labels, so a "wrong answer" is unambiguous —
  which is what makes false hits countable at all.
- **Storage.** In-memory, single process, linear scan over entries. No ANN index, so nothing here
  exercises the recall loss a real vector index introduces on top of the threshold problem.
- **Eviction.** TTL only. No size bound, no LRU, no memory pressure.
- **Cost.** Not modelled. The lab measures the correctness side of the trade; the savings side is
  arithmetic you can do from your own hit rate and token prices.

## Exercises

1. **Build the entity-swap detector.** Extract the tokens that differ between query and candidate
   and refuse the hit when any of them is a named entity, number, or date. Then re-run the sweep and
   see whether a usable operating point appears.
2. **Swap in a real embedding model.** Keep the corpus, replace `embed()`, and re-measure. Report
   whether the inversion becomes an overlap — and whether any threshold now gets precision to 100%.
3. **Add the cost side.** Give a cache miss a token cost and a false hit a business cost, then find
   the threshold that minimises total cost. That number, not hit rate, is the one to defend.
4. **Break the scope key.** Remove `prompt_version` from `Scope` and find which test catches it.
   Then reason about how long that bug would survive in production before anyone noticed.
