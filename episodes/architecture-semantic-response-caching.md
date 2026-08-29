# Semantic Response Caching: The Cache That Can Be Wrong

_An exact-match cache can only be slow or empty, but a semantic cache can serve a confidently wrong answer indistinguishably from a right one — so the entire design has to be built around measuring and bounding that risk, not just chasing hit rate._

- **Source:** [architecture:semantic-response-caching](/architecture/systems/semantic-response-caching/)
- **Runtime:** 16:41 · 40 turns · 12 beats
- **Written by:** claude-sonnet-5 on 2026-08-29
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. Why this is the highest-leverage lever, and the catch

**Host:** So if you look at the cost and latency breakdown of pretty much any AI product, model calls dominate both. And a huge chunk of those calls are people asking something the system has already answered, just phrased a little differently. That feels like it should be an easy win.

**Guest:** It should be, but exact-match caching basically can't touch it. 'How do I reset my password' and 'how can I reset my password' are the same question to a human and two completely different cache keys to a string comparison. So semantic caching comes in and matches on embedding similarity instead of exact text, and it becomes one of the highest-leverage cost levers you have.

**Host:** But you said it's also the one that quietly changes what the system returns. That sounds like the catch.

**Guest:** It is the catch, and it's a category difference, not just a tuning knob. An exact-match cache can only ever be slow or empty — worst case, you eat a model call. A semantic cache can be wrong. It can serve a confidently incorrect answer, fast, and nothing downstream can tell the difference: not the caller, not the model, not your logs, not your eval suite. So the real engineering question isn't how to push the hit rate up, it's how do you even know what that hit rate is costing you.

---

## 2. Two orderings that carry the whole design

**Host:** Okay, so if the whole risk is a confidently wrong answer served indistinguishably from a right one, where do you even start controlling that? You said there are two orderings that carry the design — what are they?

**Guest:** First one's cheap and obvious once you say it out loud: always check exact-match before you ever touch semantic. It's a hash lookup, zero false-hit risk, and it peels off a real chunk of traffic before you've asked any similarity question at all. The second ordering is the one that actually determines correctness, and it's easy to get backwards — scope filter before similarity search, not after.

**Host:** Walk me through why the order there matters so much, because on the surface filtering feels like filtering either way.

**Guest:** If you filter after the search, the nearest neighbor was already read out of another tenant's data before you discarded it — the read already happened, you're just deciding what to do about it afterward. That's the Vector DB lookup's first gotcha showing up here as a cache: the ANN index and the tenant boundary have to be the same query, not two sequential steps, or you've built a leak that looks like a filter.

---

## 3. What makes a cache hit valid

**Host:** So given that gotcha, what actually has to be true for you to trust a cache hit at all? Let's lay out the checklist, because it sounds like hit rate alone tells you nothing.

**Guest:** Start with an exact tier before you even touch semantic — a string match is free and certain, so let it absorb whatever share of traffic it can before you take on any risk. Then you need a scope key that makes a hit valid: model, prompt version, and tenant at minimum, because an answer is only an answer from a particular model, under a particular prompt, for a particular tenant. Beyond that you need false-hit rate measured continuously in production, not just hit rate; invalidation triggered by prompt edits and model changes instead of a TTL clock that has no idea what changed; and a bypass path so eval and debugging can always reach the real model instead of getting served a cached answer.

---

## 4. The threshold you can't borrow, and the entity-swap trap

**Host:** So if I found a similarity threshold that works great in someone's blog post, or even in your own reference implementation, can I just use that number?

**Guest:** No, and this trips people up constantly. The threshold is a joint property of your corpus and your embedding model — it's telling you where similar-meaning text tends to cluster for that specific model on that specific kind of question, and neither of those transfers. Worse, when the threshold is wrong in the risky direction, there's no symptom: nothing in the response distinguishes a false hit from a correct answer, so the only way to catch it is deliberately sampling cached answers against fresh ones, which almost nobody bothers to set up. And the case that breaks people's intuition hardest is the entity swap — 'pricing in the EU' versus 'pricing in the US,' or '2025' versus '2026' — because that swapped token is short and carries almost no weight against a long shared sentence of framing, while genuine paraphrases differ mostly in function words, which are a bigger fraction of a short question. So the pair you must never conflate can score more similar than the pair that should legitimately hit.

**Host:** That's a nasty inversion — the thing that actually matters least by length ends up mattering most by consequence. So how do you even start building a defense against something that leaves no trace once it's wrong?

---

## 5. The lab's inverted curves

