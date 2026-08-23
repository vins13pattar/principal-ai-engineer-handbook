# System Design Interviews for AI Infrastructure: What's Actually Being Tested

_AI infrastructure system design rounds look like open-ended whiteboard exercises, but they're sampling five narrow behaviors — and every candidate system in the track reduces to one dominant decision plus a set of failure modes that only AI systems produce._

- **Source:** [interview:ai-infrastructure-system-design](/interview/tracks/ai-infrastructure-system-design/)
- **Runtime:** 12:03 · 24 turns · 7 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The real exam inside the sandbox

**Host:** So let's start with the thing nobody tells you walking into one of these rounds: the 45-minute system design prompt is not actually asking you to design the system. Nobody expects a correct answer for something that takes a team a year to build, and the interviewer knows that better than you do. So what's really happening in that room?

**Guest:** They're sampling five specific behaviors, and honestly the prompt is just a pretext to elicit them. Do you establish constraints before you start naming components, do you know where this class of system actually breaks, can you argue a trade-off in both directions instead of just picking a favorite, do you have any observability story at all, and do you scope honestly when you clearly can't cover everything. That's it — that's the whole exam hiding inside the sandbox, and today we're going to walk through exactly how each of those gets tested and what a strong answer sounds like versus a weak one.

---

## 2. A method built to survive interruption

**Host:** Okay, so if that's the exam, what's the actual playbook for the 45 minutes? Because I think most candidates walk in and just start drawing boxes until the clock runs out.

**Guest:** Right, and that's exactly the failure mode. The method is six steps, time-boxed: constraints first for maybe five to eight minutes — who calls this, how often, how wrong can it be, whose data is it, and for AI systems specifically, what does correct even mean and how would you catch it degrading. Then you name the hard part out loud in under two minutes, something like 'the hard part is permission filtering has to happen inside the index query, not after' — that single sentence buys you credibility and steers everything downstream. Then you sketch one request path end to end, not a component inventory, spend your real time going deep on the piece you just named as hard, then you volunteer the failure modes and what you'd measure before anyone has to ask, and only after that do you get into scale and cost and what you're cutting.

**Host:** So the ordering itself is doing work — you're not saving the hard stuff for later, you're front-loading it. Where does volunteering failure modes fit into that, and why does it matter so much if you do it early versus waiting to be asked?

**Guest:** Because the single most common way people lose this round is spending twenty minutes on boxes and then getting asked about failure modes with five minutes left, which just reads as them running out the clock before hitting the material that actually distinguishes them. If instead you volunteer it — here's what breaks, here's what I'd measure, before anyone asks — it signals you've operated one of these systems, not just designed one on a whiteboard. And practically, it means there's still time left to actually explore it with the interviewer instead of rushing a bullet list at the buzzer.

---

## 3. Seven systems, seven dominant decisions

**Host:** So let's say the prompt lands — gateway, durable agents, tool execution, RAG, serving, MCP, reliability, whatever it is. You've said the move is naming the dominant decision in the first five minutes. Walk me through what that actually looks like across a few of these, because I don't think people believe there's really just one thing per system.

**Guest:** There basically is, and it's almost always a place where the obvious implementation is wrong in a specific, nameable way. Gateway: everyone reaches for per-replica rate limiting, and the dominant decision is where quota state lives — if it's per-replica, you've just multiplied every tenant's real limit by your replica count without meaning to. Durable agent execution: at-least-once is the ceiling you're going to live under no matter what you build, so the real decision is whether your handlers are idempotent, because that's the only thing that gets you exactly-once effect. Tool execution: scope, validation, quota, and approval feel like one blob of 'safety,' but they're four separate questions and the order they run in is the design. RAG: permission filtering has to happen inside the index query itself, not as a filter you bolt on after retrieval. Serving: cold start takes minutes, so any autoscaling signal that trails load is mathematically too late — that's not a tuning problem, it's a structural one.

**Host:** So the pattern is: figure out where the naive version quietly breaks, and say that out loud before you've drawn a single box. What's the payoff for doing it in minute two instead of minute twenty?

**Guest:** It reframes the whole conversation from 'can you draw a coherent architecture' to 'do you already know where this class of system bites you' — and that second thing is what they're actually screening for. It also buys you the rest of the round, because the interviewer stops probing for the gotcha and starts letting you build around the constraint you already named. You end up spending forty-five minutes on the interesting trade-offs instead of forty on boxes and five getting cornered on the thing you should've led with.

---

## 4. Case study: the gateway's quota trap

**Host:** Let's actually run the method on one system instead of talking about it in the abstract. The async AI gateway — multiple stateless replicas behind a load balancer, and you said the dominant constraint is that nothing can be safely kept in one replica's memory. Walk me into the trap that constraint creates.

