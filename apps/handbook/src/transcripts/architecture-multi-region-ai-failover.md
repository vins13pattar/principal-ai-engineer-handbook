### 1. The diagram stops where the work starts

**Host:** So picture the diagram everybody draws for AI serving failover: box one is your primary region, box two is the standby, there's an arrow between them, and somebody writes an RTO next to it like fifteen minutes. Clean, satisfying, done. Today we're arguing that diagram is where the real work hasn't even started yet.

**Guest:** Right, because that RTO isn't a fact about your system, it's a budget you haven't spent. Something has to detect the region is actually down, something has to promote the standby, traffic has to get redirected, and for AI serving specifically, the standby has to get the model loaded onto GPUs before it can serve a single request. Those happen in sequence, not in parallel, and the diagram just doesn't show any of that.

**Host:** So if I write fifteen minutes on a slide, I haven't actually checked whether fifteen minutes is achievable, I've just stated that it's desirable. We're going to walk through that sequence stage by stage today, and spend most of our time on the one everyone forgets, which is apparently getting the model warm on the standby's GPUs.

### 2. What the trigger has to do, and what makes it hard

**Host:** Okay, so before we get into warm-up, let's talk about the trigger itself — the thing that decides 'yes, failover now.' What does it actually have to get right?

**Guest:** Four things, and they pull against each other. It has to commit to that RTO you mentioned, measured from the first failure to the first request served elsewhere. It has to ignore transient faults, because a false failover is its own incident. It has to catch a region that goes fully dark rather than politely reporting itself unhealthy. And it has to behave predictably if the controller making these decisions restarts.

**Host:** That second one — ignoring transient faults — sounds like it's directly in tension with speed. How do you tell a dropped packet or a GC pause from the real thing on the first bad probe?

**Guest:** You can't, not at the first probe. The only way to tell them apart is to wait and see if it recovers, and every second of that waiting comes straight out of the same RTO budget you're trying to hit. Combine that with the fact that detection, promotion, traffic shift, and warm-up run one after another, not in parallel, and you can see why the budget gets tight before you've even touched the model.

### 3. Reading the budget left to right

**Host:** So let's actually read the thing left to right instead of treating it as one lump number. Detection is the only stage you, the controller, get to pick — everything downstream of that is the platform's problem, not yours. Is that the right way to think about it?

**Guest:** Exactly, and that split matters because it tells you what's negotiable and what isn't. Everything after detection belongs to the platform, and for AI serving the biggest variable in that fixed cost is the standby tier — hot, warm, or cold. A hot standby is already serving the model, warm has capacity but needs to load weights, cold has to go find capacity before it can even start loading.

**Host:** So walk me through what that leaves for detection once you actually subtract the platform's cut from a 15-minute RTO. Give me the lab's default numbers.

**Guest:** At their defaults, a hot standby leaves you 720 seconds to detect and decide before you've blown the RTO. Warm leaves you 580. Cold goes negative — meaning there's no detection window at all, no trigger logic you could write, that hits a 15-minute target, because the platform's own fixed cost already exceeds it.

### 4. Four ways the trigger gets it wrong

**Host:** So if the window is the thing eating the budget, the obvious fix is just set the window to the RTO, right? Fifteen minutes, done. Why doesn't that work?

**Guest:** Because a window trigger can't fire until the whole window has been unhealthy — so detection alone consumes the entire budget before promotion even starts. In the lab, a 900-second window against a 900-second RTO overran on every single tier, 1,080 seconds even for a hot standby with nothing to warm. It meets the RTO on paper and misses it by construction.

**Host:** Okay, that's one way to get it wrong. What are the other three?

**Guest:** A controller that treats 'no checks' as 'nothing wrong' misses a dark region almost every time — in the sweep it caught it in 2 of 30 runs, both by luck. Swing the other way and make it fire on the first bad probe, and it detects instantly but fires 72 times a day on ordinary blips with no outage at all. And a freshly restarted controller has no history, so one unhealthy check looks like the whole window — which fails the region over on its first bad probe, right when restarts and bad probes both cluster: during a deploy.

### 5. Patience sets both numbers at once

**Host:** So patience is the knob, and it sets two numbers at once. Walk me through what happens when you turn it.

