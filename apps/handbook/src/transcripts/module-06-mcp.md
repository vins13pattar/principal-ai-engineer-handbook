### 1. Before MCP: the N×M integration problem

**Host:** So let's set the scene for why MCP exists at all. Before this protocol, if you wanted a model to talk to, say, your filesystem and also GitHub and also some internal database, you were writing a separate bespoke integration for each pairing, and none of it was reusable by anyone else building a similar tool.

**Guest:** Right, it's the classic N times M problem — N applications each needing to talk to M tools, and nobody's integration code transfers to anyone else's app. Every team reinvents the same plumbing. MCP's whole pitch is that you write the integration once, as a server, and it works with any host that speaks the protocol.

**Host:** And that sounds simple enough on paper, but you told me before we started recording that the really instructive part of MCP right now isn't the basic client-server split — it's a specific change in a recent revision. What happened?

**Guest:** The 2026-07-28 revision ripped out the initialize handshake and the protocol-level session entirely, so every request now has to be self-describing. That's not cosmetic — a stateful protocol forces sticky routing, which is exactly the state-ownership problem that makes services hard to scale horizontally. Watching MCP make that migration is basically a live case study in stateful-to-stateless design, and that's what this episode is really about.

### 2. Three roles, one aggregation pattern

**Host:** Okay so before we go deeper into the statelessness story, let's set up the shape of the thing. When you say MCP separates three roles, what actually are they?

**Guest:** Host, client, server. The host is the application the user actually sees — a chat app, an IDE — and it owns the decision to connect to any given server. The client is a connection manager that lives inside the host, one per connected server, handling protocol mechanics so the host doesn't have to. And the server is a separate small process exposing tools, resources, or prompts — ideally one server per integration, not one server trying to do everything.

**Host:** That 'many small servers behind one host' shape sounds familiar — didn't we see almost exactly this pattern somewhere else in the handbook?

**Guest:** Yeah, it's the same move as the async AI gateway aggregating multiple LLM providers behind one interface, just applied to tools instead of models. The host connects to a bunch of independently maintained MCP servers and presents their combined capabilities to the model as one coherent context — it's Module 4's gateway layer idea again: many small, focused things behind one aggregation point.

**Host:** So the three-role split isn't just bureaucratic naming — it's what makes that aggregation possible in the first place.

**Guest:** Exactly, the split — host, client, server — is what makes that aggregation possible in the first place.

### 3. Isolation by design: one client per server

**Host:** So if the host is juggling multiple servers, why not just have one client that talks to all of them? Why insist on a dedicated client per server?

**Guest:** Blast-radius isolation, mostly. Each client-server connection is independently scoped, so if one server is compromised or just misbehaving, it only poisons its own client, not the whole host. It also means each connection can use its own transport — one server over stdio, another over HTTP — without forcing a lowest-common-denominator protocol on everyone.

**Host:** Okay, so that isolation is really about containment and flexibility. But does that mean each client is holding onto some persistent session state for its server?

**Guest:** That's the thing people assume, and it's exactly what the newest revision walks back. As of the July twenty-eighth, twenty twenty-six revision, a client is just a connection manager, not a session holder — isolation doesn't have to mean statefulness, and that distinction is what we need to unpack next.

### 4. Tools, resources, prompts: who decides?

**Host:** Okay, before we go further into statelessness, I want to back up to something you mentioned earlier — tools, resources, and prompts. I've been treating those as basically three flavors of the same thing, just different data types. Is that wrong?

**Guest:** It's wrong in the way that matters most. The real distinction isn't what kind of data moves — it's who decides the invocation happens. A tool is called because the model decided to call it, same function-calling mechanics as always, just standardized across servers. A resource is attached because the host application decided to attach it — a file, a database row, a search result — the model doesn't reach out and grab it unless the host explicitly allows that. And a prompt only fires because a user picked it, usually as a slash command or a menu item.

**Host:** So it's a security boundary dressed up as a taxonomy. Which means the same capability could live in different places depending on who you trust to pull the trigger.

**Guest:** Exactly, and that's the trade-off worth sitting with. Take 'read this file.' Expose it as a resource, and the host or the user controls when that read happens — predictable, bounded context growth. Expose the identical capability as a tool, and now the model decides for itself when to read it, which gives it real autonomy but also a wider action surface and a context window that grows however the model feels like growing it.

