# Inside the Async AI Gateway: Reliability, Proof, and Production Gaps

_A tour of the Async AI Gateway lab shows how reliability features are built, how a supposedly rigorous test turned out to be vacuous, and what principal-level judgment calls separate a demo from a real production system._

- **Source:** [lab:async-ai-gateway](/build/labs/async-ai-gateway/)
- **Runtime:** 5:22 · 12 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Two apps, one core: what the gateway actually does

**Host:** Welcome back. Today we're cracking open a lab called the Async AI Gateway, and this one's a great teaching tool because it doesn't just show you the happy path — it shows you where a supposedly solid test turns out to be hollow, and where real engineering judgment has to step in. So let's start with the basics: what are we actually looking at when we open this repo?

**Guest:** So there are two FastAPI apps sitting on top of one shared core called AsyncAIGateway. The first, production\_app, gives you bounded concurrency, deadlines, retries with jitter, health-aware fallback between providers, RED metrics, and OpenTelemetry hooks — it identifies tenants with a simple header so you can run it without standing up an identity provider. Then there's secure\_app, which is everything production\_app has, plus JWT-verified tenant identity, tier-based provider policy, and Redis-backed rate limiting that's shared correctly across replicas. That second one is really the reference for what a real deployment should look like.

**Host:** Why split them at all instead of just shipping one app with security always on?

**Guest:** Purely pedagogical — it keeps the identity and quota layer legible on its own instead of threading JWT checks through every single reliability example. In production you'd collapse them into one app with security always on. And it's genuinely easy to poke at locally: you set up the virtualenv, pip install the extras, run uvicorn on production\_app, and you can curl the generate endpoint with a tenant header, or just run docker compose up and get the gateway, Redis, and an OpenTelemetry collector all wired together at once.

---

## 2. The Redis test that was green for the wrong reason

**Host:** Okay, so let's talk about the part of this lab that I think is the most humbling story: the Redis integration job that was green for months and testing basically nothing. What was actually going on there?

**Guest:** So the CI job would spin up a real Redis service container, then run pytest with a filter, dash-k redis, to select the relevant tests. The problem is the only tests matching that filter were backed by a FakeRedis stub — an in-memory fake that returns canned answers and never opens a socket. The container just sat there unused, and the job was green whether Redis existed or not.

**Host:** So it would have passed even if the container had never started at all. How do you even catch that kind of thing, and what did the fix look like?

**Guest:** Right, that's the scary part — it's a passing test with zero signal. The fix was a new test file that actually talks to a live server: two limiter instances sharing one Redis, and you fire two times capacity acquires concurrently at a single tenant. Exactly capacity should succeed, and if you swap the atomic Lua script for a naive HGET-then-HSET, you watch 40 of 40 get through where the atomic version correctly allows only 20 — so the test measures the atomicity claim instead of just restating it. We also set REDIS\_INTEGRATION\_REQUIRED equals 1, so a missing REDIS\_URL fails the build instead of quietly skipping, because skipped tests don't turn anything red and the job could go vacuous again just as silently.

---

## 3. Where the demo still falls short of production

**Host:** Okay, so the test is fixed and honest now. But zoom out — what does this lab actually teach about the gap between a working demo and something you'd trust in production?

**Guest:** A bunch of things that look like nitpicks but aren't. Semaphores cap concurrent work, token buckets cap arrival rate, and you actually need both enforced at different points, not one standing in for the other. Then there's the atomicity point we just proved — naive GET-then-SET against Redis lets 40 through at a capacity of 20, only the Lua script gets it right. And health-based routing has a nasty feedback loop hiding in it: score a provider unhealthy, starve it of probe traffic, and it can never prove it recovered, so you need decay and caps on those adjustments. Streaming makes this worse because once a partial response has hit the client you can't silently retry — the caller's already rendering it. And readiness versus liveness is the one that bites people in rollouts: readiness says can this pod safely take traffic, liveness says should this process be restarted, and conflating them means your rolling deploy kills pods that were just draining correctly.

**Host:** So none of that is fixed in this lab yet — it's sitting in the readiness doc as known work, not something someone forgot.

**Guest:** Exactly, that's the point of tracking it in the production readiness document instead of pretending it's done — unchecked items are deliberate gaps across correctness, reliability, observability, tenancy, capacity, delivery. That's the principal-level habit this whole lab is really modeling: distinguish what you've actually verified, like that Redis test now does, from what you've simply not broken yet. Demo versus production is exactly that line.
