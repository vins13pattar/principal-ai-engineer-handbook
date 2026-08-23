### 1. Why synchronous agent work breaks under interruption

**Host:** So let's start with the failure everyone building agent systems eventually hits. You've got a multi-step run that dies on step seven, and if you're not careful it restarts at step one, burning money and time it already spent. Or a client gets impatient, retries a submission, and now you've got two runs doing the same expensive work. Why does this keep happening even to teams who think they've handled it?

**Guest:** Because the default architecture is ordinary synchronous request handling, and that ties the work's lifetime to the request's lifetime. A deploy, a timeout, an OOM kill — any of those destroys progress that cost real money to produce. And the usual first fix, spinning up a background thread or firing off a detached task, doesn't actually fix anything. It just hides the problem, because nothing durable records that the work exists, so when the worker dies there's nothing left to recover it. What you actually need is a real delivery guarantee, and the honest one to build around is at-least-once — exactly-once delivery isn't something you can have, you can only get exactly-once effect by making your handlers idempotent. Everything we're going to talk about today, every mechanism, is really just downstream of accepting that one fact.

### 2. The visibility timeout as crash recovery, and why fencing is what makes it safe

**Host:** So walk me through the lease mechanism itself. When a worker picks up a task, what actually happens, and what makes it self-healing when that worker dies?

**Guest:** A worker leases the task and gets back two things: a fencing token and a visibility deadline. While that lease holds, the task is invisible to every other worker, so nobody double-picks it. If the worker dies — deploy, OOM, whatever — nobody renews the lease, it just expires on its own clock, and the task falls back to pending automatically. There's no heartbeat service watching for that, no watchdog process, no liveness probe. The absence of a renewal is the only signal needed, which means there's one fewer component in the system that can itself go down.

**Host:** Okay but that raises an obvious hole — what if the worker isn't actually dead, just paused? A long GC pause, a suspended VM, something blocking on a syscall. It wakes back up still thinking it owns the task.

**Guest:** Right, that's a zombie, and it's exactly the case the lease alone doesn't cover — the task may already have been reissued and finished by someone else while it was asleep. That's what the fencing token is for. Every ack, fail, or checkpoint carries the token it was issued, and once the lease expires and a new lease is granted, that old token is stale and gets rejected outright. So the zombie wakes up, tries to mark its work done, and the system just refuses it instead of silently corrupting a task another worker already completed. That's the difference between at-least-once being merely tolerable and actually being safe.

### 3. The subtle bug: counting failures vs counting deliveries

**Host:** Okay, so the fencing token stops the zombie from corrupting a finished task. But what stops the zombie's \*task\* from just being retried forever? Isn't that also a crash-driven loop the budget should catch?

**Guest:** That's the bug that only shows up under fire, and it's a subtle one. If your retry budget only decrements on an explicit failure — a handler catching an error and reporting it — then a handler that gets its whole process killed never reports anything. The lease just expires, the task goes back to pending with its budget completely untouched, and it gets redelivered forever. A task that reliably segfaults its worker becomes an infinite loop that also takes a worker down with it every single pass.

**Host:** So the fix is counting the attempt at delivery time, not waiting for someone to confess failure.

**Guest:** Exactly — decrement the budget the moment the task is handed out, and now crash-driven redelivery is bounded by the same limit as explicit failure. It dead-letters, an operator gets paged, the loop stops. And that's a separate concern from idempotent submission, by the way — the idempotency key is there to stop a redelivered task from being executed twice, not to stop it from being created twice, but this is about a task that only got created once and still needs its execution attempts bounded no matter how it dies.

### 4. From lab to production: what the in-memory store stands in for

**Host:** So let's zoom out for a second. Everything we've described so far — the lock, the lease table, the retry counter — that's all living in one process's memory in this lab. What breaks the moment you run more than one worker?

**Guest:** The single lock stops being correct, because it can only serialize claims within its own process — it has no idea a second replica exists. In production you need that same atomicity from the backing store itself, whether that's row-level locking with SKIP LOCKED or an atomic Lua script: the point is contending workers step over a locked row instead of queueing behind it or, worse, both grabbing it. Same discipline extends outward too — graceful draining so a shutting-down replica finishes or cleanly abandons its lease instead of letting it silently expire, checkpointing granular enough to resume without redoing an hour of work but not so granular that the store becomes the bottleneck, and dashboards on delivery attempts and dead-letter arrivals so a crash loop shows up as a page instead of a mystery. None of that is a new idea, it's the same lease-fencing-budget triangle we've been describing, just enforced by infrastructure instead of an in-process lock.

**Host:** So the in-memory store isn't a toy you throw away for real deployment, it's the spec you have to satisfy. That feels like the right place to leave it — the lab's got 26 deterministic tests walking through fencing, redelivery, budget exhaustion, checkpoint resumption, every failure mode we talked about today, so if you want to see the guarantee actually hold under a crash instead of just believing it, that's your starting point. Thanks for walking through it.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of a Postgres- or Redis-backed production implementation replacing the in-memory store — the lab documents this as a required backend guarantee but doesn't implement it
- A demonstration of multi-agent coordination using this task engine's leases, as hinted at in the distributed-systems interview material
