### 1. The core mechanism: racing size against timeout

**Host:** So today we're digging into dynamic batching for inference serving, and the whole thing hinges on one deceptively simple trick: a batch closes when either it fills up or a timeout hits, whichever comes first. Why not just pick one of those and call it a day?

**Guest:** Because each one alone breaks in an opposite way. If you only trigger on size, a lone request arriving during a quiet stretch just sits there waiting for company that may never show up, so your latency is unbounded. If you only trigger on a timeout, you're safe on worst-case wait, but under heavy load you're closing tiny batches every few milliseconds when you could've packed in way more work per GPU pass.

**Host:** So racing them means you get the throughput win when traffic is heavy and the size trigger fires first, but you still cap the pain when traffic is sparse and the clock runs out instead.

**Guest:** Exactly, and that cap is a real number you control, the max wait time in seconds — it's the worst case any single request can be stuck waiting on strangers to fill the batch. That's the core mechanism the whole lab builds on, and everything else we'll talk about, canaries, per-version metrics, rollback, all sits on top of this one race.

### 2. Canary rollout as routing, not deploys

**Host:** So once you've got that race dialed in, how do you actually roll out a change to it without risking the whole fleet? I know the lab spins up two versions side by side.

**Guest:** Right, stable-v1 and canary-v2, each with its own batcher, its own queue, its own weight — nine to one in the demo. That isolation matters because canary-v2 can run a totally different batch size and wait time without touching stable's tuning, and critically, the two never share a queue. But the part people get wrong is the metrics: if you blend stable and canary traffic into one aggregate error rate, a canary that's failing badly on its small slice just gets averaged away into noise, and you've defeated the entire point of doing a gradual rollout in the first place.

**Host:** So the whole safety story depends on watching canary-v2's numbers in isolation, not the combined feed. And when something does go wrong, what does pulling it back actually look like?

**Guest:** That's the other piece — promote and rollback are just weight changes, hitting an endpoint to shift traffic, not redeploying anything. That's the difference between rollback taking a second during an incident versus you standing there redeploying the old version while requests keep failing. Cheap rollback is what makes the canary trustworthy, because you'll actually use it under pressure instead of hesitating.

### 3. Why the mean lies and the fixed-cost sleep hides the real curve

**Host:** So if rollback is the safety net, how do you even know when you need it — like what's the actual signal that batching is hurting you rather than helping?

**Guest:** You can't see it in the mean, which is exactly why the lab benchmarks p50, p95, and p99 under bounded concurrency instead of just averaging. A request that lands right after a batch closes sits there for almost the full timeout, while one that lands right before gets swept in immediately — the mean smooths that gap away, but the tail is where the actual user experience lives. If you're only watching the mean, you'll ship a config that looks fine and quietly punishes a chunk of your traffic every cycle.

**Host:** Okay, so the tail tells the truth about latency. But you've also said the lab's cost model has a real blind spot — walk me through that.

**Guest:** The handler just sleeps a fixed duration no matter how many payloads are in the batch, so doubling batch size always halves per-request cost — a clean line that goes forever. Real inference doesn't work that way: cost tracks padded sequence length, so one long sequence in a batch drags every short sequence along to pay for it, and past some point a bigger batch stops paying for itself. That breakeven point is set by the traffic's length distribution, not its rate, which is exactly why the lab hands you a sweep harness instead of a recommended number — the mechanism and the measurement transfer, the curve doesn't.

### 4. A factory, not a singleton — and the bug that proved why

**Host:** So we've got the mechanism, the canary as routing, the honest curve — what's the last piece? You mentioned something about the app itself being built differently than you'd expect.

**Guest:** Right, create\_app builds a fresh router and batchers every time you call it, instead of one shared instance for the whole process — because a DynamicBatcher can't restart once shutdown has run, same as a real batching worker once its background task dies. That's not theoretical: httpx's ASGITransport doesn't drive the lifespan protocol, so in early tests the batcher's background loop never started, and every request to infer just awaited a batch that nothing would ever flush. The suite didn't fail, it hung — which is its own lesson, that a missing lifespan doesn't throw an error, it just quietly starves you, and the fix was making the app a factory and making tests enter the lifespan explicitly rather than assuming it's there.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Comparing this lab's batching mechanism directly against vLLM's continuous batching and PagedAttention implementation details
- Discussing the SLO-driven autoscaling or async gateway labs as alternatives to this lab's rollout mechanism
- Security and multi-tenancy concerns around prompt/completion data in the batching queue
