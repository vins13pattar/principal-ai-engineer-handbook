# System One decision models — content plan

> **Status:** planned, not started. Nothing below exists on the site yet. This is a content plan at
> the level of pages and evidence; each page or lab gets its own task-level plan when it starts.

**Goal:** Cover the decision-model category — models that answer typed questions about a state with
calibrated probabilities instead of generating text — at the handbook's altitude: not "what is
Jev", but where a decision tier belongs in a production AI system, what it buys, and the failure it
introduces that no benchmark on a vendor's launch page will show you.

**Why now:** the category went from one product to four in sixteen days, and the claims around it
are almost entirely vendor-reported. That combination — real architectural consequence, unverified
numbers — is exactly what the handbook is for.

## What the category is (as of 2026-10-08)

| Product           | Who                | Released                             | Shape                                                                                                                    | Weights    | Primary source                                                                                                                            |
| ----------------- | ------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Jev               | TypeSafe AI        | 2026-09-15 (early access)            | Hosted API; text-only; 32k context                                                                                       | Closed     | **Not yet found** — only secondary write-ups so far                                                                                       |
| Laya              | Convai Innovations | 2026-09-18                           | Encoder (ModernBERT-large, 421M; mmBERT 322M multilingual); one forward pass, options scored at `[MASK]` tokens          | Apache-2.0 | [Model card](https://huggingface.co/convaiinnovations/laya)                                                                               |
| Decisions API     | OpenAI             | 2026-09-29 (DevDay, limited preview) | Hosted; specialised GPT-6 Luna; ~150 ms claimed                                                                          | Closed     | **No public schema, endpoint, or pricing** as of 2026-09-30                                                                               |
| Clef / Clef-flash | Cloudflare         | 2026-10-01                           | 27B / 9B on frozen Qwen backbones; prefill-only, choices scored in parallel; multimodal; 64k context; Jev-API compatible | Apache-2.0 | [Launch post](https://blog.cloudflare.com/clef-decision-models/), [model docs](https://developers.cloudflare.com/workers-ai/models/clef/) |

The common request shape (Jev's, adopted by Clef): a `state` plus a map of named `questions`, each
one of three types — `noul` (calibrated yes/no probability), `choice` (one of a labelled set), and
`score` (position on an ordered rubric, which can land between levels).

### What the evidence actually supports — and does not

This section is the reason to write the pages at all, and every page below has to carry it:

- **Every benchmark is run by a competitor.** Cloudflare's latency table (Clef 209 ms, Clef-flash
  39 ms, Jev 524 ms median) is Cloudflare's. Laya's Jev comparison uses third-party Jev numbers it
  did not reproduce. No independent evaluation exists yet.
- **"Cannot hallucinate" is about the output type, not the answer.** A typed answer cannot be
  malformed. It can still be confidently wrong, and the probability attached to it is only useful
  if it is calibrated — which is the claim least supported so far.
- **Calibration is the open question.** Laya's own card says the shipped checkpoints are
  over-confident (mean ECE 0.466, falling to 0.081 only after per-question-type temperature
  fitting) and near chance zero-shot (0.362 against a 0.461 majority-class baseline). Cloudflare
  trains with a Brier term "to refine calibration" and publishes no calibration metric.
- **Known failure shapes already exist.** Laya degrades at high option counts (Banking77, 77
  labels: 0.425), ordinal `score` is its weakest type, and its `noul` answers can follow the option
  labels rather than the state.

## Where it lands in the handbook — four angles, as usual

### 1. Reference lookup: `reference/lookups/decision-models` (first)

The smallest useful page and the one that has to exist before anything links to it. Five sections
per the lookup contract (At a Glance, Key Concepts, Numbers That Matter, Common Gotchas, Where to
Go Deeper).

- `freshness: fast-moving`, with `reviewAfterDays: 30` rather than the default 90 — the category
  changed weekly through September, and an OpenAI API with no published schema will not stay that
  way for three months.
- **Numbers That Matter** carries every figure with who measured it. No figure appears without its
  source in the same row.
- **Common Gotchas** leads with calibration, competitor-run benchmarks, option-count degradation,
  and zero-shot weakness.
- **Blocked on:** a primary source for Jev's API and the three question types. Secondary write-ups
  agree with each other and with Cloudflare's example request, but the handbook does not cite a
  product from its coverage. If TypeSafe's docs stay unfindable, the page says so and describes Jev
  only through what Cloudflare and Laya state about it.

### 2. Learn: one section in Module 4, one in Module 5 (second)

Not a new module. The idea is a tier in an existing architecture, not a new discipline.

- **Module 4 (AI Infrastructure), Deep Dive:** a decision tier between rules and an LLM. The
  argument: most model calls in a production system are not generation — they are routing,
  classification, and gating, and they are paying generation's latency and cost for a bounded
  answer. Cross-link [Task-Based Model Routing](/architecture/systems/task-based-model-routing/):
  a decision model is a router whose output is a probability rather than a label, which is what
  makes "escalate when unsure" implementable at all.
- **Module 5 (Agent Engineering), Failure Modes:** the agent's next-action choice and its
  guardrails as decision questions — and the new failure: a confident wrong probability gates the
  agent exactly as well as a correct one.
- **One embedded interview question in each**, e.g. "Your router is a decision model returning 0.92
  for `billing`. What do you need to know before you let that number skip the LLM?" The answer is
  calibration on your own traffic, not the vendor's benchmark.

### 3. Build: `labs/decision-tier-calibration` (third — after the Module 11 lab)

What makes this the handbook's angle rather than a summary of launch posts: **measure the one
thing nobody has published independently.**

- Run **Laya** locally (Apache-2.0, 421M, runs on CPU at a few hundred milliseconds — no API key,
  no spend, reproducible in CI with a cached checkpoint or a deterministic fake).
- Measure, on a labelled set: accuracy and ECE before and after temperature fitting, per question
  type and per option count.
- Then the production question: sweep the escalation threshold and plot the trade-off — share of
  traffic the decision tier keeps versus error rate on what it keeps. That curve, not a leaderboard
  number, is what decides whether a decision tier pays for itself.
- Clef via Workers AI and Jev as optional adapters behind one port, off by default, so the lab
  never needs a credential to pass CI.
- Lab gates as for every other lab: `ruff`, `mypy --strict` over `src` **and** `tests`, `pytest`;
  tests assert shapes (calibration improves after fitting; error falls as the threshold rises),
  never a vendor's constant.

### 4. Architecture: `architecture/systems/calibrated-decision-tier` (fourth)

Written after the lab, from its evidence, in the usual twelve sections — so twelve labs and twelve
design reviews become thirteen and thirteen together, rather than reopening the criterion again.
Core decisions: where the tier sits, how the threshold is owned and re-fit as traffic drifts, what
gets logged to make calibration measurable in production, and why "type-safe" output is not the
same claim as "safe to act on".

### Then: episodes

Each new content page gets its episode at publish time, so the series does not fall behind again.

## Sequencing against v1.0

v1.0 is waiting on the Module 11 lab and nothing else (the two episodes are in progress). This plan
does not gate v1.0 and should not delay it:

1. **Now:** the Reference lookup and the two module sections — prose, no lab, small.
2. **After the Module 11 lab:** the decision-tier lab, then its architecture page.

## Also due, unrelated to this plan

Eleven fast-moving pages verified 2026-08-08 to 2026-08-30 pass their 90-day review window between
**2026-11-06 and 2026-11-28**, after which CI fails the build. The first three (Enterprise MCP
Platform, Multi-Tenant MCP Server, Module 7) are due 2026-11-06. Schedule the re-verification
before then.

## Open questions for the author

- Name on the site: "System One models" is TypeSafe's coinage and a trademark-adjacent product
  framing; "decision models" is what Cloudflare and Laya call them. Plan assumes the page is titled
  **Decision Models** and mentions "System One" as the term the category launched under.
- Whether to mention the Laya prior-art dispute. Plan: no — it is unresolved, about attribution
  rather than engineering, and not something the handbook can verify.