**Guest:** In the lab, 3 consecutive failed probes detects in 20 seconds but fires 25 false failovers a day. Push to 12 consecutive and detection slows to 110 seconds, but false failovers drop to 0.2 a day. There's no setting that's both fast and quiet — you're choosing which cost you can absorb, and windows behave almost identically to consecutive counts, since a window of W seconds is just W over interval plus one. Pick whichever shape your team reasons about correctly, because the real design work is the wait time, not the family.

**Guest:** And none of those numbers travel to your system as-is — triple the mean blip length and that same 12-consecutive rule goes from 0.2 false failovers a day to 13.2. The shape holds, patience buys quiet at the cost of speed, but the magnitudes are only true for the blip distribution they were measured on.

**Host:** So you can't borrow someone else's thresholds, you have to re-fit them against your own probe history before you trust any of these numbers.

### 6. The standby tier is the first decision, not the last

**Host:** Okay, so we've spent two segments getting the trigger right, but you said the standby tier actually has to be picked first. Why does the order matter?

**Guest:** Because the tier decision sets the physics the trigger has to live inside. Hot standby means you're paying for GPU capacity that serves nothing until the day it serves everything. Warm means you've got the capacity but not the model loaded. Cold means you're paying for neither, and you accept the longest warm-up when the day comes.

**Host:** And that's not just a one-time cost calculation, you said false failovers have their own hidden price tag.

**Guest:** Right, and it's invisible on the bill but very real: every false failover is engineering time scrambling to understand what happened, a cold cache now serving in the region that just took over, and the operational risk that this particular failover goes wrong. A trigger tuned to fire fast on blips is buying those saved seconds with that cost, repeated many times a day, which is why you can't tune detection until you know what tier you're protecting.

### 7. The boundary moves with the traffic

**Host:** So we've covered the tiering and the triggering, but there's a dimension that doesn't show up on the budget at all: security. What changes there when you fail over?

**Guest:** Everything, because the failover carries the security boundary with it. The standby has to hold the same credentials, network policy, and model-artifact access as primary, provisioned through the exact same path — the moment someone hand-adds a role or secret to primary and forgets standby, that's drift waiting to surface mid-incident. And the controller itself is a juicy target, because anything that can feed it fake unhealthy probes can trigger a failover on command, so that health signal needs the same integrity guarantees as any other control-plane input.

### 8. Bigger models, more regions, same math

**Host:** Okay, let's talk scale, because surely a bigger model or a few more regions just means a bigger number on the same diagram, right? Where does the math actually break?

**Guest:** The failover decision itself stays cheap, it's the stages after it that balloon. Warm-up scales with model size, but also with how many replicas are loading weights at once — if your standby is pulling weights for many replicas in parallel, they're all fighting over the same storage throughput, so the per-replica number you measured in isolation is a lie once you load concurrently. And more regions don't buy you faster detection at all, they just multiply your homework: every standby target has its own tier, its own warm-up curve, its own contention profile, so a three-region plan isn't one budget, it's three budgets, one for each target rather than one for the whole platform.

### 9. Shipping it: the checklist, what to measure, and what's deliberately left out

**Host:** So let's land this as something a team could actually ship. If you had to write the checklist on one page, what's on it?

**Guest:** Standby config gets provisioned through the same path as primary and diffed so it can't quietly drift — that diffing is what actually catches silent divergence before it matters. Then you exercise the whole thing end to end on a schedule, every stage timed, because a plan you've never run is just a diagram with extra steps, and the false-failover rate gets owned by someone who watches it change as traffic does.

**Host:** And the observability side is basically what makes that checklist enforceable rather than aspirational — you need spans per stage, alerts on missing probes, false-failover rate as a tracked number, warm-up measured live instead of guessed.

**Guest:** Exactly, and I want to be honest about the edge of this: replication lag at the moment of failure, the RPO side, is a separate problem we're deliberately not solving here. You can hit your RTO perfectly and still lose more data than you can tolerate, because modeling lag under the load right before an outage basically requires assuming the answer. So measure that separately, don't let a clean failover drill convince you the data story is fine too — that's a different budget, with its own math, for another day.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Detailed modeling of replication lag / RPO under pre-outage load — the lab explicitly excludes this as it would bake in its own conclusion
- Cost-attribution tagging schemes across teams — covered in Module 11 but not part of the failover design itself
