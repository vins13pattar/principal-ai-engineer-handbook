# Module 12: Observability — What Actually Happened, and What Metrics Can't See

_Metrics, logs, and traces answer 'what happened to this request' fast during an incident, but all three are structurally blind to a confidently wrong AI answer — so every practical discipline in this module, from agent-aware tracing to SLO burn-rate alerting to redact-before-storage logging, has to be paired with a fourth, independently monitored signal: evaluation._

- **Source:** [module:12-observability](/learn/modules/12-observability/)
- **Runtime:** 14:46 · 42 turns · 11 beats
- **Written by:** claude-sonnet-5 on 2026-08-22
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The one question observability has to answer fast

**Host:** Welcome back. This module is about observability, and I want to start with the question that actually matters when something's on fire: what happened to this one request, and why did it happen? Not the aggregate, not the dashboard trend — this specific request, right now.

**Guest:** Right, and that's the framing we should hold onto for the whole module. Metrics tell you something's wrong across the system — error rate ticked up, latency's spiking. Logs and traces are what let you zoom into one request and reconstruct exactly what it did and why it failed.

**Host:** So those three feel like the whole observability toolkit — until you're running an AI system, apparently. You mentioned there's a fourth signal that has to sit alongside them. Why can't the classic three just cover it?

**Guest:** Because a slow, cheap, confidently wrong answer looks completely normal on every one of those dashboards — fast response, low latency, no error thrown. Metrics, logs, and traces are structurally blind to whether the answer was actually correct, which is exactly why evaluation-based quality monitoring has to be its own independently watched signal.

---

## 2. Three signals, one shared identifier — and their common blind spot

**Host:** So walk me through the actual mental model here, because 'observability' gets thrown around like it's one thing. It's really three separate signals, right?

**Guest:** Right — metrics, logs, and traces, and they're stitched together by a shared request\_id. Metrics are the aggregated numbers, request rate, error rate, latency percentiles, cheap to store and great for spotting that something's wrong right now. Logs are the discrete timestamped events, structured key-value ideally, and that request\_id is what lets you pull every log line across every service that touched one specific request. Traces are the tree of timed spans showing the actual path that request took, every downstream call, in sequence — it's the only one of the three that shows you causality directly.

**Host:** Okay, so between the three of them you can reconstruct exactly what a request did, end to end. But you just said none of that tells you if the answer was right.

**Guest:** Exactly — all three describe how a request executed, not whether the output was correct. A hallucinating model produces a 200, normal latency, a clean trace. There's no field in any of those three signals for 'this answer was confidently wrong,' which is why that evaluation harness has to run as its own independently watched layer wrapping the whole system, not as a feature bolted onto metrics or logs.

---

## 3. Why agent fan-out demands span-level tracing

**Host:** So let's zoom into that trace itself, because a single user request to an agent isn't one call anymore — it's fanning out into multiple model calls and tool invocations, right, the stuff we covered back in the agent engineering and MCP modules.

**Guest:** Right, and that's exactly why span-level tracing matters specifically for agentic systems. You've got a top-level request span, and nested underneath it you get llm.call spans and tool.call spans. Each of those is its own span, not just one blob of latency for the whole request.

**Host:** And without that nesting, what do you actually see when something inside goes slow?

**Guest:** Just elevated latency on the outermost span, full stop. You have no idea which inner step caused it — the outer span can't tell you which step is responsible, only that something did.

---

## 4. RED for services, USE for the resources underneath them

**Host:** So if the trace tells you something's wrong but not which inner step, what do engineers actually pull up first when they get paged? There's got to be a standard starting point before you even go span-diving.

**Guest:** Yeah, that's RED — Rate, Errors, Duration, usually a latency histogram. It's the metric set for the service itself, and it maps onto the exact questions an on-call engineer asks first: are we getting hit harder than usual, are requests failing, are they slow. But RED only tells you the symptom is happening, not why.

**Guest:** That's where USE comes in — Utilization, Saturation, Errors — but for the resources underneath the service: CPU, memory, GPU, the KV cache budget we covered back in Module 9. RED shows you the symptom, and USE is usually what explains why it's happening.

