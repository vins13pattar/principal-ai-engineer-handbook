### 1. Five separate questions, not one filter

**Host:** There's a moment in a lot of agent systems where the model decides to call a tool, and everyone quietly treats that decision as the authorization. Today we're pulling apart a runtime that refuses to make that leap — it says deciding to call and being allowed to call are two entirely different events, gated separately. Walk me through what actually sits between the request and the action.

**Guest:** There are five checks, and the whole point is that none of them can cover for another. Scope answers whether this caller may use this tool at all. Schema validation answers whether this particular call is well-formed. Rate limiting answers whether this tool, for this tenant, has budget left right now. Approval answers whether a human needs to sign off before anything happens. And audit logging answers what actually happened, including every time the answer was no. Collapse scope and schema into one check, for instance, and you get something too permissive in one direction and too brittle in the other.

**Host:** Give me a concrete case where keeping them separate actually changes behavior — not just conceptually cleaner, but a design decision that would break if you merged them.

**Guest:** Rate limits are the clearest one — they're keyed on tenant and tool together, not on the gateway as a whole, because a read-only search and a fund-moving action sharing one budget is a real hazard. And approval gates block with a timeout instead of an unbounded queue, since a queue with no timeout is just an outage waiting for one unavailable operator. Denials get logged as first-class events too, so a tool nobody ever approves shows up in the audit trail instead of vanishing into application logs — and all of that is tested deterministically, with a mocked clock making token-bucket refills and timeouts instant, so forty-four tests across every enforcement stage run in under a second.

### 2. Why the checks run in this exact order

**Host:** So the five checks aren't just five boxes to tick — the sequence itself is doing work. Why does scope have to be first, before anything else even looks at the call?

**Guest:** Because it's the cheapest possible rejection and the most absolute one. If a caller has no grant on a tool, you want them bounced before they ever reach argument validation — otherwise you're doing schema work for someone who shouldn't even learn the tool exists, and a validation error message can leak that existence. Scope first means an unauthorized caller gets a flat no, not a clue.

**Host:** And that same logic carries through the rest of the chain — validation before rate limiting, approval dead last?

**Guest:** Exactly, and it's worth stating plainly: validate-then-authorize and authorize-then-validate are not the same system wearing different clothes, they disclose different information and spend different people's budget. Rate limiting sits after validation so a malformed, garbage call can't burn down a well-behaved caller's quota. And approval is last because it's the only stage that pays human latency — there's no reason to wake up an approver for a call that a cheaper check would've killed anyway.

### 3. Protocol-independent by design — and why that held up under MCP's rewrite

**Host:** So where does this actually live relative to something like MCP? Because we've been describing five checks and an order, but I haven't heard the word protocol once.

**Guest:** That's deliberate — this lab isn't an MCP implementation, it's the policy layer any MCP server would sit behind, and it doesn't care whether the call arrived over MCP, a plain HTTP API, or an in-process tool interface. The proof is the 2026-07-28 revision, which tore out MCP's initialize handshake and protocol-level sessions and deprecated the old HTTP+SSE transport entirely, invalidating a huge amount of 2025-era MCP code. None of that touched this pipeline, because validation, authorization, rate limiting and approval were never protocol concerns — wiring this up to a real MCP host just means putting an SDK in front of the gateway's call method, with zero change underneath.

### 4. Where the runtime still leans on trust — identity

**Host:** So where's the honest crack in all this? Every check you've described is scoped by caller, so how solid is that caller identity actually?

**Guest:** Not solid at all, honestly — it's a declared header, x-agent-id, not a cryptographically verified credential, so the gateway trusts whoever sets that header rather than proving who's behind it. That's fine while each call maps cleanly to one human request, but the moment an agent is chaining actions across a session on someone else's behalf, that one-to-one mapping breaks and the header stops meaning what you want it to mean — which is exactly the point where you'd need real per-request identity, not a static label, and exactly when an agent platform becomes worth building rather than a lab. Don't take my word for any of this, though — spin it up, hit search\_docs and issue\_refund with that header, then pull the audit log and watch what got allowed, what got blocked pending approval, and what got refused outright, because the log is where the pipeline actually tells you the truth about itself.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A live walkthrough of the async-ai-gateway's Redis-backed limiter replacing this lab's in-process buckets
- A deep dive into MCP's Multi-Round-Trip Requests or requestState signing, since this lab deliberately doesn't implement MCP
- Comparing this runtime's approval gate to the agent loop's step/cost budget mechanics in Module 5
