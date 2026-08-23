### 1. Why synchronous request handling can't hold agent work

**Host:** Picture this: your agent is on a multi-step run that dies on step seven, it's already cost you real compute and real API calls, and then the process just dies. Deploy went out, timeout fired, OOM killer swept through, doesn't matter which. Does it restart at step one, or does it just vanish?

**Guest:** That's the whole problem in one scenario. And it's not the only failure mode — an impatient client retries a submission because it didn't get a response fast enough, and now you've got two runs doing the same expensive work. Or a worker gets killed mid-task and that task is just gone, invisible, nobody knows to pick it back up. If you're running this as ordinary synchronous request handling, the request's lifetime becomes the work's lifetime, and all three of those failures are just guaranteed to happen eventually.

**Host:** Okay, so the obvious reaction is: fine, throw it on a background thread, fire-and-forget it. Why doesn't that actually fix anything?

**Guest:** Because you've only removed the symptom, not the disease — nothing durable ever recorded that the work exists in the first place, so when that thread dies, there's nothing to recover from. What you actually need is a delivery guarantee, and the honest one available to you is at-least-once. Exactly-once delivery doesn't exist in distributed systems; the best you can get is exactly-once effect through idempotent handlers, and pretty much every design decision we're going to walk through today follows from taking that constraint seriously instead of pretending you can engineer your way around it.

### 2. The seven requirements a durable queue must satisfy

**Host:** Okay, so if at-least-once is the honest guarantee, what does that actually demand from the queue itself? It feels like there should be a concrete checklist here, not just a philosophy.

**Guest:** There is, and it's seven things. Durable submission, so work survives the process that accepted it, and idempotent submission, so a client-supplied key collapses retries into one task instead of duplicates. Then automatic recovery, a dead worker's task gets released without a human or a supervisor babysitting it, bounded retries, so a task that can never succeed eventually surfaces to a person instead of looping forever, resumable progress, so a long task picks up from its last checkpoint rather than starting over, safe concurrency, meaning two workers can never both believe they own the same task, and graceful shutdown, so a normal deploy drains work instead of just manufacturing the exact crash we're trying to survive. Every mechanism we talk about today — leasing, fencing, checkpointing, dead-lettering — is just the answer to one of those seven.

### 3. Leasing, fencing tokens, and the visibility timeout as crash recovery

**Host:** Okay, let's get concrete on the mechanics. What actually happens when a worker picks up a task?

**Guest:** It leases the task. The queue hands it a fencing token and a visibility deadline, and for as long as that lease holds, the task is invisible to every other worker. Succeed, and it acks with the token and the task is done. Fail, and it fails with the token, goes back to pending with its retry budget decremented, or dead-letters if that budget's gone.

**Host:** So what happens the moment the worker just dies mid-task, no clean failure at all?

**Guest:** Nothing renews the lease, so it expires and the task falls back to pending by itself. That's the whole trick — the visibility timeout is the crash-recovery mechanism, not a side feature of it. There's no heartbeat service, no watchdog, no separate liveness probe checking in; absence of renewal is the failure signal, which means one fewer component that can itself go down.

### 4. The constraints that make the guarantee real

**Host:** Okay, so the lease and the fencing token handle the crash case. But couldn't a team just build that claim logic into the application layer instead of leaning on the store itself?

**Guest:** People try, and it always reintroduces the race — a 'check then update' in application code is never truly atomic across two workers, no matter how carefully you write it, so the store has to be the one granting the claim in a single round trip. That same logic is why lease deadlines can't be computed by the worker's own clock; if worker A and worker B disagree by even a few seconds of skew, they can both believe they own the task at once, so the store has to stamp the expiry itself. And checkpoints have to stay tiny for the same reason everything else stays cheap — a checkpoint is just a resumption cursor, the last safe step to resume from, not a dumping ground for intermediate results, because the moment it grows, the whole claim-and-resume cycle stops being cheap enough to do constantly.