---

## 5. SLIs, SLOs, and spending an error budget on purpose

**Host:** So once you know CPU or KV cache saturation is the culprit, how do you decide when that actually deserves a page versus just being noted for later? That's presumably where SLOs come in.

**Guest:** Right, and the vocabulary matters here. An SLI is the specific measured thing, like p99 latency. The SLO is your target for it, say p99 under 800 milliseconds over a rolling 28 days. And the error budget is how much violation of that target you can afford before it's genuinely unacceptable. The trick is alerting not on every threshold crossing but on burn rate — how fast you're consuming that budget — because a brief latency blip and a trend that will exhaust your whole month's budget by Tuesday look identical on a threshold alert, but they demand completely different responses.

**Host:** And that's not just theory — the SLO-driven-ops lab actually builds a controller around that distinction, doesn't it?

**Guest:** Exactly, it implements multiwindow burn-rate alerting with an autoscaler that treats a fast burn as categorically different from ordinary load. Normally the controller respects a cooldown so it doesn't flap on noisy utilization samples, but the code explicitly checks burn severity before it checks cooldown at all — if it's a fast burn, it scales up immediately, because an active outage isn't something you wait out a noise-suppression timer for. Every other scaling decision still obeys the cooldown; this is a narrow, deliberate escape hatch for the one case that timer was never meant to slow down.

---

## 6. Where async code silently breaks a trace

**Host:** Let's shift to something that trips up even teams who've done tracing right everywhere else: async code. We flagged this back in Module 1 as a landmine for implicit state — does it come back to bite tracing specifically?

**Guest:** Constantly, and it's because a trace only works if the trace ID and parent span ID physically travel with the request across every boundary — an HTTP hop, a queue message, a spawned task. The moment you fire off a background task without explicitly carrying that context forward, the new span has no parent to attach to.

**Host:** And what does that look like to the person debugging it — do they at least get an error pointing at the gap?

**Guest:** That's the cruel part, no. You just get an orphan span, or a trace that looks incomplete with a step missing, and nothing throws — the background task ran fine, it just isn't linked. It's a silent structural gap, not a failure, so it's exactly the kind of thing that hides until someone's staring at a trace during an incident wondering where a step went.

---

## 7. Structured logs, AI-specific fields, and redact-before-storage

**Host:** Okay, so let's go from the tracing gap to the logs themselves. Why is a structured log line actually different from just writing a good sentence to a file?

**Guest:** Because during an incident nobody has time for regex archaeology. If every log is a JSON object with consistent fields — request\_id, tenant\_id, latency\_ms — you can query it instantly, filter it, join it with the trace. Free text means someone's grepping and guessing at 2am, and for AI systems you want token counts, model identifiers, and cost sitting as structured fields on that same line, not stashed in a separate billing system you have to manually correlate after the fact.

**Host:** And prompts and responses themselves — you'd think logging the full content is exactly what you want for debugging, so where's the catch?

**Guest:** The catch is those prompts and responses carry the same sensitive data everything else is built to protect — pasted credentials, customer PII, whatever a user typed in a support query. So redaction has to happen before it ever reaches the logging pipeline, not as an access-control rule on who's allowed to query the logs afterward. Once it's stored unredacted, restricting query access doesn't undo the fact that you already have it sitting there — and the telemetry store holding all this is now its own attack surface, not just a debugging convenience.

---

## 8. A minimal tracer: cost, tokens, and redaction as span attributes

**Host:** So let's make that redact-before-storage promise concrete. Walk me through what this tracer actually looks like in code.

**Guest:** It's small on purpose. You've got a Span that's just a name plus a dictionary of attributes, and a Tracer whose start\_span context manager opens a span, times it, and appends it to a list of finished spans when it closes. The interesting part is inside call\_model — before anything gets set on the span, the prompt goes through redact, which does a straight substring replace of anything sensitive with a literal '\[redacted\]' marker. Only the redacted version ever gets assigned to llm.prompt\_redacted, alongside llm.model, token counts, and an estimated cost computed straight from the token count. So one span attribute set gives you what happened, how much it cost, and what model did it — no separate cost system to join against.

