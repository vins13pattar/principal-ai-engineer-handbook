# Cheat Sheet: Design Review

_Reviewing someone else's design well is a disciplined sequence, not a gut reaction — read constraints first, spend attention where reversal is expensive, and separate blocking from non-blocking so the feedback actually lands._

- **Source:** [cheatsheet:design-review](/cheatsheets/sheets/design-review/)
- **Runtime:** 5:08 · 10 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. When to use it, and the order that makes a review worth an hour

**Host:** So today's cheat sheet is Design Review, and I want to be really clear upfront about which side of the table we're sitting on. This isn't about how to present your own design well — that's a different sheet, Design Round, go find that one if that's your problem this week. Today we're the ones with the document in front of us and an hour on the calendar, and we have to figure out where to spend that hour.

**Guest:** Right, and that framing matters more than people think, because reviewing well is a completely different skill from designing well. The sequence we're walking through today exists specifically to stop you from reacting on gut instinct, because gut-reaction review wastes the hour on cheap comments and misses the expensive ones.

**Host:** Give me the shape of that sequence, then, before we dig into each piece.

**Guest:** It's seven steps, and the order is the whole point. You start by reading constraints before the diagram — if they're missing or just adjectives, that's already your finding, stop there. Then you check the requirements actually shape the design, find the single hardest-to-reverse decision since that's where most of the value concentrates, trace one request end to end to catch the seams nobody described, demand a falsifiable claim for anything like 'it will scale,' cover cost and observability last but always since those sections go missing constantly, and finally separate blocking from non-blocking comments explicitly in writing, because mixed together they get treated as either all-optional or all-mandatory.

---

## 2. The tools: questions that find real problems, and how to spend attention

**Host:** Okay, walk me through the actual questions, section by section, because 'check the constraints' is still pretty vague to someone staring at a doc.

**Guest:** Sure — for constraints you're asking peak rps, the p99 target, what 'correct' even means here, whose data it is, and cost per call. For capacity, does arrival rate times latency actually agree with the pool size and replica count they configured, or did someone just pick round numbers. State is about who owns it, what a failure loses, and what happens the moment there's a second replica. Retries need bounded attempts, a bounded total deadline, jitter, and an idempotent handler — miss any one of those and retries become the outage. Failure asks what breaks first at ten times load and what the blast radius is if something's fully compromised. Data is one sharp question: is permission filtering inside the query or bolted on after retrieval, because that's a leak waiting to happen. Quality asks if there's an eval set with a threshold and an owner, or just a latency dashboard pretending to be quality monitoring. And rollout asks if it's reversible in one deploy, and if not, what evidence would actually change the decision.

**Host:** That's a lot of ground — so how do you triage where to actually spend your limited attention across all that?

**Guest:** That's the reversibility sort: config change first, since that's minutes to undo; component swap next, that's roughly a week of pain; data model or tenant boundary changes last, because those aren't a redo, they're a migration, an audit, maybe a disclosure. Spend your attention in that order, not the order the document happens to present things. And once you've found something worth flagging, make the comment land — name the constraint you're reasoning from, state concretely what you predict will fail, and say what evidence would change your mind. A comment with all three parts is hard to wave away and easy to actually act on, which is the whole point of doing the review in the first place.

---

## 3. Red flags — in the design, and in your own reviewing

**Host:** Before we wrap, give me the smell test — what tells you a design is in trouble before you've even done the reversibility sort? And is there a mirror version of that for the reviewer, ways we sabotage our own review?

**Guest:** On the design side: technologies picked before the constraints were written down, capacity described in adjectives like 'fast' or 'scalable' instead of numbers, the model treated as a black box that just returns a string with no evaluation story attached, security that only ever means authentication, and any decision with no stated cost — those are the tells. On the reviewing side, watch yourself for rewriting the design into the one you'd have built, which isn't a review, it's a competing draft; for litigating a two-way door that's cheap to reverse and not even your code to own; for comments with no constraint behind them, which just read as taste and get dismissed as taste; for approving because the prose was clean, since writing quality and design quality don't correlate at all; and for blocking on something without saying how you'd fix it or how you'd know it was fixed, which just stalls the thing instead of improving it. Catch those five and five, and the review does what it's for — it moves the design forward instead of just performing scrutiny on it.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- How to structure the review meeting itself (agenda, who speaks when) beyond the written sequence
- How a design review's findings get converted into an ADR or other permanent record
- Team-specific customization of the checklist for different system types (e.g., RAG vs gateway) — the cheat sheet gives generic questions only