**Host:** So choosing tool versus resource for the same function isn't a formatting choice, it's you deciding how much you trust the model with initiative.

**Guest:** Right — and that decision doesn't go away just because the transport underneath it changed. Which is a good bridge, actually, because that discovery pattern — list then invoke, tools/list then tools/call, resources/list then resources/read — is exactly what stays stable while everything about session state gets rebuilt underneath it in the new revision.

### 5. The stateless rewrite: SEP-2575

**Host:** Okay, so let's get concrete about what actually got ripped out. Before, you connect, you do this initialize and initialized handshake, the server learns who you are and what you support, and that sets up a session. What replaces that?

**Guest:** Nothing replaces the handshake, in the sense that there isn't one anymore. There's no initialize, no initialized, no protocol-level session sitting on the connection. Instead, three pieces of information that used to travel once — protocol version, client info, client capabilities — now ride in a _meta block on every single request.

**Host:** Every request. So if I'm the server, I'm re-learning who's talking to me on every call instead of once at the start.

**Guest:** Right, and if you want the server's capabilities up front the way you used to get them for free from the handshake response, you ask explicitly — there's a server/discover call for that now. I actually checked this against the official Python SDK rather than just taking the spec's word for it, and it's exactly as described: a modern connection issues zero initialize calls, the first thing on the wire is server/discover, and the three _meta keys are literally namespaced as io.modelcontextprotocol/protocolVersion, clientInfo, and clientCapabilities.

**Host:** And that SDK only speaks the new revision, or does it still know the old handshake?

**Guest:** It keeps 2026-07-28 as the one modern version, but 2024-11-05 through 2025-11-25 are retained as legacy handshake versions — so old clients aren't stranded, they just get routed down a different, older code path. But for anything built fresh, the handshake is just gone, and that per-request _meta plus server/discover is the whole replacement.

### 6. Routing headers and multi-round-trip requests

**Host:** So the handshake is gone, but requests still have to get routed somewhere before anyone looks at the JSON-RPC body. How does that actually work now?

**Guest:** That's SEP-2243. Every request over Streamable HTTP carries an Mcp-Method header, and anything that names a specific target — a tool call, a resource read, a prompt fetch — also carries Mcp-Name. A gateway or load balancer can route and meter purely off those headers without ever parsing the body.

**Host:** That sounds efficient, but also like an obvious place to lie — put one thing in the header and something else in the body.

**Guest:** Exactly the gap, and the spec closes it explicitly: servers must reject any request where the header and body disagree. If that check is missing, a caller can route as a cheap, permitted operation while the body actually executes something expensive or restricted — and a hand-rolled server is exactly where that check gets skipped. There's a related seam in SEP-2322 for calls that need more than one round trip — a tool returns input_required with a requestState string, the client gathers input and echoes it back, and the server resumes from there.

**Host:** So the protocol stopped holding session state, but that state didn't disappear — it just moved into a token the client is now responsible for carrying.

**Guest:** Right, and that's the trust question worth sitting with. requestState is opaque to the client but trusted by the server on return — if it isn't signed, expiring, and size-bounded, you've built a client-controlled input that resumes server-side execution, which is the same mistake as trusting an unsigned cookie for authorization. The spec leaves the encoding open on purpose, but that openness means the security posture is entirely up to whoever implements the server.

### 7. Caching and what's being deprecated

**Host:** Given that requestState is basically a security decision dressed up as a protocol detail, let's talk about the other half of discovery — caching. What are ttlMs and cacheScope actually doing there?

**Guest:** They're the thing that makes discovery cheap instead of just stateless. When a client calls tools/list or does a resources/read, the response now carries a ttlMs — how long that result stays fresh — and a cacheScope that says whether it's safe to share across users or has to stay pinned to one. It's modeled directly on HTTP Cache-Control, and if a client actually honors those fields it stops re-fetching the same tool list on every turn, and a gateway can serve one cached copy to many users when the scope allows it.

**Host:** And if a client just ignores those fields?

