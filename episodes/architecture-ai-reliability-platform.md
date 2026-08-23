# Architecture: AI Reliability Platform — One Severity Signal, Three Consumers

_An AI reliability platform works only if alerting, autoscaling, and incident response all read the same severity number — and that number has to survive slow actuators, ambiguous utilization, and a quality failure mode infrastructure metrics can't see._

- **Source:** [architecture:ai-reliability-platform](/architecture/systems/ai-reliability-platform/)
- **Runtime:** 15:19 · 31 turns · 10 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The dashboard-impression problem

**Host:** Let's start with something that sounds almost too obvious to say out loud: how do you know if your platform is healthy right now? For most teams the answer is someone looks at a dashboard and forms an impression. That works fine until you're paged at 3am and you need an actual answer, not a vibe.

**Guest:** Right, and the fix people reach for is an error budget — a number instead of an impression, something you can spend, alert on, escalate on. But here's the catch: that number only matters if three different consumers agree on it. Alerting needs it to decide whether to wake a human, autoscaling needs it to decide whether to add capacity, and incident automation needs it to decide how far to escalate.

**Host:** And normally those three things get built at different times by different people, reading different signals entirely, so they quietly disagree — which surfaces exactly during the incident where you needed them to agree. So today we're talking about building one severity signal all three can share, and two things that make this genuinely harder for AI systems: your actuator is slow because loading weights takes minutes, and the metric that actually matters most is quality, which no infrastructure dashboard will ever show you.

---

## 2. What the platform must guarantee

**Host:** So let's lay out the actual checklist before we get into the hard parts. If I'm building this platform, what does it have to guarantee, top to bottom?

**Guest:** Seven things, and they build on each other. Start with an SLO derived from actual user impact, not whatever's convenient to measure. Then burn-rate alerting that can tell a blip from a sustained burn and clears itself promptly instead of paging you forever. That feeds one severity signal that alerting, scaling, and incident response all read identically. Scaling has to respond to that severity number, not just raw utilization. Runbooks need to escalate rather than retry blindly, with a bounded number of attempts per step. When automation runs out of moves, you need an honest terminal state that says so instead of pretending. And running through all of it, quality has to be a first-class SLI right alongside availability and latency — not an afterthought nobody's watching.

---

## 3. The constraints that shape every design choice

**Host:** Okay, before we go further into the seven pieces, I want to understand the physics here — what actually forces the design to look this way? You mentioned burn-rate alerting that catches sustained problems without paging forever. Why can't one window just do both?

**Guest:** Because those two jobs pull in opposite directions. A short window clears fast but flags every blip as an emergency; a long window ignores blips but takes forever to both trigger and reset, so you end up paging on noise or sitting silent through a real burn — you need two windows working together, not one compromise window. That same window problem shows up with the SLO itself: '99.9 percent' means nothing until you attach a window, because the window is what decides how much failure is affordable and how fast that budget actually burns. And there's a matching constraint on the automation side — your actuator, say an autoscaler, has minutes of dead time between deciding and taking effect, and if that correction takes longer than the incident it's reacting to, it doesn't stabilize anything, it oscillates, scaling up and down against its own lag. Then two more things you have to accept going in: quality has no free signal the way latency and availability do — the infrastructure layer just doesn't see it, so whatever SLI you build for quality is a deliberate construction and always a proxy, never the real thing. And last, anything your platform does automatically during an incident — scaling, retrying, rerouting — becomes a new variable the human responder has to reason about, which means automation isn't neutral help, it's another moving part in the incident itself.

---

## 4. Inside the control loop: burn rate and shared severity

**Host:** So walk me through the actual mechanics — what's literally being computed every time a request comes in and finishes?

**Guest:** Every outcome lands in a rolling window that's pruned back to the SLO's budget window — so you're always looking at exactly the span that matters for that budget, nothing older. From that you compute burn rate: observed error rate divided by the rate the budget actually allows. A burn rate of 1.0 means you're on pace to exhaust the entire budget precisely at the end of the window.

**Host:** And that's where the long-and-short window rule comes back in — this is what actually decides whether to page someone?

