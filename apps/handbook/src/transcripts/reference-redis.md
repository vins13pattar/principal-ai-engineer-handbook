### 1. What Redis actually is

**Host:** So most people meet Redis as this thing you shove key-value pairs into to make your app faster, basically a cache with a fancy name. But that's apparently not really the right mental model, is it?

**Guest:** Not even close, and it undersells what makes it useful in AI infrastructure specifically. Redis is a data-structure server — you're not just storing blobs, you're storing hashes, sorted sets, streams, and operating on them with commands that understand their shape. That's what lets it do things like leaderboards or delay queues natively, instead of you reimplementing that logic on top of a dumb key-value store.

**Host:** Okay, but here's the part that sounds like a red flag to me: it's single-threaded. In a world obsessed with concurrency, isn't that a bottleneck?

**Guest:** It sounds like a limitation until you realize what it buys you. Because commands execute one at a time, every single operation is atomic by default — no locks, no race conditions to reason about, no partial updates. That property is exactly why Redis becomes the thing that keeps state correct across replicas in distributed systems, whether that's a rate limiter, an idempotency key, or a lease. And it's not doing this alone — it's got sorted sets for ordered data, streams for durable queues, Lua scripting for bundling multiple commands into one atomic step. That combination is what turns it from 'fast cache' into 'correctness primitive.'

### 2. The atomic toolkit: claims, leases, and idempotency

**Host:** Okay, so let's get concrete. That in-process dict-and-lock idempotency store from the distributed systems module — the one that checks and inserts under a single lock — what does it actually look like once you swap in Redis?

**Guest:** It collapses down to one command: SET key value NX EX n. NX means only set it if it doesn't already exist, so the check-and-insert happens atomically on the server, no lock needed on your end. And the EX gives it a lease — so it's not just an idempotency claim, the exact same primitive is a distributed lock or a lease with a built-in expiry, all in one round trip.

**Host:** So why not just use MULTI/EXEC or pipelining for that instead — aren't those also about grouping commands?

**Guest:** They solve different problems and people conflate them constantly. Pipelining just batches commands over one connection to save round trips — there's no atomicity promise at all, other clients can interleave. MULTI/EXEC queues commands to run together, but if one fails at runtime the others still apply — there's no rollback, so it's not a transaction in the database sense. SET NX EX is the one that actually gives you atomic claim semantics, which is exactly why it's the durable backing store for claim-before-execute — it's what survives the restart that kills your in-process dict.

### 3. The numbers that bite you in production

**Host:** Okay, so let's talk about the stuff that actually pages you at 3am. What's the first number people get wrong before they even go to production?

**Guest:** Maxmemory defaults to zero, which means unlimited, and the eviction policy defaults to noeviction. So people deploy a 'cache' that will happily eat all available RAM until the OS OOM-kills the process, or if you did set a maxmemory limit, it just starts erroring on writes instead of evicting anything. Neither behavior is what anyone pictures when they hear the word cache. And separately, if you ever run KEYS star against a live instance, it's an O(n) scan over the entire keyspace on the one thread that's also trying to serve every other client — SCAN exists specifically so you don't do that.

**Host:** And what about replication and cluster — where do those bite you specifically?

**Guest:** Replication to replicas is asynchronous by default, so a failover can lose writes the client already got an OK for — WAIT gets you replica acknowledgement, but that's still not consensus, so don't treat Redis as the durable source of truth for anything that can't be lost. And on cluster, multi-key operations across different hash slots are just rejected outright, so code that works fine on a single node can break the moment you shard, unless you deliberately colocate related keys with a hash tag like curly-brace tenant.

### 4. Where Redis fits in the bigger architecture — and its limits

**Host:** So zooming out — asynchronous replication means Redis isn't a consensus system, right? How does that map onto something like CAP theorem?

**Guest:** Right, CAP is really about what happens during a network partition — you pick consistency or availability, not some permanent three-way menu. Redis, by defaulting to async replication, is choosing availability: it'll answer you fast even if a replica hasn't caught up, which is why PACELC is the more useful frame day to day, since it also covers the latency-consistency tradeoff you make even when nothing's partitioned. Concretely, in the async AI gateway, the distributed rate limiter leans on Redis for exactly that speed, but the architecture has to explicitly decide what happens the moment Redis itself is unavailable — fail closed and protect quota at the cost of availability, or fail open with a tighter local emergency limit and protect availability at the cost of weaker enforcement. The one thing you can't do is nothing: no timeout on that Redis call, or a crash, is the actual failure mode you're designing against.

**Host:** That's a great place to leave it — Redis isn't magic, and the architecture around it has to own those edges explicitly rather than hope they never show up. Thanks for walking through this.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Redis Enterprise / RedisJSON / RedisSearch modules
- Benchmark numbers for ops/sec or specific latency percentiles under load
- Comparison to Memcached or other in-memory stores
