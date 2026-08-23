### 1. What the round is actually grading

**Host:** So let's start with what people get wrong before they even open the editor. They think this round is about naming the right pattern — 'oh, I'd use a semaphore here, a worker pool there' — and they treat that as basically the answer.

**Guest:** Right, naming it isn't the answer. The real test is whether you can write a semaphore that actually gets released on every exit path, including when the request gets cancelled halfway through. It's also whether you handle timeout, partial failure, and shutdown, not just the case where everything goes right. And it's whether you picked the right concurrency model at all — async for something CPU-bound, or threads for work the GIL is just going to serialize anyway, that reads as not knowing the runtime, no matter how clean the code looks.

**Host:** And there's this distinction you draw between a mid-level answer and a Principal answer — it's not really about who writes more code, is it?

**Guest:** No, it's almost the opposite. A mid-level candidate writes until the function works and stops. A Principal candidate states the invariant out loud first — something like 'no more than N in flight, and a rejected request can't consume a slot' — writes the smallest thing that actually holds that invariant, and then names what they deliberately left out, like a bounded queue instead of an unbounded one, and what would force them to change that choice. Interviewers are grading that invariant and that omission as heavily as the code itself.

### 2. The three formats you'll actually be handed

**Host:** So let's map the terrain. Candidates walking into these loops actually run into three distinct formats, and they don't all test the same thing. What are they?

**Guest:** There's the applied build, where you're handed something like 'write a rate limiter' and given forty-five to sixty minutes, usually in one file — that's testing concurrency correctness and whether you handle cancellation and shutdown without being told to. There's debug-and-extend, where you get an existing repo with a failing test, and that's testing how you navigate unfamiliar code and form a hypothesis without breaking things you didn't mean to touch. And there's the algorithmic screen, the conventional data-structures problem, usually earlier in the loop — that's just baseline fluency, still real, but not what later rounds actually weigh.

**Host:** And if someone only has time to prepare one of those well, which one should it be?

**Guest:** The applied build, no contest — it dominates Principal, Staff, AI Platform, and Founding AI Engineer loops because it's the closest thing to a proxy for the actual job. And the best prep isn't grinding more problems, it's writing four or five of these components from an empty file, with tests, until the cancellation and shutdown paths are reflex instead of something you have to recall under pressure.

### 3. Ten components worth writing from an empty file

**Host:** Okay, four or five components — give me the actual list, because I think people's mental model of what counts as a serious infra component is smaller than what interviewers actually reach for.

**Guest:** There's a set of about ten that show up verbatim across loops: token-bucket rate limiter, retry with backoff and jitter, circuit breaker, bounded-concurrency worker pool, graceful drain, idempotency key store, lease-based checkout, a latency-bounded batcher, reciprocal rank fusion, and multi-window burn-rate alerting. Each one has a single invariant that the interviewer is actually listening for — not the code shape, the property that has to hold no matter what breaks.

**Host:** Give me one where the invariant is easy to say but the code trap is subtle — because I feel like the gateway itself has one baked in.

**Guest:** Right there in the admit path — rate limiting happens before the semaphore acquire, so a rejected caller never consumes concurrency capacity it was denied. And the whole retry loop sits inside one asyncio timeout block wrapping every attempt, so backoff can't quietly blow past the caller's deadline, with the semaphore released in a finally block no matter which branch exits. The drain pattern is the cleanest example of 'finished' — flip accepting to false, wait on a condition for active count to hit zero, and if the timeout fires, return false explicitly instead of silently killing requests mid-flight.

### 4. The traps that catch people in a predictable order

**Host:** Let's go through the traps in the order they actually bite people. What's number one, the thing that shows up before anyone even gets to concurrency logic?

**Guest:** Blocking the event loop. A time.sleep, a synchronous HTTP client, requests, a CPU-heavy loop dropped inside an async def — it freezes every coroutine sharing that loop, not just the slow one. Interviewers plant this on purpose, sometimes hand you code that already has it, and the fix is loop.run\_in\_executor or a separate process, never inline.

**Host:** And once someone's past that, where's the next one waiting?

**Guest:** Semaphore leaks — acquire before a try, forget the finally, or only release on the success branch, and capacity leaks until the service wedges, faster under cancellation because nobody tested that path. Right behind it is swallowing CancelledError, a bare except or even a correct except that doesn't re-raise, which makes the task uncancellable. Then unbounded gather on caller-controlled input, sequential tests that prove nothing about the race you were asked to guarantee, and an in-process counter that's correct on your laptop and wrong the moment it's running on three replicas — fine as a starting point, only if you say so out loud.