**Guest:** Right, each alert rule evaluates burn rate over both windows and only fires when both exceed threshold together — the long window filters noise, the short window lets the alert clear within minutes once the burn actually stops. And here's the payoff: that same severity number gets read by the autoscaler and the incident runner, no separate calculations, no translation layer. Since they're both deriving it from the identical computation, they literally cannot disagree about how bad things are.

---

## 5. Six ways this goes wrong without the design

**Host:** Okay, so walk me through what actually goes wrong if you don't build it this way. What breaks first?

**Guest:** Start with the alert window itself — pick it short and every transient blip pages someone into a flapping mess, pick it long and a genuine fast burn goes unnoticed for most of its life, then keeps paging long after it's actually stopped. A uniform cooldown makes the mirror-image mistake on the scaling side: it exists to stop the autoscaler flapping on noise, but applied blindly it also throttles the one case where waiting is actively harmful, the real fast burn. Then utilization alone can't tell you whether traffic genuinely grew or the service is failing and client retries are inflating load, so scaling on it blindly means feeding capacity straight into a retry storm — and if remediation fails, retrying it assumes the step was broken when usually it was just the wrong step, so a restart against a capacity problem burns the incident's clock with nothing to show and no record of who was told. Automation that loops forever or dies silently when it runs out of steps hides the one fact a responder most needs, that nobody has fixed this and it's now theirs — and a target chosen because it's comfortably achievable gives you a budget that never depletes and an alert that never fires, so everything reads green while the failure stays completely invisible.

**Host:** That last one's the scariest to me, honestly — a system that's engineered to always look fine. So when you say an honest terminal state is a feature, not an admission of failure, is that the actual design principle holding all six of these together?

---

## 6. Why the complexity is worth it

**Host:** It is, and it's why I want to walk through the price tag on this thing rather than just admire the elegance of it. Every one of these design choices costs something real — configuration complexity, engineering time, slower response to routine failures. So convince me the bill is worth paying.

**Guest:** Take the two windows first. A short window alone gives you noise, a long window alone gives you blindness to real spikes — you need both, and that means every severity level now needs a threshold plus two window lengths, which is genuinely harder to explain to the person getting paged at 3 a.m. But the alternative is alert fatigue or missed incidents, and both of those destroy trust in the alert faster than any amount of configuration complexity destroys trust in the on-call rotation. Same logic with automation: bounding every automated step with a timeout and forcing an escalation instead of a retry means you give up some speed on routine failures, because paging a human immediately is actually slower for those routine failures and it hands the responder a system that's already been touched by a failed automation attempt. What you buy back is a finite downside — automation can never spin forever silently changing system state while nobody's watching. Then the SLO target: setting it tight costs engineering time chasing degradation users may never notice, but a target that's never once burned its budget isn't a safety margin, it's proof you're not measuring anything real. And the quality SLI is the clearest case of all — it's an imperfect proxy, it needs its own pipeline, it can even regress without you noticing. But it's the only one of the four signals that can see the failure mode unique to these systems: fast, well-formed, confidently wrong. An imperfect signal on that is still infinitely better than silence.

**Host:** So in every case the expensive option isn't complexity for its own sake — it's the price of the system telling you the truth instead of just looking calm. That's a pretty clean thread through all four.

---

## 7. Scaling the measurement system and its bill

**Host:** So if all four of those failure modes get handled by design, does the design itself have to keep growing as the platform does? What does it cost to keep this thing telling the truth at scale?

**Guest:** It does, and very literally — the SLI pipeline has to outscale the service it watches, because instrumentation that buckles under load blinds you exactly when an incident starts. That scaling carries a real bill: a thirty-day burn-rate window means thirty days of five-minute-resolution data sitting in storage, so window length is a retention decision, not a config tweak. Multiply that by dozens of per-service SLOs and definitions need to be data rather than code, the controller has to beat the actuator's cold-start latency or it acts on stale state, and every remediation step needs to be idempotent since retries and duplicate alerts will fire it twice.

**Host:** And the dollars follow that same logic — warm headroom sitting idle is a standing cost you're paying to remove incident latency, a mistuned burn-rate rule triggers real spend as well as a real page. On-call, paid out one bad alert at a time, ends up being the biggest line item precisely because it's the one nobody puts on a slide.

