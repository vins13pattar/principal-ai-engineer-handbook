# Who Is This Agent, Really? Inside the Agent Identity Platform

_Policy checks are worthless if the caller they're scoped to is a lie — this episode traces how forwarding the user's token quietly destroys blast radius, attribution, and revocation, and how a narrowing broker plus a distrustful resource server rebuilds all three, with a lab that proves the one check nobody can afford to skip._

- **Source:** [architecture:agent-identity-platform](/architecture/systems/agent-identity-platform/)
- **Runtime:** 16:56 · 39 turns · 12 beats
- **Written by:** claude-sonnet-5 on 2026-08-29
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The Question Authorization Never Answers

**Host:** So we've spent a lot of time in this space talking about policy checks — what a tool is allowed to do, what scopes it needs, all of that. But there's a question sitting underneath all of it that I don't think gets asked enough: when your agent calls a tool, who exactly is calling? Today we're digging into that, because it turns out the answer everyone reaches for first is the answer that quietly breaks everything.

**Guest:** Right, and the reason it's so tempting is that policy-gated execution already assumes an identity — it scopes every permission to a caller, but it never actually manufactures that caller. So the obvious move is to just hand the agent the user's own token. It's zero extra work, it runs immediately, and the agent inherits exactly what the user could already do. The problem is that an agent asked to summarize your inbox is now holding the same credential that can issue a refund or delete a record, because that token was never scoped to the task — it was scoped to the person.

**Host:** And that one shortcut breaks three separate things at once, from what I understand — blast radius, attribution, and revocation — and it breaks them silently, which is the part that should worry people. So that's where we're headed this episode: what it actually takes to mint an identity for the agent itself, one a resource server can distrust by default, so that fixing one of those three doesn't mean sacrificing the other two.

---

## 2. What a Real Fix Requires

**Host:** Okay, so if forwarding the user's token is the shortcut that quietly breaks everything, what does the fix actually demand? You mentioned mint an identity for the agent — what does that checklist look like in practice?

**Guest:** It comes down to seven things that all have to hold at once. First, agent-scoped credentials — every call carries a token minted for that agent and that task, never the user's token relayed onward. Second, narrowing has to happen in three dimensions together, audience, scope, and lifetime, because narrowing just one isn't narrowing at all. Third, the resource server has to do its own validation every time — signature, issuer, expiry, audience, scope — regardless of what the caller claims about itself. Fourth, the exchange that produces the agent's token has to be incapable of widening; ask for a scope the subject doesn't hold and the broker refuses. Fifth, that broker can't launder tokens either — it has to verify the presented subject token was actually addressed to it before minting anything downstream. Sixth, the resulting credential has to name both the agent and the user it's acting for, so the audit trail can tell them apart. And seventh, revocation has to work short of the user — stopping one agent must not mean disabling the human it's acting for.

**Host:** That's a longer list than I expected for what sounded like one shortcut. Which of these seven is the one people actually get wrong in practice — the one the rest of this episode is going to keep circling back to?

---

## 3. The Constraints That Don't Show Up Until They Bite

**Guest:** It's audience verification, hands down. Everything else on that list breaks loudly — a broker that's down fails every tool call. But skip audience verification and nothing breaks. The system runs perfectly, every demo passes, every test goes green, because the only thing missing is the check that would have said 'this token wasn't issued for you.'

**Host:** So there's no dashboard, no error, no degraded mode — it just silently works right up until it's exploited. Walk me through why a resource server would even skip that check. It sounds like the one thing you'd never forget.

**Guest:** Because the client hands you a token and says 'this is scoped to me,' and it's tempting to just believe that self-report — but a claim the caller makes about itself is worth nothing, it's a suggestion box, not authorization. The actual spec, MCP's 2026-07-28 authorization update, requires the server to independently validate audience, not trust the assertion. And it gets worse when you add short-lived tokens into the mix, because a five-minute lifetime is great security and a real hazard for a task that runs an hour — expiry mid-task is either a path you've built for or an outage you didn't see coming.

---

## 4. Two Stages, Two Jobs: Narrow, Then Distrust

**Host:** So walk me through what actually happens end to end, because you keep saying two stages and I want to know why that split matters so much.

**Guest:** The broker's whole job is narrowing — it takes a long-lived, broadly-scoped subject token and mints something tight: one audience, one scope, a few minutes of life. But before it mints anything it checks three things — was this subject token actually addressed to the broker itself, are the requested scopes a subset of what the subject holds, and is this actor even permitted to act for this subject. Only after all three pass does it hand over the narrow credential, and that's the last the broker ever hears about it.

