# MCP's Stateless Rewrite: What Changed and Why It Matters

_The 2026-07-28 revision didn't just tweak MCP's wire format — it removed the session entirely, and tracing that one change through architecture, security, and multi-tenant deployment reveals a general lesson about where state goes when a protocol stops carrying it._

- **Source:** [reference:mcp](/reference/lookups/mcp/)
- **Runtime:** 9:32 · 18 turns · 6 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. MCP in one breath, and the revision that broke old mental models

**Host:** So let's start with the basics, because this episode is going to spend a lot of time on one change that only makes sense if you know what MCP normally does. At its simplest, MCP is a protocol for exposing tools, resources, and prompts to a model host, right? Before this existed, if you wanted to connect a model to GitHub or a filesystem, you wrote a custom integration for each app, each time.

**Guest:** Exactly, and that's really the whole value proposition — not the wire format itself, but the fact that an integration written once as an MCP server now works against any compliant client. You write the GitHub server once, and every host that speaks MCP gets it for free. That reusability is the entire point.

**Host:** Okay, but here's the hinge for this whole episode: the 2026-07-28 revision didn't just polish that idea, it pulled out something people assumed was load-bearing — the initialize handshake and the Mcp-Session-Id header are just gone. The core protocol is now stateless, every request carries its own version and capabilities, and if your mental model still starts with 'first we establish a session,' that model is out of date. We're going to trace that one removal through the architecture, the three primitives, and the security model for the rest of the show.

---

## 2. Three primitives, three owners of the invocation decision

**Host:** Before we get to what the stateless rewrite touches, let's nail down what it's operating on. MCP has three roles — host, client, server — and then three kinds of things a server can expose: tools, resources, prompts. That sounds like plain taxonomy, but you told me before we started recording that it's actually a security boundary. Walk me through that.

**Guest:** Right, the roles first: the host is the app the user's actually looking at, the client is a connection manager living inside it — one per server — and the server is a small, focused process exposing capabilities, the same one-integration-per-server shape as an aggregation gateway. But the part that matters is who's allowed to pull the trigger on each primitive. Tools are model-invoked — the model itself decides to call one, same as function calling. Resources are application-controlled — the host decides what data gets attached to context, not the model, even though some hosts let the model request a read. And prompts are user-invoked — a person picks a slash command or menu item, the model and the host don't get a vote. So if you're deciding how to expose 'read this file,' making it a tool hands the model autonomy to read whenever it wants, and making it a resource keeps that read under host or user control — same capability, completely different trust boundary depending on which primitive you pick.

---

## 3. What statelessness actually buys you (and costs you)

**Host:** So walk me through what actually replaces the handshake, because 'no session' sounds simple until you ask where the protocol version and client capabilities go now. Every request just carries them?

**Guest:** Every single one — three keys in \_meta, protocolVersion, clientInfo, clientCapabilities, on every request, and if a client wants the server's capability list up front it just calls server/discover explicitly instead of getting it as handshake output. And there's a neat wrinkle: when a tool call needs more input mid-flight, the server can't hold the connection open and ask like it used to, so it returns input\_required with an opaque requestState string, the client gathers the answer and retries with that state echoed back. That's continuation-passing — the same trick as a pagination cursor or a resumable upload token. The state didn't disappear, it just moved from something the server holds to something the client carries.

**Host:** Right, so it's not stateless in the sense of no state existing, it's stateless in the sense of nobody's pinned to a process holding it. What does that actually buy you in production, versus what it costs?

**Guest:** The GitHub tools server in the production example is the clean case — three replicas behind a load balancer, no sticky sessions, Mcp-Method used to rate-limit tools/call harder than tools/list, rolling deploys that don't strand anyone's in-flight work. Under the old handshake-based session, every one of those needed session affinity or a shared session store you had to operate and could leak. The cost is real but boring: repetition, those three \_meta keys and the routing headers riding along on every request instead of being negotiated once, plus ttlMs and cacheScope on list results so clients know how long to trust a cached tools/list and whether it's safe to share across users. For a remote server behind a load balancer that trade is obviously worth it; for a local stdio server that was never getting load-balanced anyway, it's pure overhead the protocol now imposes uniformly.