### 5. Trade-offs you'll be asked to defend mid-problem

**Host:** So beyond just not writing the bugs, the interviewer's going to stop you mid-build and ask why you chose async over threads, or in-process over distributed. Where do those questions actually come from?

**Guest:** They come straight out of the same file. Take the rate limiter — it's an in-process token bucket, which is fast and dependency-free, but it's only correct on one replica. Run three replicas and a tenant effectively gets triple their quota, because each process enforces its own count with no idea the others exist. The distributed version, Redis-backed with an atomic Lua script, fixes that — but now you own a new failure mode: what does enforcement do when Redis is unavailable? The right answer in a 45-minute exercise is usually in-process, stated as such, with the distributed version described — same as async versus threads versus processes: async for I/O with async-native libraries, threads only when a blocking library forces your hand since the GIL kills any real CPU gain, processes when the work is actually CPU-bound and you can eat the serialization cost.

**Host:** And that same reject-versus-queue call shows up in the gateway itself, not just the limiter — so how do you keep from sounding like you're dodging the question with 'it depends'?

**Guest:** You make it depend on something specific, not on vibes. Rejecting at the door is a fast, honest error that protects the system; queueing or falling back keeps the request alive but can turn a bounded failure into an unbounded one, so you say which operation gets which and name the signal that decides. Same discipline on typing: full types and validation on the public signature and the data model, since that's what the interviewer's eyes are on and what stops the class of bug you'd otherwise chase live, but you don't spend your remaining time annotating a private helper nobody's going to see.

### 6. Debug-and-extend: navigation over authorship

**Host:** So now the flip side — instead of an empty file, they hand you a whole repo and a failing test. That feels like a totally different skill. Where do you even start?

**Guest:** You start by running the failing test before you read a line of code, because a symptom you've actually observed beats any theory you form from staring at source. Then you go find the invariant the code is trying to hold and the exact point where it stops holding — usually a missing release, an unawaited coroutine, an ordering assumption, or state leaking across a boundary that was supposed to isolate it. From there you change the smallest thing possible, because a fix that drags a refactor along with it is a fix nobody can review, and in an interview it reads as you not being able to scope your own change. Then you volunteer the regression test that would've caught it — that's worth more than the fix itself — and you close by naming the adjacent thing you noticed and deliberately left alone, so it reads as judgment instead of something you missed.

**Host:** That last step feels like the one people skip, since it means admitting you saw a problem and walked past it.

**Guest:** Right, but the adjacent issue you noticed and deliberately left alone is a signal, not an omission, as long as you name it. And you can drill this whole sequence with the labs on your own — pick one, go to a scratch branch, deliberately break an invariant, and run the existing suite against it. Wherever the suite stays green, you've just found the exact test worth writing, which is the same muscle the round is testing.

### 7. Where to find the actual questions

**Host:** So if someone wants to drill the actual questions rather than just the labs, where do they go? Is it scattered across the handbook or is there a map?

**Guest:** It's kept right next to the material that answers it, so you're not hunting. Module 1 has event-loop behavior, cancellation, timeouts, backpressure — that's the highest-yield set for this whole track. Module 2 covers idempotency and delivery guarantees under load, Module 9 has the batching latency-throughput trade, and Module 12 has the observability follow-up, because almost every build ends with someone asking what you'd actually measure.

### 8. The preparation checklist, and narrating while typing

**Host:** Okay, let's land this with the actual checklist, because 'study more' isn't a plan. What are the concrete things someone should be able to point to before they walk into this round?

**Guest:** Five things. One, you've written a token-bucket limiter, a retry-with-jitter wrapper, and a bounded worker pool from an empty file within the last month, and each has a test that fails when you break the invariant, not one that just checks the happy path. Two, you can explain what CancelledError does to a running task and where cleanup belongs, and you can say without hedging whether asyncio, threads, or processes fits a given workload. Three, you've read at least one lab's tests end to end so you recognize what an invariant looks like as an assertion. Four, you can name what your solution doesn't handle — replicas, persistence, ordering — before the interviewer has to ask. And five, you've practiced narrating while you type, because this round is scored on reasoning made audible, and ten minutes of silence loses points that a correct answer at the end doesn't recover.

**Host:** That last one feels like the whole episode in one line — the code was never really the point, the thinking out loud was. That's a great place to leave it, thanks for walking through all of this.

### Not covered

The planner wanted these and found nothing in the source to support them:

- specific compensation or offer-negotiation guidance for these roles
- which named companies use each interview format
- how many total rounds make up a typical loop or how they're sequenced
- guidance on take-home versus live-coding format preferences
