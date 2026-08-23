### 1. The skill this module actually teaches

**Host:** So we've spent other modules going layer by layer — storage, networking, the model itself. This module is different: it's not another layer, it's the thing that spans all of them. What's the actual skill we're naming here?

**Guest:** Right, it's not knowing more components, which is the trap people fall into when they hear 'system design.' The skill is turning a vague request into something with known behavior, known cost, and a known failure envelope before you write a line of code. That means establishing constraints before you propose solutions, modelling capacity in numbers instead of adjectives like 'fast' or 'scalable,' identifying the one decision that's hardest to undo, and stating up front what evidence would prove your design wrong.

**Host:** And you're saying AI components turn up the pressure on every one of those four things at once.

**Guest:** Exactly — the model is the piece that usually motivates building the system, and it breaks the normal rules. It degrades quietly instead of throwing errors, it costs real money on every single call, and it can give you a different answer to the identical input twice in a row. So the constraints, the numbers, the irreversibility, the falsifiability — none of that is optional anymore, and none of it is forgiving if you skip it.

### 2. A design is a set of falsifiable claims, not a diagram

**Host:** So if I hand you a whiteboard with boxes and arrows, you're telling me that's not actually a design yet.

**Guest:** Right, it's a diagram, and a diagram just says what the parts are. A design says what the system does — this many requests per second, at this p99, at this cost per call, degrading this specific way when the index goes stale. Every one of those is a claim measurement can prove wrong, and if a claim can't be refuted, it's decoration, not design.

**Host:** Okay, so walk me through why that framing actually changes what you do first. What falls out of treating a design as a set of claims?

**Guest:** Three things. First, constraints come before components — pick the database before you know the constraint it satisfies and you've made a preference, not a decision, and you've got nothing to defend it with later. Second, reversibility is the axis that matters — most choices can be undone in an afternoon and deserve an afternoon, but a few, like the data boundary or the external contract, are expensive for years, so that's where the real thinking time goes. And third, if you can't measure a claim you can't operate the system, which for AI means a quality signal alongside the latency one, because fast, cheap, and quietly wrong is exactly the failure this discipline is built to catch.

### 3. The method as a loop, and where the expensive mistakes concentrate

**Host:** So walk me through this as an actual flow, not just a checklist. You said the design is a set of claims — where does the loop close?

**Guest:** You draft the claims, you draft the architecture that would satisfy them, and then you go measure whether it actually does. If the numbers disagree with the claim, you don't patch the diagram, you go back and revise the claim or the design that produced it. The loop is the whole method — a design isn't done when it's drawn, it's done when measurement agrees with it, and until then you're still designing whether you feel like it or not.

**Host:** And that's where the 'hardest to reverse' branches come in — you named data boundary and external contract already. What's the third, and why do these three specifically eat the budget?

**Guest:** State ownership — what a failure loses. If you don't decide up front who owns the source of truth for a piece of state, a crash doesn't just cost you uptime, it costs you data you can't reconstruct. Data boundary decides who can see what and you basically cannot retrofit it once other systems have grown around your leaky version. External contract decides how long you're stuck carrying a design after you've outgrown it. None of these are exhaustive, but in AI systems that's where the expensive mistakes concentrate, so that's where the thinking time actually goes.

### 4. Six questions that make constraints numbers, not adjectives

**Host:** So once you know where the expensive mistakes live, how do you actually pin the constraints down before you touch a component? You said earlier a design has to be falsifiable — where does that start?

**Guest:** It starts with six questions, and the rule is the answer has to be a number or a named party, not an adjective. Who calls this and how often — requests per second at peak, not average, because a batch job at 9am and even traffic across the day can hit the same daily total with wildly different capacity needs. How fast must it answer — a p99, not a mean, plus what happens when you miss it: does the caller retry, queue, or just fail.

**Host:** Those two feel like standard systems questions. Where does it start diverging for AI specifically?

