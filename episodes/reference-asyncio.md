# asyncio: The Scheduler, Not a Speed Multiplier

_asyncio buys concurrency by overlapping waiting, not by running code in parallel — understanding that one fact explains every primitive it offers and every way people misuse it._

- **Source:** [reference:asyncio](/reference/lookups/asyncio/)
- **Runtime:** 4:36 · 11 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. One loop, one coroutine at a time

**Host:** Let's start with the thing people get wrong about asyncio before we even touch syntax: it does not make your code run in parallel. It's a single-threaded scheduler, and today we're going to build the mental model that explains basically every quirk, every gotcha, and every misuse you'll ever hit with it.

**Guest:** Right, and the core of that model is really simple: one event loop runs one coroutine at a time, full stop. The only moment control can move to something else is at an await — that's the suspension point, the place where a coroutine says 'I'm waiting on something, go run whoever else is ready.' Everything else asyncio offers is just bookkeeping around that one rule.

**Host:** So the speedup people feel with asyncio isn't from doing more computation at once, it's from not sitting idle while waiting on a network call — you overlap the waiting instead of the work itself. Which also means if your bottleneck is actually CPU-bound work, none of this helps at all, because there's no waiting to overlap.

---

## 2. The toolkit: tasks, groups, timeouts, and backpressure

**Host:** Okay, so once you accept that it's all one loop taking turns, what do you actually reach for to manage a bunch of those turns at once? Walk me through TaskGroup versus gather, because I see both in code and I'm never sure which one is the adult in the room.

**Guest:** TaskGroup, from 3.11, is the structured version — you open a block, spawn tasks into it, and when the block exits it's waited everything and propagated the first failure while cancelling its siblings. Gather is older and looser: it runs things concurrently too, but unless you pass return\_exceptions=True, one failure surfaces immediately while the others just keep running in the background, orphaned. On 3.10 or earlier you don't have a choice, TaskGroup doesn't exist, so you're doing gather plus wait\_for and being careful about cleanup yourself.

**Host:** And timeouts layer on top of that how? I've seen asyncio.timeout as a context manager and wait\_for wrapping a single call, and I've never been sure they're doing the same job.

**Guest:** wait\_for wraps one awaitable and cancels it on expiry; asyncio.timeout, also 3.11+, is a context manager so it composes over a whole block, including a TaskGroup full of things. Underneath, both raise CancelledError at the await point, and since 3.8 that inherits from BaseException, not Exception, so a bare except Exception silently stops catching it. Then for actually limiting concurrency you want a Semaphore, used as async with so the slot releases on every exit path, and for producer-consumer handoff a Queue — bind maxsize or the default of zero means unbounded, and a slow consumer just quietly turns into an out-of-memory crash. And when the blocking thing genuinely can't be awaited, run\_in\_executor or the newer to\_thread hands it to a thread pool capped at the smaller of thirty-two or your CPU count plus four workers, so the loop keeps moving, but only up to that ceiling before calls start queuing.

---

## 3. Where it actually breaks

**Host:** So let's do a rogues' gallery. If someone drops a synchronous requests.get or time.sleep inside an async def, what actually happens versus what they think happens?

**Guest:** They think they've slowed down one request; they've actually frozen the loop for everyone, because nothing yields control back. Same story with create\_task if you don't hold the reference — the task can get garbage-collected mid-flight, silently, and you never even see the work finish. And the mirror-image bug is swallowing CancelledError instead of cleaning up in finally and re-raising it, which makes that task permanently uncancellable, so your shutdown or your timeout just hangs waiting on something that will never yield to it again.

**Host:** And the gather trap — bounding fan-out inside the loop, not outside it — plus return\_exceptions=True quietly handing back failures nobody checks. Given all that, is there one thing you'd tell someone to turn on before they ship anything?

**Guest:** Set the environment variable Python asyncio debug to one, every time, it's free. It flags coroutines that block the loop past a threshold and tasks that were created but never retrieved. Turn it on in dev, fix what it complains about, and you've caught those two classes of bug before production ever gets a chance to.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of a full production gateway request path with rate limiting, retries, and circuit breaking
- A deep dive into distributed rate limiting or Redis-backed quota enforcement
- Interview-style coding exercises or grading rubrics for asyncio components