---

## 8. Privilege, exposure, and what to watch

**Host:** Let's talk about the attack surface, because a system that acts on your behalf is a system worth breaking into. If a runbook step can restart a service or scale infrastructure, whoever can trigger that alert effectively holds those credentials too.

**Guest:** Exactly, so the trigger path needs the same scrutiny as the action itself. And it compounds — an on-call schedule is personal data and an availability map at once, telling an attacker precisely when response is thinnest. Incident records are worse still, since they capture systems in their least redacted state and get retained the longest, and the SLI pipeline underneath is carrying real request content that has to be scrubbed before it ever becomes a metric.

**Host:** So what actually has to be on the glass to make this reviewable instead of a black box — for security and for everyone debugging at 3am?

**Guest:** Signed burn rate with both windows, so you can see exactly which crossed and when. Unclamped budget remaining, because clamping at zero throws away how far over you actually are. Explicit severity as a queryable signal, since that's the contract every consumer reads. Scaling decisions with their reason — proportional, cooldown, fast-burn override — and runbook step outcomes: resolved, timed out, escalated, exhausted. Every automated action needs an audit trail as rigorous as a human's — what fired, why, under what authority, what it changed.

---

## 9. From checklist to running system

**Host:** So if I wanted a one-line definition of done for all of this, it sounds like it's that checklist — SLO derivation written down, both windows exported, one severity computation feeding everything, the cooldown override tested, runbook steps idempotent and timed out, and an honest exhausted state. That's not aspirational, that's a build sheet.

**Guest:** Exactly, and it doesn't stay theoretical — there's a lab that implements that exact loop. Multiwindow burn-rate alerting where a rule only fires when a long window and a short window both cross threshold, an unclamped budget-remaining fraction that goes negative instead of floor-ing at zero, and an autoscaler that behaves normally until a page-severity burn shows up, at which point it bypasses cooldown entirely because that's not noise, that's an active outage. Runbook steps escalate on their own timeout instead of retrying, and if every step is exhausted it reports EXHAUSTED with the last contact paged, not a silent stop.

**Host:** And the cooldown override specifically — that's the piece that always sounds risky until you see the reasoning.

**Guest:** Right, the controller checks burn severity before it checks cooldown at all — if the severity matches fast-burn and you're under max replicas, it scales up immediately regardless of the timer; every other decision still respects cooldown normally. It's a narrow, deliberate escape hatch for the one case a noise-suppression timer was never meant to slow down, and the whole thing runs on an injectable clock so the tests cover hours of windows and cooldowns in under a second, no real sleeping required.

---

## 10. The questions that test if you actually understand it

**Host:** So if someone wanted to check whether they actually absorbed this instead of just nodding along, what would you ask them? Let's run the gauntlet — two windows, the cooldown jump, one shared computation, escalate versus retry, EXHAUSTED, and a budget that never depletes.

**Guest:** Two windows: one can't do both jobs, so you need both to cross. Cooldown gets skipped on severity because that timer's for noise, not for users being failed right now. One shared computation because three subsystems reading three signals will disagree at the worst possible moment. Escalate over retry because the problem is usually the wrong remediation, not a bad execution, and escalation leaves a trail retry doesn't. EXHAUSTED exists so the responder knows it's theirs now instead of watching a silent loop. And a budget that never depletes isn't a win — it means the target's too loose or the SLI isn't tracking what users actually feel.

**Host:** That's the whole argument in six answers — every one of them a place teams cut a corner and paid for it later. If you remember nothing else from this, remember that: the same severity number driving alerting, autoscaling, and incident response isn't an elegant nicety, it's the only way to keep those three from quietly working against each other. Thanks for walking through all of it.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- Concrete guidance on how to set the numeric SLO target or specific window lengths for a given business
- How to construct a quality SLI proxy in practice (what metric, what pipeline) beyond stating it must be deliberate
- Detailed comparison of vendor tools for implementing burn-rate alerting or incident automation
- How this platform's severity signal would integrate with the Model Serving Platform's own canary or batching decisions beyond the shared cold-start constraint