---

## 4. The credential-placement trap: where the SDK almost fools you

**Host:** So here's the gotcha you promised. Under this stateless model, every request is self-describing — protocol version, client info, capabilities, all riding in \_meta on every call. So putting your own application credential in \_meta right next to them feels natural, right? Per-request identity for a per-request protocol.

**Guest:** It feels natural and it's wrong, and the way it breaks is instructive. The Python SDK's call\_tool() doesn't just send your tools/call — internally it also calls validate\_tool\_result(), which fires off its own tools/list to check the output schema against what came back. Both requests get the SDK's protocol \_meta stamp, because it adds that to everything automatically, but call\_tool() is the only one that accepts a meta= argument for your application credential — list\_tools() has no such parameter, so there's no path for your token to reach that internal call. Authorize on \_meta and your server rejects its own client mid-request; the tempting fix, exempting tools/list from auth, just reopens the hole you built the credential check to close.

**Host:** Which is why the fix is boring by comparison — put it on the Authorization header instead, where the transport carries it on every request the SDK sends, whether your code issued that request or not. And that's really the generalizable lesson: 'stateless protocol' and 'per-request credential in the body' sound like the same design, but only one of them survives an SDK making calls on your behalf.

---

## 5. Multi-tenancy makes the stakes concrete

**Host:** Okay, let's put this in a real setting: one platform, many tenants, one MCP server instead of one per team. That consolidation sounds like the sane engineering move, so where does it actually bite?

**Guest:** It bites in two new places the old model never had to worry about. First, since there's no session, identity has to be re-established on literally every request, so a single missed check on any one call exposes another tenant's tools — not just at connect time. Second, cacheScope means a filtered tools/list is now something a gateway or CDN might legitimately cache and replay, and if you mark that response public instead of private, you've told every cache on the path it's fine to serve tenant A's tool list to tenant B. That's not a server bug you'd ever see in logs — the server behaved correctly, the leak happens in infrastructure it never even touches.

**Host:** So filtering the list correctly isn't the same as securing the tool. What else looks safe in a demo but isn't a real boundary?

**Guest:** Two things, and both fail the same demo perfectly. If you only filter tools/list but don't independently authorize tools/call, a tenant can just name a tool it never saw and invoke it — you've built a UI convention, not a boundary. And if a refusal is distinguishable from a not-found — different status code, different error text — a tenant can enumerate every other tenant's capabilities one call at a time, which is exactly why refusals have to be byte-identical to 'doesn't exist' and audited just as carefully as successes.

---

## 6. Deprecation timeline and the discipline of checking your source's revision

**Host:** Let's close with the practical checklist, because a lot of people listening are going to go look this up right after. What's actually deprecated, and when does the clock really run out?

**Guest:** Roots, Sampling, Logging, and Dynamic Client Registration are deprecated now but get the full twelve-month cushion — they're not eligible for removal until the first revision on or after 2027-07-28, so no rush there. HTTP+SSE is the one to worry about: it's on the fast track, eligible for removal just three months after SEP-2596 reaches Final, so treat it as already gone for new work. And the last thing I'll leave you with is the one habit that would've saved us this whole conversation — check which revision your source actually targets, because most MCP material online, including SDK tutorials, still describes 2025-11-25 with its handshake and session IDs, and quietly following it will build you a server for a protocol that no longer exists.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A deep comparison of MCP's tool-calling mechanics against the general agent-loop control problem from Module 5 was considered but left out, since the source material treats them as parallel topics rather than directly integrating MCP tool schemas into the agent loop's validation step.
- Specific benchmark numbers on latency or cost savings from correct ttlMs caching were not included, since no excerpt provides quantified before/after figures.
