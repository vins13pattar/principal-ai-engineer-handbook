### 1. Narrowing is three things, not one

**Host:** So we're digging into this agent identity broker lab today, and the headline claim is almost provocative: narrowing isn't one thing, it's three things, and if you only do one of them, you don't actually have a control. Walk me through why that split even matters.

**Guest:** Right, the instinct is to think of a token exchange as 'shrinking' access, like there's a single dial you turn down. But the lab shows audience, scope, and lifetime are independent axes, and there's a test that asserts all three move together. The reason that matters is the counterfactual: take a token that's correctly bound to one server, so audience looks perfectly narrowed, but let it still carry every scope the user originally held. That token opens both of that server's tools — including the refund tool — because audience only decided where the token can go, not what it's allowed to do once it's there.

**Host:** So a design review could look at that audience binding, see it's tight, and sign off — while the refund tool is sitting wide open behind it. That's the trap. So what does the broker actually do when it's asked to hand out scopes the caller was never granted, or handed a token that wasn't even addressed to it in the first place?

**Guest:** It refuses, flatly, at exchange time. Ask for a scope the subject doesn't hold and the request is denied — a narrowing mechanism that can widen isn't a control, it's a suggestion. And the harder refusal is the second one: the broker checks that the presented subject token was actually addressed to it before minting anything, because without that check it's just an escalation service — hand it any stolen token and walk away with a correctly signed credential for whatever target you like.

### 2. What one token actually opens

**Host:** So walk me through the actual measurement — you built a fleet, three servers, six tools total, and you ran real tokens against it to see what opens. What's the headline number for the properly scoped credential?

**Guest:** One tool, out of six. That's the agent-scoped credential — one audience, one scope, and it opens exactly the door it was minted for and nothing else. But narrow only the audience and leave scope alone, and the number jumps to two, because now it's both tools on that server, refund included, since scope never said no.

**Host:** And the row everyone wants to misread is the raw forwarded user token opening zero — that sounds like a win for passthrough, doesn't it?

**Guest:** It sounds that way, and it's exactly backwards. It opens zero here because its audience names the identity provider, not this fleet — every server here happens to reject it, but hand that same token to whoever's on the other end of that forward and it's still a fully live user credential wherever it does match. The zero measures this fleet's luck, not the token's safety.

### 3. A protection that has never failed can't be trusted

**Host:** So if that zero was really just luck, how do you actually prove the audience check is doing anything at all, rather than just sitting there looking like a control?

**Guest:** You break it on purpose. Set verify_aud to False in the resource server's decode options, the exact thing a tired engineer might flip during a debugging session, and run the suite — six tests fail across all three files. Flip it back and they all pass again, and that flip is the whole point, because audience verification has no runtime symptom when it's missing. The system keeps running, keeps serving requests, looks completely healthy, it's just unprotected, so a test suite that doesn't visibly die when the check disappears was never testing the check in the first place.

**Host:** So the mutation itself has to be a permanent part of CI, not a one-time exercise you ran once and trusted forever.

**Guest:** Exactly, it's its own job in the pipeline — disable the check, assert the suite goes red, and fail the build if it doesn't. Because a security test that has never once failed is indistinguishable from a test that can't fail, and that's the whole thesis: narrowing audience, scope, and lifetime is only a control if something breaks loudly the moment it's gone, otherwise it's a design review that passed on vibes.

### Not covered

The planner wanted these and found nothing in the source to support them:

- How the broker would integrate with a real, non-simulated identity provider in production
- The principal-level design questions about where the exchange should live (host vs. sidecar) and who decides minimum scope
