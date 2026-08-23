### 1. The core mistake: wiring tool calls straight to dispatch

**Host:** So let's start with the mistake that shows up in almost every early agent platform: you take the model's tool call, and you wire it straight into a dispatch table. The model decides to issue a refund and, well, the system just does it. What could go wrong?

**Guest:** Everything, because that architecture quietly redefines what your permission system even means. A tool call from a model is a request, not an authorization — but if dispatch treats them as the same thing, then the actual boundary of what your agent can do is no longer defined by your policies. It's defined by whatever the model can be talked into, by a user, by some retrieved webpage, or even by a tool description someone else wrote.

**Host:** So the blast radius isn't 'the actions we designed for' — it's every capability any agent was ever given, full stop. That's the framing for this whole episode, then: we need something sitting between 'the model decided' and 'the action happened,' and that something has to answer five separate questions, in a fixed order, instead of collapsing them into one trust decision.

### 2. Five requirements, five failure modes

**Host:** Okay, so let's put names to these five questions. Where do you even start — is it just 'is this tool allowed,' or does it get messier than that?

**Guest:** It starts there but doesn't end there, and that's the trap — people think capability scope alone solves it. First question is capability scope: can this caller invoke this tool at all, full stop, not 'did the model decide to.' Second is argument validation: every call is checked against the tool's own schema, server-side, regardless of what the model was shown — no exceptions for what looked plausible upstream. Third is per-tool quota — and the key word is per-tool, because quotas are owned by the tool itself, not shared across the platform, so each tool's budget stays its own.

**Host:** And the last two — approval and audit — those feel more like process than architecture. Why do they belong in the same enforcement layer instead of being handled downstream?

**Guest:** Because if they're downstream they're optional, and optional means someone skips them under load. Fourth is human approval for high-risk actions with a bounded wait and an explicit timeout behavior — you decide in advance whether a timeout means deny or escalate, not whichever engineer is on call that day. Fifth is complete audit, including refusals especially, and sixth — because identity has to underlie all five — every decision gets tied to a verified caller, so 'the agent did it' is never an acceptable forensic answer.

### 3. The model is not a trust boundary

**Host:** You said the model gets tied to a verified identity, but let's back up — people assume that if you give the model a strict schema and a well-written tool description, it just won't call things wrong. Why isn't that a trust boundary?

**Guest:** Because the schema is advisory, not enforced — it shapes the shape of the model's output, but nothing stops a compromised or jailbroken model from emitting a call that violates it entirely. And it cuts both ways: the tool description itself is untrusted input, because it flows into the model's context just like a user message does, so a hostile or compromised tool registry can inject instructions through what looks like harmless metadata. You have to treat every call as coming from an adversarial caller, not just a confused one, or you've built your safety net out of suggestions.

**Host:** So even the caller's identity in that call can't just be a field the model fills in and you trust.

**Guest:** Right, identity has to be verified independently of anything the model asserts, because every single control we've described — rate limits, approval, audit — is scoped by who's calling. If that identity is forgeable, an attacker doesn't need to break five controls, they just spoof the one thing all five are keyed on and everything downstream silently stops applying to them.

### 4. Why the check order is load-bearing

**Host:** So we've got scope, validation, quota, approval as a sequence. Is that just a natural pipeline order, or does the order itself matter for security?

**Guest:** It's completely deliberate. Scope goes first because it's the cheapest and most absolute check — if you don't have a grant on a tool, you shouldn't even reach argument validation, partly to save work, but also because a schema error message can leak the existence and shape of a tool you had no business knowing about. Validation comes before quota for a similar reason: if you let malformed calls hit the rate limiter first, an attacker can burn through a legitimate caller's budget with pure garbage, no valid arguments required. And approval sits dead last because it's the only stage that blocks on a human — you don't want to pay that latency cost for a call that a cheap check would've rejected anyway.

**Host:** So the ordering isn't just efficiency, it's actually preventing specific attacks — disclosure through error messages, budget exhaustion through malformed input.

**Guest:** Exactly, and the lab frames it the same way — validate-then-authorize and authorize-then-validate are genuinely different systems, not stylistic variants. They differ in what information leaks and whose budget gets spent on a bad request. If you can only describe the five controls as an unordered checklist, you haven't actually understood the design — being able to defend the specific sequence is the real test.

### 5. What actually breaks when a check is skipped

**Host:** Let's make this concrete. Walk me through what actually happens when one of these five checks just isn't there — starting with validation, since that's the one people skip most casually.

**Guest:** The schema tells the model what a well-formed call looks like, but it guarantees nothing about what actually shows up at the server. Skip validation because 'the model has the schema' and you're one hallucinated argument, or one adversarial client, away from executing something you never meant to accept. And it gets worse — tool descriptions are context too, so a hostile tool source can write a description that steers the model's behavior far past what the tool does. That's prompt injection arriving through metadata, and it walks straight past every filter you built for the user's message.

**Host:** And the ones further down the chain — approval, quota, audit, identity — those fail just as concretely, not just theoretically?

**Guest:** Completely concretely. An approval queue with no bounded wait becomes an outage the first time an operator goes unavailable — requests pile up holding connections, and it looks like your backend died, not like policy stalled. Share one quota between a cheap read and an irreversible write, and read traffic can drain the allowance protecting the dangerous operation, or you raise the limit for reads and silently raise it for refunds too. Log only successes and you can't show an agent kept trying a capability it was never granted — the clearest signal of a compromised caller you'll ever get, just gone. And none of it matters anyway if the caller identity behind all this is a header any client can set, because then scope, quota, routing, and attribution are all decorative at once, and everything still passes every test you didn't design to forge it.

### 6. The trade-offs that don't have a single right answer

