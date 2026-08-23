# Agent Identity and Access: Who Is Acting, On Whose Behalf

_Agent systems answer authentication and authorization but skip a prior question — on whose authority, and as whom — and the default answer (the agent just carries the user's token) gives every agent the user's entire blast radius. This episode traces the replacement: short-lived, per-server, per-agent credentials minted by token exchange, validated on five specific dimensions server-side, and measured — not assumed — by a lab that shows exactly what a stolen token can and cannot open._

- **Source:** [module:15-agent-identity](/learn/modules/15-agent-identity/)
- **Runtime:** 17:04 · 51 turns · 12 beats
- **Written by:** claude-sonnet-5 on 2026-08-22
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The Question Neither Permissions Nor Policy Answers

**Host:** So Module 5 already told us what an agent is allowed to do, and we built a policy runtime that enforces it at the moment of action. You'd think that closes the loop, but there's a question sitting underneath both of those that nobody's answered yet.

**Guest:** Right, and the question is deceptively simple: on whose authority is this agent acting, and as whom? Permissions tell you what's allowed in the abstract, policy enforcement tells you whether a specific call is allowed right now, but neither one tells you who the caller actually is. The easy answer everyone reaches for is that the agent just carries the user's own token wherever it goes and acts as the user, full stop.

**Host:** Which sounds harmless until you say it out loud — if the agent is holding the user's actual token, its blast radius is the user's entire permission set, not just the slice of work it's supposed to be doing. That's the gap this module exists to close, and it's where we're headed.

---

## 2. A Token Is a Claim With Four Dimensions

**Host:** So let's break that bearer credential open. You said a token is really a claim with four parts to it — walk me through those.

**Guest:** Subject, audience, scope, expiry. It's claiming who this is about, who it's meant for, what it's allowed to do, and how long that's true. A well-formed agent credential answers all four narrowly — this specific agent acting for this user, addressed to one named server, for this task's tools, for a handful of minutes.

**Host:** And blanket delegation just... doesn't bother answering three of those.

**Guest:** Right — audience collapses to 'anything downstream will do,' scope collapses to 'everything the user can touch,' expiry collapses to 'the whole session.' Only subject survives intact. And here's the trap: you can have flawless capability enforcement checking exactly what that token is allowed to do, and it means nothing if nobody checked that the token was even addressed to the server enforcing it. That's a correctly-guarded door the token was never supposed to walk through.

---

## 3. Two Branches: Forward or Exchange

**Host:** So given that trap, what actually happens architecturally when a request comes in? You said there are two branches — walk me through the one everybody builds first.

**Guest:** That's the passthrough branch: the agent just forwards the user's token unchanged to whatever downstream server it's calling. The problem is structural, not incidental — that token's audience names the original host, not the server now receiving it. The MCP spec explicitly prohibits this, because you'd be enforcing capability checks on a token that was never addressed to you in the first place.

**Host:** And the other branch is the exchange you keep gesturing at — so what does that server actually receive instead?

**Guest:** It receives a token that was minted specifically for it — this server, this scope, this agent — produced by exchanging the original token rather than relaying it. That's the whole difference: instead of a document addressed to someone else that you're hoping still applies, the server holds a credential that was written with its name on it. Now every check downstream — audience, scope, subject, all of it — has something real to actually verify.

---

## 4. Why On-Behalf-Of Broke

**Host:** So if exchange gets you a token minted for the specific server, why did anyone build it the other way in the first place? On-behalf-of has to have been solving something real.

**Guest:** It was, and it still is in a lot of systems. OBO preserves the user's identity through a call chain — downstream services see the actual person, apply their real permissions, and the audit log attributes the action to a human being. In a request-response app where you wrote every hop yourself and the chain is short, that's exactly the right behavior.

**Guest:** What breaks it is what agents add: the chain isn't short anymore, a model is choosing the hops at runtime instead of a developer choosing them at compile time, and some of those hops land on third-party servers you don't operate. OBO assumed you controlled or at least trusted every link. An agent's whole value is deciding on the fly to call something you didn't anticipate — that's precisely the case OBO's assumptions don't cover.

---

## 5. The Mechanics: Exchange, the act Claim, and Resource Indicators

**Host:** So OBO is out because the assumptions don't hold anymore. What actually replaces it — what does an agent get instead when it needs to call a downstream server?

**Guest:** A distinct grant type, RFC 8693 token exchange. The client hands over the user's token as a subject\_token, optionally an actor\_token identifying the agent itself, and asks for something scoped to one specific resource. What comes back still has the user as subject, but the audience, scope, and lifetime are all narrowed to that one hop.

**Host:** Narrowed audience solves the blast-radius problem, but does it solve attribution? If something goes wrong at 3am, how do you tell an agent's decision apart from the user actually clicking something?

**Guest:** That's what the act claim is for. It records that delegation happened and names the actor that's exercising the authority, so the log shows the user underneath and the agent on top, not one blurred identity. There's a companion, may\_act, sitting in the user's own token, listing which actors are even allowed to act for them — checked at exchange time, not discovered after the fact when something's already gone wrong.

**Host:** And the resource side — how does the authorization server know which server this narrowed token is even supposed to be good for?

**Guest:** That's RFC 8707, resource indicators. The client states the target server's canonical URI in the resource parameter, on both the authorization request and the token request, and that's what lets the AS stamp an accurate aud. Then the server itself, acting as resource server, has to run five checks — signature, issuer, expiry, that aud actually names it, and that scope covers this exact tool — and skip any one of those five and the other four are decorative.

---

## 6. Server-Side Validation Is the Load-Bearing Half

**Host:** So walk through why it's five checks and not, say, two. Why can't a server just verify the signature and the audience and call it done?

**Guest:** Because each check closes a different attack, and they don't overlap. Signature and issuer together tell you the token is real and came from an AS you trust — skip issuer and a token forged by some other authorization server you never approved sails through as long as the crypto is valid. Expiry closes the window on a token that leaked yesterday; aud makes sure a token minted for the calendar server can't be replayed against the file server; and scope stops a token that's valid for this exact server from being used to invoke a tool it was never authorized for.

**Host:** And that last one, scope covering the specific tool, that's the one people skip, isn't it?

**Guest:** Exactly, and it's also where the discovery and registration machinery matters, because none of this works if a client can't find the right AS in the first place. RFC 9728 gives servers a standard way to publish protected resource metadata so clients discover the authorization server instead of being hand-configured. Client registration is shifting too — Dynamic Client Registration is deprecated in 2026, with Client ID Metadata Documents as the draft-stage successor — but that's plumbing around the edges. The five checks on the resource server are the part that actually decides what a stolen token can open.

---

## 7. Code: Validate Before You Trust

**Host:** So walk me through the actual validation code, because I imagine the order you check things in isn't arbitrary. Where does a resource server start?

**Guest:** Cheap structural checks first, signature verification after, and critically, audience before scope. If you check scope before you've confirmed the token was even meant for this server, you're doing meaningful policy work on a token that could be a real, validly signed credential for a completely different service.

**Host:** That's the confused-deputy case again. But I want to flag something in the code — audience gets checked as part of the decode call itself, not after. Why does that matter?

**Guest:** Because the standard way this protection silently disappears is someone debugging locally turns off audience verification to get past an error, adds a manual claims comparison afterward to compensate, and then that setting never gets flipped back before it ships. Delegating the audience check to the library, in the same call that verifies the signature, means there's no intermediate state where it's quietly off. And the rejection reason — audience mismatch, bad scope, whichever — goes in the audit log, never the response. The caller gets a bare 401. Telling them which check failed hands them a map for probing the boundary.

---

## 8. The Support Agent Example

**Host:** Let's put a real shape on this. Support agent, summarizing invoices for a customer, needs two tools on two different servers — read the invoice, read the contact record. Walk me through what actually happens at the credential level.

**Guest:** The user signs in, the host gets a token audienced to itself. Then two exchanges happen, one per downstream server. Billing gets a token with aud set to the billing server and scope invoice-read, five-minute lifetime. CRM gets its own token, aud set to the CRM server, scope contact-read, also five minutes, and both carry the agent's identity in that act claim we covered earlier.

**Host:** And the blanket-delegation version of this same request would look like what, exactly?

**Guest:** One token, sent to both servers, carrying every scope the human support engineer holds — including issue-refund, which nobody asked for and this task never needed. So now say a prompt injection is sitting in the invoice PDF, and it talks the agent into trying to issue a refund. Under blanket delegation that succeeds, because the token can do it. Under agent-scoped credentials, the billing server checks the scope on the token in hand, finds no refund permission, and returns a 403 — the model got persuaded, but it never got a credential to make good on it. And the log line that results says agent acting for user, not just user, which is exactly the distinction that turns an incident into something you can actually explain.

---

## 9. How This Fails in Practice

**Host:** So we've seen the design that works. Where does this actually go wrong in practice, when teams think they've built it correctly but haven't?

**Guest:** The first one is passthrough dressed up as an integration — you forward the user's token straight to an MCP server you don't control. Now that server holds a live credential it can replay against every other service that accepts it. The spec is explicit both directions: servers must not accept tokens not meant for them, clients must not send tokens issued for somewhere else. And you catch it by asserting on the audience claim in a test, because reading the code won't show you a missing check.

**Host:** That last part sounds like it's describing something that already happened somewhere, not a hypothetical.

**Guest:** It's the most common one, actually. Someone hits an audience mismatch in staging, sets the audience check to false to unblock themselves, ships it, and it survives every review because the system is fully functional. There's no runtime symptom for 'accepts tokens meant for someone else' — everything works, it's just working with the door unlocked. Same pattern with scope: the exchange asks for whatever the subject token carries instead of computing the minimum, because computing the minimum is work, and the narrowing machinery sits there unused while every audit reads as compliant.

**Host:** And I'd guess lifetime and revocation have their own version of that same trap.

**Guest:** Right — someone mints an hour-long token to avoid refresh complexity, forgetting that short lifetime is the actual compensating control for a credential riding through model-directed control flow, so an hour-long token is just a stolen credential with an hour of runway. And then there's the assumption that disabling the user's account is the kill switch. It isn't — already-issued agent tokens stay valid until they expire, and if the agent has its own client credentials it can keep minting new ones regardless. Revocation needs an identity for the agent itself to act on, not just the human's.

---

## 10. What Narrowing Costs

**Host:** So this isn't free. If I'm sold on exchange over forwarding, what am I actually signing up to pay for?

**Guest:** A round trip to the authorization server the first time an agent touches a given resource, which is latency forwarding doesn't have — forwarding is just free and immediate, except it's outright prohibited when the recipient's an MCP server, so that comparison is a bit unfair. But the bigger cost is that your authorization server has to support RFC 8693, and someone has to actually decide the minimum scope per task. That's design work, not a config flag.

**Host:** And the short lifetimes — minutes, you said earlier — that's not just an inconvenience for long-running agents, right? That's a failure mode you have to build for.

**Guest:** Exactly, and it's the same shape of problem as retries from the distributed systems module — a long-running task has to expect expiry mid-flight and re-exchange, not treat it as an exception to route around by minting an hour-long token. Then there's identity lifecycle: per-agent identities give you real attribution and let you revoke one agent without touching the others, but that means managing identities that scale with your agent count. A single shared identity is trivial to operate, sure — it just makes every audit log entry say the same name, which is worth nothing when you're trying to figure out which agent did the damage.

---

## 11. Running It at Scale

**Host:** So if I'm running hundreds of these exchanges a day, the round trip itself becomes a tax. How do you keep that from strangling every tool call?

**Guest:** You cache the exchanged token for its lifetime, but the key has to be audience plus scope set, not just the user — key it by user alone and you'll hand an agent a token for the wrong server. And validation stays local: signature checks against a cached JWKS are microseconds, whereas introspecting every token against the authorization server puts a network call in front of every single tool invocation.

**Host:** Which turns the AS into a dependency you can't afford to have go down.

**Guest:** Right, it's already on the critical path for first use of any resource, so its availability budget is now your agent's availability budget — local validation is what keeps it off the path for every subsequent call, which is what makes that dependency tolerable. And that's before you factor in scale: identity lifecycle has to become an automated operation past a handful of agents, scope names need a convention before they sprawl into unaudited duplicates, and multi-tenant hosting multiplies the audience space entirely — it's the same isolation call the enterprise platform architecture makes, just applied to identity instead of infrastructure.

---

## 12. Proving It: The Lab and the Checklist

**Host:** So let's put a number on all of this. The lab runs one token against a three-server, six-tool fleet and just measures what actually opens. What does it find?

**Guest:** Three results, and the middle one is the uncomfortable one. Fully scoped down to one audience and one scope, the token opens exactly one tool. Narrow only the audience and leave scope alone, it opens two — both tools on that server, refund included — and that configuration reads as compliant because you did narrow something.

**Host:** And the raw user token, just forwarded like the old default?

**Guest:** Zero. Nothing opens, because its audience names the identity provider and every server in the fleet rejects it outright. That's not a win for passthrough, though — it's dangerous for what it hands to whoever receives it, not for what it directly opens, and the lab is careful to say that rather than let the zero look like safety.

**Host:** That's the whole episode in one table, honestly — audience checked server-side, scope narrowed deliberately, and don't assume a protection you haven't tested. On that note, thanks for walking through all of it.