**Guest:** So the natural instinct is per-tenant rate limiting, and the naive version keeps a counter in each replica's memory — clean, fast, no external dependency. It works perfectly in a single-replica demo and then silently breaks the moment you scale to three replicas, because each replica enforces its own limit independently, so a tenant's quota effectively multiplies by however many replicas are running. Nobody sees an error, nothing crashes, the quota just multiplies by replica count.

**Host:** So the fix is Redis — a shared counter every replica checks against. But you flagged that as trading one failure mode for another.

**Guest:** Exactly, and this is the part interviewers actually care about — what happens when Redis goes down. You have to choose deliberately: fail closed and reject requests to protect quota enforcement, which costs you availability, or fail open with a tighter local emergency limit to protect availability, which costs you weaker enforcement. Either answer is defensible, but 'I didn't think about it' isn't — because the real failure mode isn't picking the wrong one, it's hanging on a Redis call with no timeout and taking the whole gateway down with it.

---

## 5. Case study: the ceiling of at-least-once

**Host:** Let's stay in this same failure-mode territory but move to durable agent execution — the systems that run long agent workflows with retries and checkpoints. What's the equivalent 'do you know the ceiling' question there?

**Guest:** It's whether a candidate accepts that at-least-once is the ceiling, full stop — exactly-once delivery isn't on the menu. Any handler with side effects has to be idempotent, because a handler will occasionally run twice, and the classic trap is thinking a dedup key on submission solves it. It doesn't — that prevents duplicate tasks, not duplicate deliveries of the same task, which at-least-once guarantees will happen.

**Host:** So where does that duplicate delivery actually bite you in practice — what's the scenario that catches people off guard?

**Guest:** The zombie worker. A worker pauses long enough — GC pause, suspended VM, blocked syscall — that its lease expires, the task gets reissued and finishes elsewhere, and then the zombie wakes up still convinced it owns the work. Without a fencing token its late ack marks something done that another worker is running, or its late checkpoint overwrites newer progress — and the second question right behind it is whether you're dead-lettering on delivery count or failure count, because a handler that reliably kills its worker never reports an explicit failure, so counting failures lets it crash-loop forever while counting deliveries bounds that at the cost of occasionally dead-lettering a task that was never actually at fault.

---

## 6. What generic systems design misses about AI

**Host:** Let's zoom out from failure modes for a second, because I think there's a bigger gap here — candidates who are genuinely good at distributed systems still stumble on these rounds. What's actually missing?

**Guest:** They treat the model call as a function that returns a string. Models degrade without erroring, they cost real money per call, their latency has a long tail, and identical inputs can produce different outputs — and if your design can't say how it detects its own quality regressing, you've built something nobody can operate. Cost is the other blind spot: in these systems it's not a capacity footnote, it shapes caching, routing, context size, model selection, and if it never comes up your design reads like it's never touched production. Then there's retrieval — saying 'we'll use a vector database' is a component choice, not a design, and the interviewer asking about RAG wants to hear about chunking, hybrid retrieval, reranking, and an actual eval set. And security has a second half nobody mentions: retrieved documents, tool descriptions, model output feeding a downstream action — perimeter auth doesn't touch any of that.

**Host:** So beyond naming those gaps, is there a second thing being tested — not whether you know the right answer, but whether you can argue against yourself?

**Guest:** Exactly, and there are four trade-offs that come up constantly where the interviewer wants both directions, not a verdict. A gateway buys uniform policy and failover at the cost of a hop and a component to run — direct calls are simpler until a second team needs different quota rules. Shared infrastructure amortizes ops but makes isolation a property of code where a missing check becomes a breach, versus per-tenant deployment making isolation structural but growing cost linearly. Closed-by-default on policy failure protects the capability surface but turns a policy outage into a full outage, while open keeps things running but silently disables authorization — the good answer decides that per tool, not globally. And a database queue gives you transactional enqueue and kills the dual-write problem, while a broker gives you throughput at the cost of a second system to operate — say only one of those and you've shown a preference, not a position.

---

## 7. Turning the map into rehearsed answers

**Host:** So if someone's prepping this weekend, what does 'ready' actually look like — not as a feeling, but as a checklist they could grade themselves against?

**Guest:** Seven items. You can name the dominant decision for each candidate system cold, no notes. For each system you can list three failure modes and the specific metric that would catch each one. You can argue at least four trade-offs in both directions, not just state a preference. You have a cost story, meaning you know the dominant cost line and the one lever that moves it. You have an evaluation story — how the system notices its own quality slipping, not just whether it's up. You can say what you'd cut from v1 and defend the cut. And you've actually run one of the labs, so at least one answer in the room comes from something you operated, not something you read. If you want the actual question sets, every architecture page has an interview questions section written for exactly this round, and modules zero, two, four, and twelve cover decision framing, distributed systems guarantees, the AI infrastructure layer, and the observability half of every answer — that's the map, go run it.