**Host:** So we've established the checks and the ordering — but you keep saying some of these decisions don't have a single right answer. Give me the first one: fail open or fail closed when the policy store itself goes down?

**Guest:** It has to be decided per tool, not as a global stance. Fail closed on an irreversible write means a policy-store outage becomes a full outage for that tool, which sounds bad until you compare it to the alternative — fail open silently strips authorization from a refund or a delete, and nobody notices until the damage is done. For a read-only lookup, failing open with loud alerting is legitimate; you're trading a small window of unchecked reads for continuity, and you can afford that because nothing irreversible is on the table. Same logic applies to the timeout question — deny on timeout and an unavailable approver just produces a visible user-facing failure, which is safe; escalate instead and you're only justified if the escalation target is actually more reachable, otherwise you've just relabeled the hang. The one answer that's never legitimate is no timeout at all, because that turns a policy decision into an unbounded wait indistinguishable from a hung backend.

**Host:** And the grant model — per-tool grants versus roles — is that the same kind of judgment call, or is one of those just better?

**Guest:** It's a real trade, not a solved problem. Per-tool grants are precise and they audit cleanly — you can point at exactly why a caller could do exactly that action — but they don't scale once you've got dozens of tools, the matrix becomes unmanageable. Roles compress that, but they bring back the classic failure where a role quietly accumulates capabilities nobody actually intended it to have. The way out is roles built from explicit tool grants rather than roles as opaque labels, so you keep the auditability while bounding the growth — and the same deliberateness applies to where you enforce any of this, in the tool runtime so it holds regardless of whether the call comes over MCP, HTTP, or in-process, versus a protocol gateway that's easier to bolt in front of servers you don't control but gets bypassed by any path that doesn't cross it.

### 7. Making it scale: shared state, stateful approvals, cache invalidation

**Host:** Let's talk about running this at scale, because a policy layer that only works on one box isn't really a policy layer. Where does that first break down?

**Guest:** Quota. If you implement rate limiting as an in-process token bucket, every replica has its own bucket, so a caller's real limit is your configured limit times however many replicas happen to be running. That's not a subtle bug, it's the limit meaning nothing. The fix in async-ai-gateway is a Redis Lua script that does refill-and-consume as one atomic operation, so all replicas are checking against the same number and the limit actually means what you configured.

**Host:** And I'd guess approvals have a similar shared-state problem, plus a time dimension.

**Guest:** Right, approval is a stateful island sitting inside a stateless service, so if the record only lives in the replica that accepted the request, a deploy or a restart just silently drops every human still waiting on a decision — the request doesn't fail loudly, it just vanishes. Audit has its own version: write volume scales with attempts, not successes, so a refusal storm is precisely the moment logging load spikes, and that's exactly when you can't afford the audit path to be the thing that falls over. Then there's the registry — reads are hot and rarely change so caching is the right call, but that means cache invalidation is the actual mechanism by which a revoked grant takes effect, not the revocation itself.

### 8. Security posture, cost, and what to watch in production

**Host:** So if I pull all of this together into a security posture, what's actually on the list? Not the failure modes anymore, just the concrete things a reviewer should check are present.

**Guest:** Verified identity from a signed token or mTLS, never a bare header. Server-side validation against the server's own schema, tool descriptions treated as untrusted with provenance pinned, grants scoped to least privilege with revocation that doesn't need a redeploy, and an append-only, separately access-controlled audit log that records what was refused, not just that something was refused. Each one closes a specific hole we already walked through — this is just the checklist form of it.

**Host:** And cost-wise, where does the money and the latency actually go once all that's running?

**Guest:** Approval latency dominates because it's human-scale, so anything you route through it needs to be genuinely consequential or you're training people to rubber-stamp. Audit storage is the sneaky one — it grows with attempts, not successes, so an attack that generates a thousand refusals is a thousand log writes, which is exactly the wrong moment to be throttled by your own logging bill. On observability, the fix is splitting refusals by reason per caller per tool — scope denial, schema failure, quota exhaustion, approval denial, approval timeout — because lumped into one error rate they're indistinguishable, and watching approval queue wait-time against the timeout, since a p95 creeping toward it means you're about to start denying legitimate work.

**Host:** So the production checklist really is the synthesis of everything we've covered — identity, validation, shared rate limits, surviving restarts, tested revocation, per-tool fail-open-or-closed decisions, all in one place.

**Guest:** Exactly, and none of those items is new information at this point, which is the point — it's just making sure nothing we discussed stays theoretical. There's a running lab implementation with capability scoping, schema validation, token buckets, approval gates, and the audit log wired together, deliberately protocol-independent, so the same checklist applies whether the calls come over MCP or something else entirely.

### 9. Seeing it run: the reference implementation and the interview test

**Host:** So if someone wants to see this rather than just hear about it, there's the policy-gated-tool-runtime lab — walk me through what actually running it proves that the discussion alone doesn't.

**Guest:** It shows scope and schema catching genuinely different failures, rate limits keyed per tool so a search and a fund transfer never share a budget, and approval gates that block with a hard timeout instead of hanging forever. Every denial lands in the audit log as a first-class event, and because the clock is mocked, all forty-four tests covering every stage run in under a second. And critically it's not an MCP implementation — it's the policy layer that sits in front of whatever protocol shows up, which is why MCP dropping its handshake and SSE transport this year didn't touch a line of it.

**Host:** Which leaves one thing worth being able to defend cold if someone pushes back on this in an interview or a design review: log the denials, not just the successes, because a system that only records what worked can't show you the caller quietly probing a door it was never given a key to — and that's exactly the signal you need after something's already gone wrong. That's the episode.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of an actual production incident caused by a policy-gating failure
- Comparison with specific competing commercial agent-platform products
- Detailed cryptographic mechanics of mTLS or JWT verification