**Host:** And the lab makes you prove that redaction actually held, not just that the function exists somewhere.

**Guest:** Right — the test calls call\_model with a prompt containing a marker like 'api\_key: sk-test-123' in the sensitive\_substrings list, then it doesn't check the return value, it inspects tracer.finished\_spans and asserts that marker string doesn't appear in any attribute on any span. That's a materially different claim than 'we have a redact function' — it's checking the artifact that actually gets persisted and queried later.

---

## 9. Case study: chasing a latency regression into one tool call

**Host:** Okay, let's put all of this together with an actual incident. The p99 latency SLO starts burning fast, error budget's draining, on-call gets paged. What do the RED metrics actually show you at that point?

**Guest:** Just elevated duration on the top-level request span — that's it. RED is service-level by design, so all you know is 'requests are slow,' which in an agentic system could mean the model's slow, a tool's slow, or the orchestration logic itself is stalling. That ambiguity alone isn't enough to diagnose anything.

**Host:** Which is exactly the wrong move here, based on what you're setting up.

**Guest:** Right — that's the trap. Once you drop into the nested spans, llm.call and tool.call under that same trace, the picture changes completely: the model calls are all executing at normal latency, and the slowdown is isolated to one specific tool call wrapping a downstream API that's degraded. Without span-level tracing through that fan-out, this reads as a generic model latency regression and sends the on-call engineer to debug the wrong system entirely — the SLO told them something was wrong, but only the trace tree told them where.

---

## 10. What goes wrong: cardinality explosions, alert fatigue, and unbounded trace cost

**Host:** That case study worked out because someone could actually query the trace tree fast and find the one bad tool call. But all this instrumentation isn't free — where does it actually bite you operationally?

**Guest:** The classic one is cardinality. Someone adds a raw user ID or request ID as a metric label instead of a bounded dimension like tenant tier, and now the backend is storing a distinct time series per user. Nobody notices at first — it's silent until query performance or storage cost degrades enough that someone goes looking, and by then it's hard to trace back to the label that caused it.

**Host:** And that's not just a cost problem for the team that added it, right? It slows the whole backend down for everyone.

**Guest:** Exactly, it degrades queries for every team hitting that store. And it compounds with two other cost dynamics: alerting on every threshold crossing instead of burn rate trains on-call to ignore pages, and trace and log volume scale with request volume, not with usefulness — the millionth identical successful trace tells you nothing, which is why sampling and tiered logging exist. Multi-region setups add a fourth wrinkle too — a single global backend every region writes to synchronously just reimports the cross-region coupling Module 11 argues against everywhere else in the architecture.

---

## 11. The fourth signal: why evaluation has to run on its own

**Host:** So let's land on the thing this whole module has been circling. A model provider quietly swaps the version behind a stable endpoint, or someone edits a production prompt, and every dashboard we've built stays green — the trace looks clean, latency is fine, the RED metrics don't move. Nothing here catches that.

**Guest:** Right, because all three signals describe execution, not correctness. Status code, duration, path through the system — none of that encodes whether the answer was actually good. That's why Module 4's evaluation harness has to run continuously and independently, scoring live or sampled output against a rubric on its own schedule, not triggered by anything observability noticed, because observability structurally can't notice. Treat a model or prompt change exactly like a deploy: canary it, compare eval scores against baseline, keep a rollback path — the same rigor as code, because it changes behavior the same way code does.

**Host:** And one last thing before we close — all this telemetry we've spent the module building is itself sensitive. As we covered earlier, redact before storage, not after — and beyond that, the traces and logs need real access control, because a database full of request payloads and internal topology is a target, not just a debugging convenience. That's the module: three fast signals for what happened, one independent signal for whether it should have happened at all, and don't forget to lock the door on all four.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A step-by-step OpenTelemetry SDK instrumentation walkthrough
- A head-to-head comparison of specific commercial tracing/logging backend vendors
- Detailed cost modeling of running a self-hosted metrics/trace backend at scale