**Host:** And the resource server doesn't just take the broker's word that the narrowing was done right.

**Guest:** Right, it distrusts by design — it re-derives signature, issuer, expiry, audience, scope, all of it, from the token in front of it, and the only thing it ever got from the broker's world is the issuer's public key. It never phones home to ask 'is this good,' because a check that depends on a live call to the authority is a check that fails open the moment that authority is slow or down. And when something fails, the caller gets a bare 401 or 403 — the actual reason, which of the five checks blew up, goes only to the log, because handing that back to the client is a free oracle for figuring out exactly how to narrow the attack.

---

## 5. How This Fails: Half-Narrowed, Laundered, and Drifted

**Host:** So let's make this concrete. If passthrough is the disease, what does the actual damage look like when someone finally measures it?

**Guest:** The passthrough case is the worst because the credential is good everywhere the user is — it's not scoped to one server, it's the user's whole reach, so whoever catches it inherits the user's blast radius. But even the half-measure fails in a way that looks fine on paper. In the lab, a token narrowed to a single server but still carrying every scope the user holds opens two of six tools on that fleet — both tools on that one server, including the refund tool. You'd sign off on that in a design review because 'we scope tokens per service' is technically true, and it's still handing out the one tool you most needed to lock down.

**Host:** And the broker itself — that's supposed to be the trusted narrowing point. What happens when it skips its own check?

**Guest:** If the broker doesn't verify the audience on what's handed to it, it stops being an identity service and becomes an escalation service — feed it any stolen token from anywhere, get back a correctly-signed credential for whatever target you pick. And the quieter version of that is someone flipping the verify-audience setting to false to unblock a local error and never flipping it back. Every test keeps passing, every request keeps succeeding, there's no symptom at all — the only thing that catches it is a test built to fail the moment that check is gone. Scope creep works the same way on a longer clock: minimum scope gets widened every time a task fails for want of a permission, and it never narrows back because nothing breaks when it's too wide, so eighteen months in the agent's token is just the user's token with extra steps.

---

## 6. The Broker's Scaling Problem

**Host:** So we've established short lifetimes are the security lever, but there's a bill attached to that lever, right? Walk me through what actually happens to the broker when you turn it.

**Guest:** Halve the token lifetime and you roughly double the exchange volume hitting the broker, because every agent action now needs a fresher credential more often. That's the central tension of this whole design — a security dial that's wired directly to a capacity number. If you don't think about it as a capacity number, you'll tune security and take down the platform by accident. The thing that saves you is that exchanged tokens are cacheable, keyed by subject, actor, audience, and scope, and they get evicted before expiry rather than left to expire naturally. That decouples broker load from raw tool-call volume — but it also means that cache is now a credential store, with everything that implies about how you guard it.

**Host:** And resource servers don't share that problem the same way — they're not calling home on every request?

**Guest:** Right, they scale independently because validation is entirely local — signature, issuer, expiry, audience, scope, all come from the token itself plus a cached public key. No coordination, no shared state, no call back to the broker. The one place they still depend on the outside world is JWKS — cache the keys, refresh on an unknown kid, and rate-limit that refresh, or a key rotation turns your whole fleet into a thundering herd against the identity provider. But none of that changes the fact that the broker itself is a single point of failure for every agent action — it needs the availability budget of the platform's most critical path, because functionally, that's exactly what it is.

---

## 7. The Security Checklist and Proving the Check Can Fail

**Host:** Let's make the checklist concrete instead of decorative — what are the rules that actually carry weight, the ones where skipping them doesn't show up as an error, it shows up as a breach nobody notices?

**Guest:** Validate audience server-side on every request, and verify it at the broker before minting anything, so the broker itself can't be used to launder a credential into a wider one. Refuse to widen — requested scopes have to be a subset of held scopes, denied at exchange time, not caught later at use time — and bind audience, scope, and lifetime together, because a test that only asserts the easy dimension narrowed will happily pass on a system that only narrows the easy dimension. Never return the rejection reason to the client, since five checks with five distinct error messages is a map you're handing an attacker for free.

**Host:** And audience is the one you keep coming back to as the load-bearing one — presumably because if it's silently missing, nothing breaks, nothing alerts, the system just runs fully functional and fully unprotected.

**Guest:** Exactly, which is why the lab doesn't just test it once and trust the test — it proves the test can fail. Turn audience verification off in the resource server's decode options, the way a tired engineer debugging something unrelated actually might, and six tests go red across all three files; restore it and they pass again. CI runs that exact mutation as its own job — disable the check, assert the suite goes red, fail the build if it doesn't — because a security test that has never failed is indistinguishable from one that can't.