**Guest:** Then you've given up the main performance win of this whole revision — you're paying full discovery cost every call for no reason. Worth pairing that with the deprecation list, since it's the same 'this still works but stop building on it' theme: HTTP+SSE transport, plus Roots, Sampling, Logging, and Dynamic Client Registration are all deprecated now. Roots, Sampling, Logging, and DCR get a twelve-month minimum window before removal eligibility, landing at the first revision on or after 2027-07-28, but HTTP+SSE is on a faster clock — it's eligible for removal just three months after its deprecating SEP reaches Final, so that's the one to migrate off first.

### 8. A minimal tool server, two validations

**Host:** Let's actually look at code, since I think the abstraction has been floating a bit. What does a minimal tool server look like, end to end?

**Guest:** It's smaller than people expect. tools/list returns one ToolDefinition — a name, a description, and a JSON Schema for its arguments — plus that ttlMs and cacheScope pair we just discussed. Then tools/call is the interesting part: it's a stateless handler that takes a name, arguments, and headers, and does two checks before it does anything else.

**Host:** Two checks. Walk me through why there are two, not one.

**Guest:** First it checks that arguments actually satisfy the schema — is query a non-empty string — even though the server already published that schema in tools/list. That's defending against the model: it can hallucinate a malformed call, or a client can forge one, so the schema is a hint to the caller, never a guarantee the server gets to skip validation. Second, completely separately, it checks that the Mcp-Method and Mcp-Name headers agree with the body — that's defending against infrastructure, for the reasons we already went through with routing headers.

### 9. IDE and GitHub server: stateless in production

**Host:** Let's ground this in something concrete. Walk me through an actual coding task where a host is talking to two servers at once.

**Guest:** Say you're in an IDE working on a bug fix. The IDE host is connected to a filesystem server that exposes your project as resources, and a remote GitHub server that exposes tools like create_pull_request and search_issues. You attach a specific file as context — that's a resource, so you or the host chose it, not the model — the model reads it, understands the bug, then once it has a fix, it decides on its own to call create_pull_request. Resource in, tool call out, two different servers, two different trust boundaries, exactly like we've been describing.

**Host:** So that's the workflow. Now what does statelessness actually buy the team running that GitHub server?

**Guest:** It turns it into a completely ordinary service to operate. The operator runs three replicas behind a plain load balancer, no sticky sessions, because there's no session to pin a client to an instance. They use Mcp-Method to rate limit tools/call harder than tools/list since a pull request costs more than a listing. And they can do rolling deploys that just drop connections without anyone's in-flight work breaking, because there's no session state living on a specific instance to lose.

**Host:** And under the old revision, every one of those would have needed session affinity or a shared session store.

**Guest:** Right, sticky sessions at the load balancer, or shared session storage across replicas, and deploys would need to drain sessions carefully before rotating instances. That's the biggest operational payoff of the 2026-07-28 revision — it matters more to the platform team running the GitHub server than to whoever wrote the tool handler, because it's the difference between a bespoke stateful fleet and a service that scales like any other HTTP backend.

### 10. Security: tool poisoning, requestState, and the credential-placement trap

**Host:** Okay, scaling is sorted, so let's talk about what can go wrong once you're actually running one of these servers in production. Where does the security story start?

**Guest:** It starts with a mindset shift: tool and resource descriptions are part of the model's context, so they're untrusted input just like anything a user types. A malicious server can write a tool description that manipulates model behavior beyond what the tool actually does — same prompt injection risk you'd worry about anywhere else, just arriving through metadata instead of a chat box. So you only connect to servers whose provenance you actually trust, and you validate every tools/call argument server-side no matter what schema the model was handed.

**Host:** Right, the schema constrains a well-behaved client, not what the server should assume it received. What about that requestState mechanism you mentioned earlier — the thing that resumes execution?

**Guest:** That's the other one people underestimate. requestState is server state handed to the client and trusted on return — if you don't sign it, bound its size, and expire it, you've created a client-controlled input that resumes server-side execution, which is the same mistake as trusting an unsigned cookie for authorization. The official SDK actually ships an AES-GCM codec that binds the state to the authenticated principal, which tells you exactly what threat model the spec authors were worried about.

