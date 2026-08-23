### 1. Why direct provider calls don't scale to production

**Host:** Let's start with the simplest possible setup: your application just calls the LLM provider directly. What actually goes wrong with that?

**Guest:** You inherit every one of that provider's failure modes with zero protection. If the provider gets slow, every single one of your requests gets slow right along with it. If it goes down, you're down — fully, with no fallback. And if you've got multiple callers sharing that upstream quota, one tenant's traffic spike can quietly starve everyone else sharing the pipe.

**Host:** So the fix is putting a gateway in front of all that. What does it actually have to guarantee to be worth the added complexity?

**Guest:** It has to protect itself, protect the providers behind it, and give every tenant a fair, isolated slice of capacity — all without becoming harder to operate than the problem it's solving. Concretely that means bounded latency under load, so a caller gets a fast honest rejection instead of hanging forever, bounded blast radius so one bad provider or noisy tenant can't take everyone else down, and it has to scale horizontally and drain safely on redeploy. That's the bar we'll be building against for the rest of this.

### 2. The order of operations is the architecture

**Host:** You said the order of operations is the architecture, not an implementation detail. Walk me through what that actually looks like inside the code, because I think people assume request handling is just 'try the thing, catch errors.'

**Guest:** Look at generate() in the gateway: it calls _admit() first, and inside _admit, rate limiting happens before the semaphore acquire. That ordering matters because a rejected-for-quota request should never occupy a concurrency slot — that's capacity a legitimate request needed. Then once admitted, the whole retry loop sits inside a single asyncio.timeout wrapping every attempt, not one timeout per attempt, so a caller's 15-second budget is a budget for the entire operation, retries included, not 45 seconds nobody asked for.

**Host:** And what happens to that concurrency slot if something inside the loop blows up — a timeout, a cancellation, a raw exception?

**Guest:** That's why the capacity release lives in a finally block wrapping the whole timeout context — it fires no matter how you exit, success, exception, or cancellation. Skip that and you get leaked semaphore slots, which is exactly the leaked-resources failure mode you want to design against. It's a small detail, but it's the difference between the code doing what the architecture intends and it quietly drifting from it.

### 3. The hard failure: a provider that's slow, not down

**Host:** So a provider throwing errors is almost the easy case — you can see it, route around it. What's the scenario that actually breaks people?

**Guest:** It's the provider that stays up but gets slow. Nothing fails, no exception to catch, but every request routed there starts dragging. That's why health-aware selection tracks latency, not just error rate — a technically successful response that's too slow is still a failure from the caller's perspective, and you want that provider deprioritized before it drags down everything else.

**Host:** And that's where circuit breaking and jittered retries come in, right? Because the naive fix — just retry harder — is the wrong instinct.

**Guest:** Exactly, immediate synchronized retries across many concurrent requests just amplify the outage — that's why retries use random jitter instead of a fixed backoff, and why past a failure threshold the circuit breaker stops retrying and fails fast. Same logic applies to the Redis dependency behind rate limiting: if it goes down you either fail closed and protect spend, or fail open with a tighter local limit and protect availability — but you pick one explicitly. The actual failure mode to design against is doing neither, hanging on a Redis call with no timeout and taking the whole gateway down with it.

### 4. Stateless replicas and the state that secretly isn't

**Host:** So you scale the gateway horizontally, spin up more replicas to handle load — and that's exactly when the rate limiter quietly stops working. Walk me through what breaks.

**Guest:** The in-process token bucket is per-replica state, but it thinks it's the whole truth. If you run multiple replicas behind a load balancer, each replica independently enforces the same limit, so the tenant's real effective quota becomes replica_count times their real limit. Nobody set that limit — it just fell out of how many pods happened to be running that day.

**Host:** Which means your quota isn't a business decision anymore, it's an infrastructure accident. So the fix is moving that state out to Redis — but you were just telling me Redis going down is a designed failure mode in itself.

**Guest:** Exactly, and that's the trade you're actually making, not avoiding. The lab's Redis limiter does refill-and-consume atomically in one Lua script so concurrent replicas can't race each other into oversubscribing the bucket — that solves the correctness problem cleanly. But now enforcement has an external dependency, and you're right back to the fail-open-versus-fail-closed decision, deliberately, deciding what enforcement does when Redis itself becomes unavailable instead of pretending the new dependency can't fail.

### 5. Graceful draining and the demo-versus-real identity split

**Host:** So walk me through the other half of production reliability that nobody thinks about until a deploy goes sideways: what actually happens when SIGTERM lands mid-request?

