# The RTO Budget You Didn't Write Down

_A region failover controller looks correct until you measure it: detection alone can eat an entire RTO window, the fix for that collides with false-failover risk, and two silent failure modes — a dark region and a restarted controller — stay invisible until a seeded simulation forces them into the open._

- **Source:** [lab:region-failover-budget](/build/labs/region-failover-budget/)
- **Runtime:** 6:05 · 16 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-10-07
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Detection eats the whole window

**Host:** So we built this region failover controller for an AI serving stack, and on paper it looks fine — health checks, a window trigger, promotion logic, the works. But you told me before we started recording that the moment you actually measured it, something broke. What were you looking at?

**Guest:** The RTO was 15 minutes, so like most people we set the detection window to match — 900 seconds. Seems reasonable, right? But a window trigger literally cannot fire until the entire window has been unhealthy. So detection alone eats all 900 seconds, and only then does promotion start, then traffic shift, then — for a model-serving region — loading 140 gigabytes of weights onto the standby's GPUs. We ran the numbers and even the hot standby, which has nothing to warm up, came in at 1,080 seconds. Over budget before anything downstream even gets a chance.

**Host:** Wait, so matching the window to the RTO is actually the bug, not the safe choice. And you're saying shrinking the window helps hot and warm standby clear it, but cold standby misses no matter what you do to the trigger?

**Guest:** Exactly. Drop the window to 300 seconds and both hot and warm standby clear it — hot at 480, warm at 620 — but cold's still over at 1,220. Even with the most aggressive trigger we tried, 12 consecutive failures detecting in about 110 seconds, cold standby still lands at 1,030 — because loading 140 gigabytes of weights at a gigabyte a second just takes longer than your whole RTO allows. That's not a tuning problem anymore, that's a standby-tier decision, and no trigger logic on earth fixes it.

---

## 2. The price of patience: quiet triggers vs. fast ones

**Host:** Okay, but you said tightening the window to 300 seconds was the fix. What happens if some downstream stage needs part of that budget too, and you shave the detection window even tighter?

**Guest:** Then you start eating yourself alive from the other direction. At the default blip rate, four an hour averaging 20 seconds, a single failed probe triggers 71.7 false failovers a day — basically every blip becomes an outage. Three consecutive failures gets you to 25.3, six consecutive to 6.0, a 60 second window to 3.3, and you don't get near zero until 12 consecutive failures or a 300 second window, both landing under one false failover a day.

**Host:** So a window and a consecutive-failure count aren't really two different mechanisms, they're the same knob wearing different clothes?

**Guest:** Right — a window of W seconds behaves like W divided by your probe interval, plus one, consecutive failures, so they interleave on a single patience axis. But don't treat any of these numbers as gospel: triple the mean blip length to 60 seconds and that same 12-consecutive-failure trigger jumps from 0.2 false failovers a day to 13.2. The shape holds, more patience means fewer false triggers and later detection, but the magnitudes only mean something once you measure your own probe history.

---

## 3. Two ways the controller lies to itself

**Host:** Okay, so the patience dial is tuned — but you told me before we started recording that the sweep found two bugs that have nothing to do with patience at all. They're just... the controller lying to itself?

**Guest:** Right, the first one's almost embarrassing once you see it: the controller reads an empty check window as healthy. So if an outage takes the prober down along with the region, there are zero checks coming in — and zero checks gets coded as 'False,' as in not-unhealthy. In the sweep it only caught a dark region in 2 of 30 runs, and both of those were luck, where the region happened to go dark mid-blip so the last checks sitting in the window were already unhealthy. Flip one flag — count a probe that never arrived as a failure — and it catches all 30, under every trigger.

**Host:** So silence has to mean something's wrong, not nothing's wrong. What's the second one — the restart bug?

**Guest:** Same root cause, opposite direction. A freshly started controller has no history, so one unhealthy check is the entire window — it fires on the very first bad probe. And a controller restarts exactly when things are already noisy: mid-deploy, a crashed pod. So the moment it has zero immunity is the moment it needs the most. The fix is a minimum history requirement before the trigger's even armed — the same idea as the window itself, just applied to the controller's own age instead of the region's.

---

## 4. What the lab refuses to simulate, and who owns the trigger

**Host:** Before we wrap, I want to flag what's deliberately missing from this lab. You didn't model RPO and replication lag, and you punted on IAM blast radius entirely — why leave those out?

**Guest:** Replication lag is the third failure mode from Module 11, and here's the problem: any honest simulation of how lag behaves under pre-outage load would have to encode assumptions that already determine the answer you're testing for. That's not a simulation, that's a tautology. IAM blast radius is a different kind of scope cut — the Agent Identity Broker lab already measures that properly, so duplicating it here would just be noise.

**Host:** So if someone's walking away with one thing from all of this — the windows, the patience tradeoff, the controller amnesia — what's the actual move on Monday morning?

**Guest:** Three things, in order: stage your RTO budget before you touch a detection threshold, put a name on the false-failover rate as owned policy, and decide in code what silence means to your controller. That's the whole Monday morning move.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A concrete dollar comparison of hot vs. warm vs. cold standby cost for a specific model size
- A worked example of re-fitting trigger patience against a real production probe-history dataset
- A narrative walkthrough of an actual incident where a dark-region or restart bug fired in production
