# Multi-Tenant MCP Server: The Credential Placement Lesson

_A multi-tenant MCP server looks like it just needs 'put the tenant token somewhere on the request' — but the SDK makes calls of its own, and where the credential lives determines whether the whole security model holds._

- **Source:** [lab:multi-tenant-mcp-server](/build/labs/multi-tenant-mcp-server/)
- **Runtime:** 5:50 · 13 turns · 4 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The intuitive mistake: a credential in \`\_meta\`

**Host:** So you're building a multi-tenant MCP server, and the whole spec under 2026-07-28 tells you every request is self-describing — protocol version, client info, capabilities, all riding along in this metadata field on every single call. So the natural move is, well, if identity travels per-request anyway, just drop the tenant token in there too. It feels like the design is basically inviting you to do that.

**Guest:** It really does, and that's exactly why this lab starts with that mistake instead of skipping to the fix. You put the tenant credential in that metadata field alongside the other protocol fields, and you write your authorization check against it. Then you call a single tool once, from application code, and the server rejects its own client.

**Host:** Wait, rejects its own client from one call? Walk me through how that even happens.

**Guest:** The SDK isn't honest with you about how many requests it's actually making. Calling a tool triggers an internal follow-up request to check the result against the tool's schema, and that follow-up carries the SDK's own protocol stamp but has no slot for your application credential — there's literally no parameter to pass it through. So the server sees an internal call with no tenant token and rejects it, and the tempting patch is to just exempt that one call type from auth — which quietly reopens the exact hole you built the credential check to close.

---

## 2. The fix: authenticate the transport, separate filtering from authorization

**Host:** So if the credential can't live in the payload the SDK controls, where does it actually go? What's the fix that survives the SDK making calls behind your back?

**Guest:** You move it down to the transport itself — authentication that reads the Authorization header on every single request the connection carries, before any handler even runs. That internal schema-check request still has no idea it needs a tenant token, but it doesn't need one, because the header is already there on the wire regardless of who inside the SDK issued the call. Unauthenticated gets a 401, invalid gets a 401, and that's asserted against the real HTTP app, not mocked away.

**Host:** Okay, so the credential problem is solved. But doesn't filtering tools/list per tenant already give you the isolation you need?

**Guest:** That's the second trap — filtering the list is discovery, not security, because a caller can always name a tool it never saw listed, so tools/call has to be authorized independently or you've just published a UI convention. And the refusal for that has to come back byte-identical to an unknown-tool error, because the moment forbidden and nonexistent look different, a tenant can probe every other tenant's capabilities one call at a time.

---

## 3. The discovery boundary and a leak class that didn't used to exist

**Host:** Okay, but then server/discover itself has no credential at all — isn't that the exact hole you just spent five minutes closing? Why is it fine to leave that one endpoint wide open to anyone who can reach it?

**Guest:** Because requiring a credential there would deadlock bootstrapping — a client would need to authenticate before it could even learn how to authenticate. It's only safe because this particular server's discover response was verified to carry nothing but capability flags and supported protocol versions, no tool or resource names, and that's a property you check per server, not something the protocol guarantees for you. Which is exactly why the newer revision added a one-word setting on tenant-scoped listings — if a tenant's filtered tools/list response comes back marked with that setting in the wrong state, every cache on the path, client, gateway, CDN, is told it's fine to hand that list to a different tenant, and the server itself never sees the leak because it behaved correctly the whole time.

---

## 4. Proving it, running it, and the general lesson

**Host:** So walk me through actually proving this instead of just asserting it. What does running the lab look like, and where does it actually put these guarantees to the test?

**Guest:** You stand up the server, curl it with no Authorization header, and you get a 401 straight from the transport before any application code runs — that's the deadlock case turned into a passing test instead of a hoped-for property. Send it a real bearer token and you get a real tools/list; swap tenant tokens and the count changes, two tools for one tenant, three for the other, because refunds are scoped. Then eleven tests run over the actual Streamable HTTP transport, not a mock, including one that round-robins a multi-step interaction across replicas to prove there's no session affinity holding it together — statelessness isn't a design intention, it's something a test either passes or fails. And that's the part that generalizes way past MCP: any SDK that reaches out on its own — refreshing a token, revalidating a connection, retrying a call you didn't initiate — will silently miss whatever credential scope you invented at your own call sites, which is exactly why this stops being a server-specific fix and becomes a line item on a principal-level checklist.

**Host:** Which is the real takeaway, I think — the mistake was never really about MCP or the meta field, it's the far more general trap of an SDK doing work on your behalf that your security model forgot to account for. Check where your credential actually has to live, check what your framework does when you're not looking, and write the test that proves it rather than the one that assumes it. That's where we'll leave it — thanks for walking through all of this.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A deep comparison of this server's enforcement model against the policy-gated-tool-runtime's five-stage pipeline
- Cost and observability metrics specific to running this server at scale (only briefly touched via the architecture companion, not the lab itself)
- A full walkthrough of migrating from Dynamic Client Registration to Client ID Metadata Documents