**Guest:** The lab's draining.py has each request register itself as active on entry and deregister in a finally block, so completion is tracked no matter how the request ends. Drain flips a readiness flag to false so the load balancer stops sending new traffic, then waits, bounded by a timeout, for the active count to hit zero. If that timeout fires first, drain returns false explicitly — you get a checkable record that some requests were forcibly cut off, instead of a silent process kill with no idea what was lost.

**Host:** That's a clean way to make shutdown honest instead of hopeful. Now, separately — I noticed the lab ships two apps, one with just a header for tenant identity and one with real JWT verification. Isn't that a security hole?

**Guest:** It would be if anyone deployed it that way, which is exactly why the docs are blunt about it — the unauthenticated x-tenant-id path exists so you can run bounded concurrency, deadlines, retries, and health-aware routing without also standing up an identity provider just to see the demo work. The secure_app is the one to actually read as the reference: JWT-verified identity, tier-scoped policy at the routing layer, Redis-backed rate limiting shared across replicas. A real deployment collapses these into a single app with the security layer always on — the split is a teaching artifact, not a topology anyone should ship.

### 6. Streaming changes the cost and observability equation

**Host:** So we've talked about the security split and the demo-versus-real deployment question. Let's talk about streaming, because I think people assume streaming is just a UX nicety — smoother typing effect — and not something that touches cost or observability at all.

**Guest:** That assumption falls apart fast at scale. If a user closes the tab three seconds into a ten-second response and the gateway doesn't notice, it keeps pulling tokens from the provider for the full ten seconds — and every one of those tokens is metered, billed compute for a response literally nobody will see. The fix is checking is_disconnected on every chunk, not just once at the start, because a client can vanish at any point in a long stream. And that's not a rounding error either — upstream provider cost is almost always the dominant line item in the whole system, way past whatever Redis or the gateway's own compute costs you, so a lever that stops wasted provider calls has outsized leverage compared to tuning the gateway itself.

**Host:** And presumably you're not just fixing the cost, you're watching for it too — so how does that show up in what you measure?

**Guest:** Right, we track disconnected as its own counter, completely separate from completed, because a rising disconnect rate is a real signal — are responses too slow and people are giving up, or is some client bug closing connections early? A total-requests-served metric would hide that entirely. And alongside it, time-to-first-token gets its own percentile distribution, at p50, p95, and p99, separate from total stream duration — because 'streams start slowly' and 'streams run long' are different problems with different fixes, and collapsing them into one duration number just tells you something's wrong without telling you what.

### 7. What a real deployment checklist and a fake CI job teach about production readiness

**Host:** So we've talked through the architecture piece by piece — what does it actually look like on the day you ship this thing? What's on the checklist before someone hits deploy?

**Guest:** It's rolling or canary rollout with automatic rollback tied to error-rate and latency SLO breach, and graceful draining wired into the deploy process itself, not just sitting in code somewhere unused. Add pod disruption budgets, topology spread if you're on Kubernetes, secrets pulled from a real secrets manager and rotated on a schedule, and runbooks for provider outage, Redis outage, a tenant quota incident, and general overload. And on-call ownership written down, not assumed — that last one sounds obvious until the outage happens and three people think someone else owns it.

**Host:** That's a good place to end, but I know you've got a story about a checklist that looked satisfied and wasn't — the CI job.

**Guest:** Right, this is the perfect closer because it's the whole episode in miniature. There was a Redis integration job that started a real Redis container, then ran the test suite filtered down to just the redis-marked tests — except the only tests matching that filter were backed by a FakeRedis stub that never opens a socket. So the container sat there untouched, and the job was green whether Redis existed or not, including if it had never started at all. It looked exactly like verification and was actually just decoration. The fix does two things: a real test where two limiter instances hit one Redis with double-capacity concurrent acquires, so swapping the atomic Lua script for a naive get-then-set lets forty through instead of twenty — the test measures the atomicity claim instead of restating it. And it sets a flag so a missing Redis fails the build instead of silently skipping, because skipped tests don't turn anything red, and that's exactly how you get back to vacuously green a second time, just more quietly. That's really the whole thesis of this gateway — every green checkmark, every healthy pod, every completed request is a claim, and the job of the architecture is to make sure those claims are actually true, not just comfortable to believe.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Multi-region deployment specifics and per-region quota consistency (raised only as an open interview question, not an implemented architecture)
- Distributed systems patterns like idempotency keys, vector clocks, and split-brain fencing (Module 2 material, not part of this architecture's own excerpts)
- HTTP/2 vs HTTP/3 head-of-line blocking mechanics (Module 3 material not tied to the gateway architecture excerpts directly)