**Guest:** Right at question three — how wrong may it be, and how would you know. 'Correct' needs a definition, and that definition needs an eval set, or you have literally no quality signal, just vibes. Then whose data is it — tenant, region, retention, the constraint that's discovered latest and costs the most to fix afterward — what does a call cost, tokens in, tokens out, retrieval hops, retries, because in AI systems cost per request is a design constraint, not a footnote — and what's the failure budget, which is the input to every redundancy decision downstream.

**Host:** And once you've got those six pinned down, you still don't know how the system actually behaves under load — that's the workload shape, arrival pattern, payload sizes, that kind of thing?

**Guest:** Exactly, and AI workloads have two properties generic services don't. Request cost swings by an order of magnitude depending on context length. And latency is dominated by a component whose behavior you don't control.

### 5. Little's Law and the arithmetic nobody does

**Host:** So let's actually do the arithmetic instead of gesturing at it. If I know arrival rate and latency, what do I get for free?

**Guest:** Concurrency, exactly. Little's Law: concurrency equals arrival rate times average latency. Two hundred requests per second at two seconds average latency means four hundred requests in flight at any given moment, and that number is derivable before a single line of code exists.

**Host:** And that number isn't academic — it's what sizes your connection pool, your replica count, your memory footprint.

**Guest:** Right, which is why the Workload and Capacity code is worth looking at directly — it takes peak rps, average latency, and token costs, runs the same Little's Law arithmetic, and sizes replicas off usable concurrency per replica after headroom. Drop headroom from thirty percent to ten and you cut replica count by roughly a fifth, but you've also pushed the system right up against the point where queue-wait time becomes your latency instead of the model call.

**Host:** So the model isn't a forecast, it's a set of numbers to argue with — if it says four hundred concurrent and your pool is configured for a hundred, you've found a bug before it shipped.

**Guest:** That's the whole payoff. And the trick that makes it actually useful: run it twice, once at the given constraints and once at ten times the request rate. Whatever breaks first in that second run is the single most important fact about the design, and it's also the exact question interviewers ask most reliably.

### 6. Finding the decision that is hardest to undo

**Host:** So before you even get to stress-testing a design, there's a prior question: which decisions in this design are even worth agonizing over? Because I don't think every choice deserves the same amount of deliberation.

**Guest:** Right, and that's the organizing question underneath the whole method: for each choice, if you're wrong, what does fixing it cost? A retry policy is a config change, so let whoever's closest to it just decide and move on. But a data model that mixes two tenants' embeddings into one index — that's not a fix, that's a migration, an audit, and a disclosure. Most decisions are two-way doors, walk back through them cheaply. A few are one-way doors, and those are the ones that deserve the meeting.

**Guest:** There's actually a caveat worth adding here, since the failure runs both directions. Treating every decision like a one-way door is the common failure — it's slow, it breeds committees, nothing ships. But the rarer failure is worse: treating an actual one-way door as if it were reversible, shipping the tenant-mixed index because it was Tuesday and someone wanted to move fast. The whole skill is classification before commitment, not caution as a default setting.

### 7. Case study: async-ai-gateway's constraints made concrete

**Host:** Let's ground that classification instinct in something concrete. The async-ai-gateway lab keeps coming up — walk me through how one of its constraints actually turned into a design decision, not just a feature.

**Guest:** Take 'many teams, each with their own quota.' That's not a feature request, it's a constraint, and it forces per-tenant rate limiting instead of one global limit. But it immediately raises the one-way-door question: where does the quota counter live? If it's in-process memory, it's correct on one replica and silently wrong on three — each replica enforces the limit independently, so a tenant gets three times their quota and nobody notices until they've built traffic patterns against the wrong number.

**Host:** So the fix has to be atomic across replicas, not just correct on a laptop. What does the lab actually do about that, and how would you know it's true rather than assumed?

