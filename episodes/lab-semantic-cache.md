# The Cache That Can't Tell Right From Wrong

_A semantic cache promises free speed, but on this corpus every threshold that serves a real hit rate also serves wrong answers indistinguishable from right ones — and the fix isn't a better number, it's a better key._

- **Source:** [lab:semantic-cache](/build/labs/semantic-cache/)
- **Runtime:** 4:00 · 10 turns · 3 beats
- **Written by:** claude-sonnet-5 on 2026-08-23
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. The false-hit curve nobody reports

**Host:** Every dashboard for a semantic cache shows you the same headline number: hit rate. It's the metric everyone brags about, because higher hit rate means faster responses and lower compute costs. But today we're going to talk about the number nobody puts on that dashboard.

**Guest:** Right, the false-hit rate. That's when the cache confidently serves you a wrong answer, and it comes back just as fast and just as polished as a right one. Downstream, there's no way to tell the difference — it looks exactly like a correct response until someone acts on it.

**Host:** So walk me through what happens when you actually sweep the similarity threshold on a real corpus. I'd assume there's some sweet spot where you get a healthy hit rate and precision stays high.

**Guest:** That's the finding that should worry people: there isn't one. At 0.90 you already get false hits with zero precision. At 0.90 and 0.85, hit rate and false-hit rate move together exactly. Loosen it further, past 0.80, and hit rate starts pulling ahead as precision actually rises — but it never gets safe, it just gets less bad. And it's worse than overlapping distributions — they're inverted. The EU refund question scores 0.875 against the US version, higher than 'how do I reset my password' scores against its own genuine paraphrase at 0.833. The pair that must never be conflated is literally the more similar one.

---

## 2. What's real about it, and what a real embedding would fix

**Host:** So how much of that inversion is a real property of the data, and how much is just an artifact of the toy embedding you built for this test?

**Guest:** The mechanism is real — a short entity token like EU versus US gets swamped by all the shared framing around it, and that's a genuine weak spot even for real dense embeddings, not just a lexical stand-in. The inversion itself is probably an artifact of that stand-in; a real model would likely separate those two groups better and soften the flip into overlap rather than a clean reversal. But take the toy embedding away and the engineering point still holds: tightening the threshold only trades a false hit for a missed one, it can't erase the risk, and there's no universal number you can borrow — the threshold only means something once you've measured it against your own corpus and your own model.

**Host:** So there's no number you can just lift from someone else's benchmark and paste into your config — you have to build the labeled near-duplicate set yourself and find your own curve.

---

## 3. The key you forgot, and who's supposed to notice

**Host:** Okay, so we've got a threshold we can't fully trust. Is there anything about this cache that's actually a solid rule, not a judgment call?

**Guest:** Yes — the key itself, before you even touch similarity. A cached answer is only valid for one model, one prompt version, one tenant, and that has to be filtered before the vector search runs, not after. Filter afterward and you've already read another tenant's answer and are just deciding what to do about it, which is the exact same gotcha vector databases have with cross-tenant leaks. Prompt version is the one everyone forgets, because prompts get edited weekly while models change rarely, so an edit that changes the right answer just keeps serving the old one until the TTL finally expires.

**Host:** Which means the real open questions aren't technical at all — nobody's put a price on what a wrong cached answer costs, so the threshold gets set by whoever's staring at the hit-rate dashboard that day. Nothing downstream can tell a false hit from a real one apart from sampling cached against fresh, which almost nobody bothers to do. And if your eval suite runs through the cache, you're not grading the model anymore, you're grading the cache — and it'll keep reporting yesterday's score long after the model's changed.

---

## Not covered

The planner wanted these and found nothing in the source to support them:

- A concrete dollar figure for what a wrong cached answer costs — the excerpts pose this as the open question a team must answer, but don't supply one
- A worked example of detecting entity-swap near-duplicates automatically, beyond naming it as 'the fix'
- A production case study of this cache deployed at scale alongside the Model Router lab's cost tradeoffs
