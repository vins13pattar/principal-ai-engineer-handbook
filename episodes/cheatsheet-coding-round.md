# Cheat Sheet: Coding Round

_A tight walkthrough of the coding-round cheat sheet: what triggers it, the exact sequence to run whether you're building or debugging, and the non-negotiables and red flags that separate a passing answer from a failing one._

- **Source:** [cheatsheet:coding-round](/cheatsheets/sheets/coding-round/)
- **Runtime:** 3:24 · 6 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. When you'll see this and how to run the applied build

**Host:** So let's set the scene for this one. You're forty-five to sixty minutes into an interview, and the prompt lands: build a rate limiter, a retry path, a batcher, or a worker pool. This is the cheat sheet for exactly that moment, and it also doubles as the map for a debug-and-extend round, which we'll touch on too. The question is, once that prompt lands, what do you actually do first?

**Guest:** You state the invariant before you write a single line of code. Something like 'no more than N in flight, and a rejected request consumes no capacity' — that sentence is what everything you write afterward gets judged against. From there it's signature and data model, types on the public boundary only, then the smallest happy path that holds the invariant. Then, unprompted, you handle timeout, cancellation, and shutdown — that's the step that actually separates candidates. You close with one test that races concurrent calls instead of a sequential one, and then you name out loud what you left out: bounded not unbounded, in-process not distributed, and what would force the other choice.

---

## 2. Debug-and-extend, plus the non-negotiables underneath any of it

**Host:** Okay, that's the build side. What changes when they hand you broken code instead and say 'fix this'?

**Guest:** The sequence inverts but stays just as strict: reproduce the failure before you read a single line, then find the invariant and the exact spot where it stops holding — not the whole file, that spot. Change the smallest thing that restores it, add the test that would've caught it originally, and say out loud what you deliberately left untouched. And underneath both formats sit the same non-negotiables — release the semaphore in finally so a slot frees on success, failure, or cancellation; re-raise CancelledError or your shutdown just hangs; jitter your backoff or retries synchronize into a storm; bound fan-out inside the loop when the caller controls input size; flush batches on size or deadline so a lone request never starves; and claim before you execute, atomically, or two concurrent submissions both run. Miss any one of those and it doesn't matter how clean the rest of your code is — that's the line between passing and failing.

---

## 3. The red flags that sink an otherwise good answer

**Host:** So even with all that right, what actually tanks an otherwise solid answer? What are the tells you're watching for as an interviewer?

**Guest:** The classics: a blocking sleep or a synchronous network call sitting inside an async function, which freezes every coroutine, not just one. Acquiring the semaphore outside a try block so an exception leaks the slot forever, a broad except around an awaited call that quietly swallows cancellation, or firing off a full gather over caller-sized input with no bound. Add a sequential 'concurrency test' that proves nothing, spinning up a background task with no reference kept so it vanishes mid-flight, in-process state described as if it survives replicas, and worst of all, silence — this round scores reasoning you say out loud, not just code you type. If any of that sounds familiar, go compare your work against the finished files in the async-ai-gateway, durable-agent-task-engine, and dynamic-batching-inference labs — that's the fastest way to see exactly where the gap is.
