### 1. The moment you're paged: print this, follow the sequence

**Host:** So picture the moment your phone buzzes at 2am with a page. Your heart rate spikes, and every instinct you have is screaming at you to find out why this is happening. Today we're handing you the thing to fight that instinct — a seven-step sequence you print and tape next to the runbook, because the order matters as much as the actions themselves.

**Guest:** Right, and the reason it needs to be printed is that adrenaline argues for the wrong thing every single time. It tells you to diagnose first, but the actual sequence starts with stopping the bleeding — roll back, shed load, fail over — because diagnosis is so much cheaper once the graph isn't actively falling. Then you declare and name one incident lead who coordinates but doesn't debug, because unstated leadership is exactly how two people end up applying conflicting fixes at once.

**Host:** So after mitigation and a named lead, then what — you start reconstructing what actually happened?

**Guest:** Exactly, you establish the timeline of what changed, since most incidents trace back to a recent deploy, config change, or model version shift. From there you separate saturation from failure, because rising queue wait needs a completely different fix than rising errors with flat latency. Then you communicate on a fixed cadence even when there's nothing new, save root cause for last since the first plausible story is usually incomplete, and write the review while it's still fresh, treating the output as a mechanism rather than a hunt for a culprit.

### 2. Reading the signals: what you see vs. what to check first

**Host:** Okay, so let's make this concrete, because 'find what changed' is easy to say and hard to do at 3am. If I'm staring at a dashboard, what's the actual signal-to-action mapping I should have memorized?

**Guest:** The one that trips people up most is p99 climbing while p50 stays flat — that's a tail problem, a slow dependency or a hot shard, not a capacity problem, so don't scale. Similarly latency up with CPU flat means I/O-bound saturation, so check queue wait and concurrency limits instead of throwing compute at it. Errors right after a deploy mean roll back first and investigate after; latency fine but quality complaints coming in means a model or index change, which latency monitoring literally cannot see, so you need the eval signal checked explicitly. And for burn rate specifically, you need a fast window and a slow window to both fire before paging — a one-hour window alone is noise, a 24-hour window alone is too late to matter.

### 3. The mistakes that turn a bad incident into a worse one

**Host:** So let's close with the ways this all goes sideways — what actually turns a bad incident into a worse one? Because I imagine every one of these is really just the sequence getting skipped somewhere.

**Guest:** Exactly, none of these are new mistakes, they're just the steps we already covered done out of order or not at all. Debugging before you've mitigated, while users are still bleeding, is step one skipped. No named lead means two people mitigate at once and you can't tell which change did what — same failure as changing more than one thing at a time, you've just destroyed your own signal. Trusting a dashboard you've never validated is skipping the 'confirm the signal is real' step, and 'it recovered on its own' logged as resolution just means you never found what changed, so it comes back with less information next time and no comms in the meantime leaves everyone assuming it's still on fire. And the review that names a person instead of a mechanism is the same shortcut at the very end — it feels like closure, but it guarantees the next one gets reported later instead of sooner. Every one of these is the sequence breaking down somewhere, which is really the whole point of the cheat sheet: stop the bleeding, name a lead, find what changed, communicate on a cadence, in that order, every time.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Specific tooling or vendor recommendations for on-call/paging
- A worked example of an actual past incident timeline
- Detailed postmortem template structure