---

## 8. The Trade-offs: Lifetime, Placement, Granularity, Privacy

**Host:** Let's talk trade-offs, because none of this comes free. Start with lifetime — why not just pick one duration and move on?

**Guest:** Because a single global lifetime is always wrong in two directions at once. Five minutes is defensible for a refund scope where a leaked credential could do real damage, but an hour is fine for a read-only search — deciding per scope is what keeps that dial honest instead of splitting the difference badly for everything.

**Host:** And the same tension shows up in placement, audience granularity, and even attribution itself, doesn't it?

---

## 9. What All This Actually Costs

**Host:** So let's put a price tag on all of this. When people first hear 'exchange a token on every tool call,' their instinct is that it's expensive — an extra network round trip sitting right on the critical path of every action. Is that the real cost, or is that a red herring?

**Guest:** It's real but it's not the big one, and caching is what tames it — you exchange once, reuse within the token's lifetime, so short lifetimes stay affordable instead of becoming a tax you pay on every call. The actual expense is broker availability, as we touched on earlier. Meanwhile validation is nearly free — checking a signature against a cached key is microseconds, so 'we validate on every request' sounds scary and isn't. The number that actually surprises people is audit volume, because it scales with agent calls, not user requests, and one request fanning out into dozens of calls means your log volume is easily an order of magnitude bigger than anyone budgeted for.

---

## 10. What to Watch on a Dashboard

**Host:** So audit volume tells you the size of your logs, but not what to actually watch for. If someone's staring at a dashboard, what are the five or six numbers that tell them apart between an incident, a bug, and a Tuesday?

**Guest:** Start with exchange denials, broken out by reason, not lumped together. Wrong audience on the subject token is a possible laundering attempt, scope not a subset is a mis-scoped agent, actor not permitted is a delegation misconfiguration — three totally different pages to call, and if you aggregate them into one denial count you can't tell which one fired. Same logic on the resource server side: which of the five checks failed matters enormously, because an expiry rejection is just operational noise while an audience rejection is either a bug or an attack, and if rejections cluster right around expiry that's almost always tasks outliving their tokens, not anything malicious. Then there's scope breadth per agent, which is the one you have to watch as a trend rather than an alert since drift creeps in slowly, and exchange rate per agent, where a sudden spike means either a broken cache or an agent stuck in a loop — either way you want to catch that yourself before the identity provider's rate limiter does it for you.

---

## 11. The Measured Fleet: What a Token Actually Opens

**Host:** So let's put actual numbers on this. You've got a six-tool fleet across three servers, and you ran three different credentials through it. What did a fully narrowed, agent-scoped token open?

**Guest:** One tool. Out of six. That's the token with a single audience and a single scope, exactly what the agent needed for the task it was doing — nothing else on that server or any other server even parses it correctly, let alone honors it.

**Host:** And when you only narrow the audience, leaving scope untouched — that's the half-measure you warned about earlier?

**Guest:** Right, and it opens two, both tools on that one server, refund included. That's the whole point of the counterfactual — audience tells the token where it's allowed to go, but only scope tells it what it's allowed to do once it's there. Now here's the row that trips people up: forward the raw user token unmodified, and it opens zero. Every server rejects it outright, because its audience names the identity provider, not them. It looks like the safest row on the table, and it's actually the most dangerous, because that zero isn't protection — it's just the wrong audience field. Passthrough isn't dangerous because it over-grants directly here; it's dangerous because of what it hands to whoever receives it, whether that's a sloppy server or a broker willing to launder it.

---

## 12. Defending the Design Under Questioning

**Host:** Let's do the lightning round before we close, because these are the questions that actually separate someone who's absorbed this from someone who's just nodded along. Why is forwarding the raw token dangerous beyond just over-granting at one server, and what's the real difference between what audience limits and what scope limits?

**Guest:** Passthrough makes the agent's permissions identical to the user's, so every action gets logged as a human action, and revocation has no lever short of disabling the person — the danger isn't one over-permissive server, it's that the credential is good everywhere the user is, so whoever receives it holds the user.

**Host:** So the whole argument comes back to one sentence: a policy check is only as honest as the caller it's checking, and everything we've walked through — narrowing, distrust, the audience check, the CI job that proves the check can fail — exists to make that caller true instead of assumed. That's the episode. Thanks for building this out with us.