### 5. Where it breaks: zombies, poison tasks, and silent abandonment

**Host:** So let's walk through the ways this actually breaks in production, because I imagine the failure modes aren't exotic — they're the boring stuff nobody budgets time for. Start with the zombie worker you mentioned before we get into fencing tokens.

**Guest:** Right — we already walked through that whole scenario in detail back when we covered leasing and fencing tokens, so I don't want to retread it here. Let's move on to a failure mode we haven't touched yet.

**Host:** Okay, and the crash-looping task — that one sounds almost sneakier, because there's no dramatic race, just a worker quietly dying over and over.

**Guest:** It's sneaky because the failure never gets recorded. If a handler reliably kills its process, the worker's gone before it can report anything, so if your retry budget only decrements on explicit failures, that task gets redelivered forever, taking a fresh worker down each time. The fix is almost embarrassingly simple — count delivery attempts, not reported failures — so a crash costs the same retry budget as an honest error. And it pairs with two other traps: teams that think a dedup key on submission makes handlers idempotent, when it only stops duplicate tasks, not duplicate deliveries of the same one, and dead-letter queues nobody's watching, which just turn a loud failure into a silent one that already got acknowledged to the caller.

### 6. The trade-offs: timeout vs heartbeat, deliveries vs failures, Postgres vs broker

**Host:** So if counting deliveries instead of failures is the fix, doesn't that just move the unfairness somewhere else? An innocent task that happens to get caught in a network blip is now burning down the same budget as one with an actual broken handler.

**Guest:** Exactly, and that's the honest trade-off, not a solved problem. Counting failures is fairer to any individual task, but unsafe in aggregate because a crash-looping task never accrues a recorded failure. Counting deliveries is safe in aggregate but occasionally unfair to a task that did nothing wrong except get redelivered during someone else's infrastructure hiccup — you're trading individual fairness for systemic safety, and an unlucky task ends up consuming its budget on redeliveries it never caused.

**Host:** That same pick-your-poison logic seems to apply everywhere else here — timeout versus heartbeat, checkpoint frequency, even Postgres versus a real broker.

**Guest:** Right, it's the same shape every time. A visibility timeout needs no extra moving part — silence is the signal — but recovery latency is bounded below by the timeout, so short timeouts recover fast and misjudge slow workers as dead, long timeouts are patient and slow to notice real crashes. A heartbeat service resolves that ambiguity more sharply but is itself a distributed component that can fail or partition. Checkpoint frequency is a rework-cost question — checkpoint what's expensive to redo, skip it for what's cheap. And on storage, a relational store buys you transactional enqueue, the task and the business row commit together, no dual-write gap, which below a few thousand tasks a second is worth more than the throughput a dedicated broker gives you.

### 7. Scaling the claim, not the throughput

**Host:** So once the durability mechanics are settled, where does the system actually start to strain as load grows? Is it the queue filling up, or something more subtle?

**Guest:** It's the claim operation, not raw throughput — every worker polling for work is contending on the same rows, and that's why the database's row-locking-with-skip behavior matters, it lets contending readers step over locked rows instead of queueing behind them. Poll interval is the other lever: aggressive polling gets you low pickup latency but load grows quadratic-ish as you add workers, so long polling or a notification channel that pushes updates to listeners decouples latency from worker count. Beyond that, partition by queue before you partition by shard — separate queues per workload class isolate a slow bulk job from a latency-sensitive one and are much easier to reason about than hash-sharding a single queue. And watch the dead-letter queue's growth rate, not just its size — if it's growing faster than it drains, some dependency is broken and your retries are amplifying load instead of absorbing it, which is a capacity signal as real as CPU.

### 8. Security exposure and the cost of getting it wrong

**Host:** So we've talked about the queue as a mechanical system, but every one of those rows has real user content sitting in it. What breaks first when you start thinking about this as a security surface rather than a plumbing problem?