**Guest:** You start by actually sweeping the threshold and printing both curves side by side, not just the one that makes the dashboard look good. On this corpus, at 0.90 you get a 22% hit rate, and every single one of those hits is false — zero precision. Push down to 0.60 and you're hitting 89% of the time, but more than half of those hits are wrong answers served with total confidence.

**Host:** So there's no dial you can turn where it's just... fine. Every setting that serves anything is serving some garbage.

**Guest:** Right, precision never touches 100% at any threshold that returns results, and that's before you get to the part that actually kept me up at night. The EU refund policy question scores 0.875 against the US version, and a genuine paraphrase — 'how do I' versus 'how can I' reset a password — scores 0.833. The pair that must never be conflated is literally more similar than the pair that's supposed to be a safe hit.

---

## 6. What survives a real embedding model, and what doesn't

**Host:** Okay, before we all panic and swear off semantic caching forever — how much of that inversion is a real property of language, and how much of it is just an artifact of whatever embedding model you happened to run the lab with?

**Guest:** The mechanism is real, the exact numbers aren't. The lab used a lexical stand-in, so it's basically counting shared words, and 'EU' versus 'US' is one short low-weight token drowning in a sea of identical framing, while 'how do I' versus 'how can I' changes function words that make up a huge fraction of a short question. A real dense model would likely separate those groups better, and the tests even name that expectation — there's an assertion checking the distributions are inverted, not merely overlapping, specifically flagging which result should weaken if you rerun this with a real embedding.

**Host:** So if I swap in a proper model and the gap softens into overlap instead of a flip, does that mean the danger mostly goes away?

**Guest:** No, and that's the conclusion that actually survives the swap — overlap is still fatal, it just looks like a harder tuning problem instead of an obvious inversion. Tightening the threshold trades false hits for false misses, it doesn't eliminate either, and on some corpora there's no usable point at all.

---

## 7. The scope key: model, prompt version, tenant

**Host:** So we've got the threshold pinned down as best it can be. But you keep mentioning a 'scope key' alongside it — what actually goes into that, and why isn't the embedding similarity enough on its own?

**Guest:** Because a cached answer isn't just an answer, it's an answer from a specific model, under a specific prompt version, for a specific tenant — and the tests show that changing any one of those three invalidates the hit even if the embedding still lines up perfectly. Prompt version is the one everyone forgets, because prompts get edited constantly while models barely change, so a wording tweak that actually shifts the answer keeps quietly serving the old cached shape until the TTL finally expires.

**Host:** And where does that filtering actually happen relative to the similarity search itself?

**Guest:** Before, always before — scope has to gate the candidate set going into the search, not clean up after it. If you filter afterward, the nearest neighbor was already read out of another tenant's vectors before you discarded it, which is exactly the vector store's metadata-filtering and namespace story showing up in cache form: filtering is supposed to be evaluated as part of the search, and namespaces are the usual unit of tenant isolation, so the cache needs to lean on those same mechanics rather than bolt scope on as a post-hoc check.

---

## 8. How this fails in production

**Host:** So let's walk through how this actually breaks in the wild, starting with the one everyone thinks they've solved: threshold tuning. Someone looks at a hit-rate dashboard, decides it's too low, and turns the dial.

**Guest:** Right, and that dial only moves in trade, not in improvement. Loosen the threshold and hit rate goes up, but so does the false-hit rate, and only the hit rate shows up on the cost dashboard someone's watching. Tightening doesn't fix it either — it just swaps false hits for misses, because if the two populations overlap, no single cutoff separates them; you're not solving a tuning problem, you're discovering that similarity was never equivalence.

**Host:** And that's separate from the tenant leakage failure we just covered — post-filtering looks fine in every test until the day it isn't.

**Guest:** Exactly, it passes tests because the filter does remove the wrong-tenant result — until the day a result gets returned before the filter runs, or the filter itself gets dropped in a refactor. There was never structural isolation, just a check that happened to run every time until it didn't. Then there's the one that hits hardest because it's so mundane: someone edits the prompt, the model doesn't change, and the cache keeps serving the old answer for the full TTL — so you get a deploy log saying it shipped and a product behaving like it didn't. Worse, the eval suite is scoring the cache's answers, not the model's, so it stays flat right through a real regression, and a TTL only tells you how old an answer is, never whether it's still correct, so a fix just waits out an interval that was picked for reasons that have nothing to do with what changed.

---

## 9. Scaling the lookup path