**Guest:** It uses a Redis-backed token bucket where refill and consume happen in one Lua script — atomic by construction, not by convention. And it's checkable: at a capacity of 20 with two replicas, the atomic version allows 20 total, the naive get-then-set version allows all 40. The other two constraints follow the same pattern. 'A provider outage must not become our outage' produces health-aware routing and a circuit breaker, with the claim that a failing provider gets ejected within a bounded number of failures — verified in the test suite, not asserted in a design doc. And 'a rolling deploy must not kill in-flight requests' produces explicit draining with a stated timeout: in-flight work finishes within 30 seconds or gets abandoned on purpose, which is different from being killed by accident.

**Host:** So all three constraints are recoverable straight from the code — the quota script, the ejection test, the drain timeout — because someone wrote the claim down before writing the component.

**Guest:** Exactly, and that's the whole payoff. A design whose constraints live in someone's memory turns into a system nobody will touch within two quarters — not because the code is bad, but because nobody can tell which behavior is load-bearing anymore. Here, if you want to know what the system promises, you don't ask the person who built it, you read the Lua script, the breaker test, and the drain timeout.

### 8. Where designs quietly fail

**Host:** So let's talk about how these designs actually fall apart in practice, because I suspect it's the same handful of ways every time. What's the most common one you see, the one that's obvious even from outside the project?

**Guest:** A design that opens with a technology list. The moment someone starts naming the specific tools before anything else, you know they skipped the step that would justify those choices. The tell is simple: if you changed the requirements, would the diagram change? If not, the diagram was never derived from anything, and it won't survive the first hard question. Close behind that is the adjective problem — those aren't constraints, they're vibes. Nobody notices until launch, when the connection pool or queue bound turns out to have been picked by whatever the library defaulted to.

**Host:** Those two feel almost like bad habits you could catch with a checklist. But you've said the AI-specific failure is different — it doesn't even show up as a failure. Walk me through that one.

**Guest:** Right, this is the one that should keep people up at night. The system is up, it's fast, it's within budget — every dashboard is green — and the answers have been quietly getting worse for six weeks because an index rebuild changed how documents got chunked. Latency monitoring is structurally blind to this; it's not a latency problem or an error-rate problem, it's a quality problem, and only a scheduled eval set catches it. And that's really one instance of a bigger pattern: cost blindness, where nobody priced retries or ballooning context until the bill explained it, and irreversibility, where tenant data lands in a shared index or state gets owned by two components at once, cheap that week and expensive for years. Then there's the mirror image — building for a hundred times your actual traffic and paying the operational tax on that complexity forever. Same discipline fixes all of it: state the constraint, and let it justify the complexity or refuse to.

### 9. The trade-offs that don't resolve cleanly

**Host:** So none of these trade-offs actually resolve into a clean rule. Let's start with up-front versus iterative design, since that feels like the oldest argument in the room.

**Guest:** It never resolves cleanly because both sides are true. Up-front design catches the one-way doors while they're cheap, but it costs time before anyone's served; iterative design finds real requirements faster but quietly accumulates decisions you can't undo. The split that actually works follows reversibility — decide the data boundary, state ownership, the external contract deliberately and early, and let everything else be discovered by building.

**Host:** That same shape shows up in platform versus specific-case, doesn't it — build the general thing or just ship the one thing in front of you?

**Guest:** Exactly, and the tell is the second consumer, not the first. One use case is just a use case; a platform pays for itself around the third consumer, so before that it's speculative generality you're operating for nothing. Same logic covers abstraction — buy flexibility only where you can name the specific change you expect, commit everywhere else — and at Principal scope, a consistent stack usually beats the better-fitting fifth datastore once you count what it costs to run.

### 10. Security, performance, and scaling as one AI-shaped problem

**Host:** Let's pull three things together that usually get separate chapters — security, performance, and scaling — because in these systems they're really the same constraint viewed from different angles. Start with security, since you said the data boundary decision from earlier is really a security decision too.

