### 1. Burn rate as a spendable, alertable number

**Host:** So let's start with a number that most dashboards get wrong: the error budget. The instinct is to clamp it at zero once you've blown it, right? Zero means bad, done, move on. But this lab does something different — it lets that number go negative.

**Guest:** Right, and that's the whole point. Budget remaining fraction going negative tells you how far over you are, not just that you're over. Clamping to zero erases that distinction exactly when you need it most. It reframes reliability as something you spend deliberately, not a target you either hit or miss.

**Host:** Okay, so if we're treating it as a spendable quantity, the next problem is alerting on the rate you're spending it — and that's where it gets tricky, because a single window either pages you on noise or catches things too late.

**Guest:** Exactly, that's a real trade-off, not just a tuning knob. A short window is twitchy — one bad minute and you're paged for nothing. A long window smooths that out but by the time it crosses threshold you've already burned way more budget than you should have. So the lab requires both: a long window like an hour to confirm this is a real burn, and a short window like five minutes riding alongside it so the alert actually clears within minutes once the burn stops. Neither window alone can do both jobs.

### 2. One severity, two consumers: the cooldown override and escalation over retry

**Host:** So once you've got that severity number, what actually consumes it? You mentioned it drives the autoscaler directly — walk me through that.

**Guest:** Right, so normally the autoscaler has a cooldown timer to stop it flapping on noisy utilization samples — you scale up, then you wait before scaling again. But the controller checks burn severity before it even looks at cooldown. If severity is fast-burn and you're under max replicas, it scales up immediately, cooldown or not.

**Host:** That feels risky on paper — bypassing your own safety mechanism. Why is that actually the right call instead of just a bug waiting to happen?

**Guest:** Because a cooldown is designed to suppress noise, and a page-severity burn isn't noise — it's the service actively failing users right now. Waiting out a timer built for noisy metrics is the wrong response to a real outage. It's a narrow escape hatch for exactly one case; every other decision still respects cooldown normally. And the same severity number does this on the incident side too — the runbook's three steps, restart, scale up, page on-call, each run under their own timeout, and if a step doesn't resolve things it escalates to a named contact instead of retrying blindly. If all three steps burn through without resolution, the incident reports EXHAUSTED with the last contact paged, rather than looping forever or just quietly giving up.

### 3. Trying it yourself and what's still a stand-in

**Host:** So if someone wants to see all this actually run, what's the fastest path? I imagine there's a way to spin it up locally and just watch the severity number change behavior in real time.

**Guest:** Yeah, it's a small FastAPI app — go into the labs slo-driven-ai-operations directory, pip install with the dev extras, and run uvicorn. It registers one demo service, checkout-api, with a real runbook of restart, scale up, page on-call. You post a healthy autoscale request first and see ordinary proportional scaling, then you hammer it with fifty failed requests in a loop, and now the SLO endpoint reports page severity and the incident you open escalates the same way we described. Run pytest after — 32 tests, plus ruff and mypy — so you're not just trusting the demo, you're watching the same invariants get checked in code.

**Host:** Before we wrap — is there anything here that's a stand-in, something you wouldn't ship as-is?

**Guest:** One honest gap: the Clock is injected and deterministic, which is great for tests but obviously not talking to a real metrics backend yet. The important thing is that it's the exact seam where one would plug in a real metrics backend, so wiring in real burn-rate data is an integration, not a rewrite of the severity or runbook logic. That's really the whole point of this lab: get the one severity computation right and boring, and everything downstream, alerting, scaling, incidents, just inherits that correctness.