**Guest:** The task payload itself, because it's stored data like any other, and it inherits whatever retention and deletion obligations the underlying content carries — a queue doesn't get a pass just because it's infrastructure. That extends to checkpoints too, which people forget: a checkpoint holding partial results of a sensitive task is just as sensitive as the task, and it's easy to encrypt the payload table but leave the checkpoint table out of scope. Then there are the capability-style secrets — idempotency keys have to be scoped per tenant, or one tenant can collide with another tenant's key and read their result, and fencing tokens are literally capability tokens, so they need to be unguessable and kept out of logs, not printed next to the task ID for debugging convenience.

**Host:** And the dead-letter queue is where all of that risk pools up permanently. Does that same logic carry over into cost, where the failure modes we already covered just show up on a bill?

**Guest:** Exactly — dead-lettered tasks are retained longest by definition, which makes that queue the most sensitive data in the system and also the biggest long-term storage cost. The rest of cost is really the same architecture story told in dollars: redelivered work means you're paying twice for an expensive model call, so checkpointing and correctly-sized leases are a spend decision, not just a correctness one. Polling has a floor cost — workers times poll frequency, paid continuously whether there's work or not, and at low utilization that floor can exceed the cost of the work itself. And a retry budget is really a cost cap — an unbounded retry against a failing paid dependency is an unbounded bill, so the budget is what keeps your worst case finite instead of theoretical.

### 9. What to watch, and the production checklist

**Host:** So we've talked through the architecture and the failure modes — how do you actually watch this thing in production, day to day? What's on the dashboard?

**Guest:** Six signals, really. Queue depth alone is meaningless — a deep queue draining fast is healthy — so you want oldest-pending age as the honest latency number. Lease expiry rate is your crash rate and should sit near zero, with a rise telling you either workers are dying or leases are undersized. Delivery-attempt distribution is your earliest warning for a poison task or a dependency going bad, dead-letter arrival is the one metric that must page because it means accepted work just got abandoned, drain duration on shutdown tells you if deploys are about to start killing in-flight tasks, and trace continuity across redelivery is what makes attempt two debuggable as a continuation of attempt one instead of a mystery you reconstruct from timestamps.

**Host:** That's the watch-list. What's the actual checklist before you ship this — the things that separate 'we built a queue' from 'we built a durable one'?

**Guest:** Claim has to be one atomic round trip, not read-then-write, lease deadlines come from the store's clock not the worker's, and long-running handlers must actually test their lease extension rather than assume it works. Retry budgets decrement on delivery with a proven dead-letter path, the dead-letter queue has a named owner and a triage doc, and termination grace period exceeds observed p99 drain with headroom. Handlers are idempotent — tested by running twice, not commented as a promise — idempotency keys are namespaced per tenant, and retention on payloads and checkpoints matches what they actually contain; get through that list honestly and you've got the thing we've been describing this whole episode, not just a queue that happens to work today.

### 10. Seeing it run: the lab, the interview questions, and the closing synthesis

**Host:** So if someone wants to see all of this rather than just take our word for it, there's an actual lab — an in-memory durable task engine. What does running it actually prove that the conversation alone doesn't?

**Guest:** It proves the mechanisms are real, not aspirational. You watch a leased task go invisible, kill the worker mid-handler, and watch it get redelivered and complete on retry — checkpoints handed back on the next attempt so resumption isn't from zero. Shutdown drains in-flight work instead of manufacturing the exact crash the rest of the system exists to survive. Twenty-six tests, a fake clock, no real sleeps, under a second, and every failure mode we've talked about is asserted, not assumed.

**Host:** And if I only remember three distinctions from this entire episode, what should they be?

**Guest:** One: absence of renewal is the failure signal. Two: idempotent submission and idempotent handling are different problems. Three: count deliveries, not failures. Get those three right and the rest of the architecture — leasing, fencing, dead-lettering — just falls out as the honest consequence.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Specific benchmark numbers comparing Postgres-based queues to dedicated brokers at scale
- How this architecture integrates with multi-agent orchestration frameworks
- Vendor or product comparisons for managed queue services