**Guest:** Right, deciding which tenants share storage or a cache isn't just a scaling question, it's the whole security posture. Isolation by code — trusting every query path to remember the filter — is weaker than isolation by structure, and if you go shared, which is usually correct, the filter has to sit inside the query at a chokepoint everything crosses, not bolted on after retrieval. And AI adds surfaces perimeter auth never covers: retrieved documents, tool descriptions, model output feeding an action — a design whose security section is just authentication has handled the smaller half of the problem.

**Host:** So that same boundary decision now has to answer an audit question too — who accessed what, on whose behalf?

**Guest:** Exactly, and that's cheap if identity flows through the system from the start, nearly impossible to bolt on later. Now performance runs into the identical structure — you model the p99 as a sum across admission, retrieval, model call, post-processing, and design against the tail, because fan-out means a ten-backend request sees roughly the p99 of one of them as its typical case, not the mean.

**Host:** And the thing that actually saturates first isn't CPU, which is what trips people up when they go to scale this.

**Guest:** Right, it's provider concurrency or accelerator memory, so autoscaling on CPU is measuring the wrong thing entirely — you need queue wait measured separately from execution, or a starved system looks identical to a genuinely slow one on the chart. And scaling closes the loop: shard along the same boundary you chose for security, scale request handling and inference independently since their curves are unrelated, and remember cost scales with traffic here, so ten times the load is roughly ten times the model spend, which is what actually decides how far this design goes before it needs a different shape.

### 11. Saying it out loud: how this plays in an interview

**Host:** So say someone asks you this cold in an interview — walk me through your opening move, the thing you say in the first five minutes that signals you actually know what you're doing.

**Guest:** Constraints before components, always. Then you name the decision that's hardest to reverse — naming that hard part explicitly is the single highest-leverage thing you can do.

**Host:** And when the conversation turns into disagreement — which it will, someone pushes back on your design — how do you keep that from turning into a shouting match about taste?

**Guest:** You separate it into three buckets: constraint, evidence, or preference. If you disagree about constraints, that's actually an unstated requirement, resolve that first. If constraints agree but conclusions differ, name the evidence that would settle it and what it costs to get. If it's genuinely preference within the same constraints, it's a two-way door and not worth arguing over — and if they ask for a worked example, you say something like: hold p99 under 800 milliseconds at 200 requests per second, that's 400 in flight by Little's Law so the pool is sized for 400 with headroom, and if p99 blows past that at lower load, the model's wrong and you check queue wait against provider latency first because those need opposite fixes — plus recall@10 stays above 0.85 or retrieval has regressed, checked on every index rebuild since that's the event that causes it, not on a schedule.

### 12. Practicing the method, and what to read next

**Host:** So if someone wants to actually drill this rather than just nod along, where do they start?

**Guest:** Reverse it on something real: take async-ai-gateway and try to recover its constraints just from the code — what must have been true for per-tenant limiting, circuit breaking, and explicit draining to be worth the engineering effort? Write your guesses down before you look, then compare against the architecture page that actually states them. The gap between what you inferred and what was intended is the part of design that never survives into code, which is exactly the argument for writing it down in the first place. Then do the uncomfortable version on your own system: fill in real numbers, check the computed concurrency against your actual pool config and the computed cost against your actual invoice — in most systems one of those is off by more than double, and that gap is a finding either way.

**Host:** That's a good place to leave people. Anything you'd point them to afterward, for where these ideas actually come from?

**Guest:** Four things, in order of how often you'll use them: Bezos's one-way and two-way door framing from the 2015 shareholder letter, because it's the most portable idea in the whole module. Kleppmann's Designing Data-Intensive Applications for the storage and consistency decisions this method routes you into. The SRE book's chapters on SLOs and error budgets, for how a design claim becomes an operational commitment somebody's on call for. And Ousterhout's A Philosophy of Software Design for when an abstraction is actually earning its cost. And this handbook's own ADRs are worth reading cold, since they're worked examples of the written output this whole module is arguing you should produce.