**Host:** So that covers metadata and state. But you keep coming back to credential placement as the real trap — walk me through the multi-tenant lab mistake.

**Guest:** Because every request is self-describing under this revision — protocol version, client info, capabilities all traveling together in a metadata block — it looks completely natural to put the tenant credential in that metadata block too. It doesn't work, and the reason is instructive: when the client calls a tool, that call internally triggers a result-validation step, which issues its own call to list the available tools, just to check the output schema. The tool call itself accepts an application metadata argument, but the list-tools call doesn't take one, so that internal call carries the SDK's own protocol stamp but never your application credential — a server authorizing on that metadata block rejects its own client's internal call, and exempting the list-tools call to work around it just reopens the hole you were trying to close.

**Host:** So the fix is just — don't fight the SDK's internal plumbing, put the credential somewhere it can't dodge.

**Guest:** Exactly — authenticate on the transport, via something like the SDK's TokenVerifier seam, so the Authorization header covers every request the transport sends, application-issued or not. Stateless protocol and per-request credentials in the body sound like the same idea, but they're not, and that distinction generalizes to any SDK doing background refreshes or retries on your behalf, not just MCP.

### 11. Trade-offs and operating at scale

**Host:** So let's zoom out to the operational picture. When does someone actually reach for stdio versus Streamable HTTP, given everything we just covered about credentials living at the transport layer?

**Guest:** stdio is the easy case — no network, no auth, the process lifecycle is the connection, so it's great when the server runs locally alongside the host. Streamable HTTP is what you need the moment a server has to be remote or shared across multiple hosts, but you pay for that with real authentication and the routing headers stdio never has to think about.

**Host:** And statelessness itself — we've talked about the mechanics, but is it actually a win, or just a cost shifted somewhere else?

**Guest:** It depends entirely on what's on the other end. For a remote server sitting behind a load balancer, it's a clear win — horizontal scaling with no session affinity, no session store to operate or leak, trivial rolling deploys. But for a local stdio server that was never going to be load balanced in the first place, repeating protocol version and capabilities in the meta field on every single request is just pure overhead the protocol now imposes uniformly, whether you need it or not.

**Host:** That horizontal scaling story only covers one axis, though — what about a host that's fanned out to many different MCP servers at once, or a shared server handling many tenants?

**Guest:** Right, those are separate problems statelessness doesn't touch. A host connecting to many servers simultaneously needs the same bounded-concurrency discipline as any fan-out — semaphores on server connections, not just individual requests. And a shared remote server serving many hosts is still a multi-tenant service; removing session affinity doesn't remove the noisy-neighbor problem, you still need per-tenant isolation. Which loops back to the many-small-servers-versus-monolith question — small focused servers keep blast radius contained, but each one you connect adds to the size of the tools list and eats more context on every model call, so past a handful of servers you need curation, not just more connections.

### 12. Building it yourself: labs and the bigger lesson

**Host:** So if someone's absorbed all of this and wants to actually build something, where do they start?

**Guest:** There's a multi-tenant MCP server lab that puts every piece we've discussed under test instead of just in theory — transport-level auth checked before any handler runs, per-tenant discovery that filters tools/list, and authorization checked again on tools/call because a caller can always name a tool it never saw listed. It also asserts refusals are byte-identical whether a tool is forbidden or doesn't exist, and it proves statelessness by alternating tenants across three separate connections to one server object and checking nothing leaks.

**Host:** That cacheScope detail keeps nagging at me — public would tell every cache on the path that one tenant's list is fair game for another.

**Guest:** Exactly, and it's worth saying plainly: that's a leak this protocol revision introduced the vocabulary for, not one it removed. Which is really the whole arc of this episode in miniature — statelessness didn't make the hard problems go away, it moved them somewhere else and gave you new fields to get wrong if you're not paying attention.

**Host:** So the takeaway isn't 'stateless is simpler,' it's 'stateless relocates the state, and now you have to know exactly where it landed.'

**Guest:** That's the whole skill. The session store didn't disappear, it moved into the client's _meta and requestState; the tenant boundary didn't disappear, it moved into per-request checks instead of per-connection ones. Anyone can recite that MCP went stateless — the engineer worth listening to can point at each piece of state and tell you exactly where it lives now.