**Host:** Let's talk about what happens as this thing actually grows, because a lookup path that works at a thousand entries isn't automatically the one that works at a million. Where's the line, and what changes when you cross it?

**Guest:** Brute-force cosine scan is fine for longer than people expect — below a few thousand entries per scope, it's cheaper to just compare against everything than to run an index. Past that you need ANN, but you've traded exact nearest-neighbour for approximate nearest-neighbour, so now the closest match the cache finds might not actually be the closest match that exists. Scope keys help enormously here because they partition the search space naturally — you're scanning one tenant's entries under one prompt version, not the whole corpus, so the same key that gives you isolation also keeps the candidate set small. But two things bite regardless of index choice: every single lookup pays for an embedding call, so you've traded a small model call for a large one on every request, and the embedding endpoint now inherits the traffic of your entire product. And when a popular entry expires, every concurrent caller piles onto the model at once unless you single-flight that miss — otherwise the cache amplifies exactly the load spike it was built to absorb, right when write volume is already peaking from a prompt change invalidating everything at once.

---

## 10. The security surface of a store of answers

**Host:** We've talked about this cache as a performance layer, but it's also just a database sitting there with real answers in it — so what does the security surface look like once you frame it that way?

**Guest:** The headline risk is cross-tenant leakage, and the fix has to be structural, not a check you remember to add later — the scope filter belongs inside the query the vector store runs, not in application code you hope every call site respects. Beyond that, a cache is a store of answers, so it inherits the data classification of whatever's in those responses, even though it usually gets a retention policy written for performance infrastructure instead of sensitive data; and the prompt version in your key is doing security work too, because if that version bump was the fix for a jailbreak or a data-exposure bug, stale cached entries under the old version are stale vulnerabilities. There's also a subtler leak: timing itself is an oracle, since a fast response means a hit, which means somebody else asked something similar recently, and in a multi-tenant system that can reveal that another tenant exists or is active — usually fine to accept, but it's a decision you want to make on purpose rather than discover in an audit.

---

## 11. Counting the real cost, and the trade-offs nobody wants to make explicit

**Host:** Let's put a number on this. A hit swaps a full model call for an embedding call and a lookup — that's two orders of magnitude cheaper, but you're paying that embedding cost on every single request, hit or miss. So a cache with a low hit rate isn't free, it's just a small tax instead of a saving, right?

**Guest:** Exactly, and storage is basically free — it's text, TTLs keep it bounded, nobody loses sleep over that line item. The cost nobody puts on an invoice is a false hit: a wrong answer costs whatever it costs your product, a support deflection that misinforms, a policy quoted for the wrong region.

**Host:** So without a dollar figure for a wrong answer, every threshold conversation is really just people arguing about a dashboard. Given that, what's the actual defensible fallback — exact-only, and TTLs or versioned keys?

**Guest:** Exact-only is a legitimate final answer when correctness turns on entities the user supplies — you give up most of the savings but you can never be wrong, whereas semantic buys you the paraphrase traffic at the cost of a new correctness surface. For invalidation, run both: versioned keys for correctness since they cost nothing at read time, and a TTL as the backstop for the version bump somebody forgot. And the last honest question is whether you sample hits against a fresh call to get a real false-hit rate — it costs you a slice of the savings, but skip it and you won't know your error rate until an incident tells you.

---

## 12. What good looks like: metrics, deployment checklist, and the interview questions that test for it

**Host:** So if I'm standing in front of a dashboard trying to decide whether this thing is healthy, what actually earns a place on it — not hit rate, since we've spent this whole episode complicating that one?

**Guest:** False-hit rate from sampling is the one metric here that doesn't come for free from the cache's own logs — you have to manufacture it by re-running a slice of hits against a fresh model call, and it's the number the whole design turns on. Alongside it you want hit rate split by tier, the distribution of similarity scores on hits rather than the mean, miss reasons broken out by scope-versus-threshold-versus-expiry, hit rate crashing to zero right after a prompt bump, and the age distribution of what's being served. Each one is a different way of catching the same failure before a user does — a mean of 0.94 hides the cluster sitting just above threshold, and a version bump that doesn't zero out the hit rate means the version isn't actually in the key.

**Host:** And if someone's interviewing for a role where they'd own this, what question actually separates the person who's built one from the person who's read about one?

**Guest:** Ask what threshold eliminates both false hits and missed paraphrases, and the right answer is none, because the populations are inverted. And ask whether their eval suite runs through the cache — because if it does, it's grading the cache, not the model, and that's the same blind spot as the false-hit question wearing a different hat.
