### 1. The number that isn't a decision

**Host:** So let's start with the situation basically every AI team is living in right now. Someone tweaks a prompt, swaps a model, changes a retrieval strategy, and they run it through an eval harness, and out pops something like eighty-four percent going to eighty-eight percent. And the instinct is to treat that as good news.

**Guest:** Right, and that instinct is exactly the trap. Eighty-four to eighty-eight isn't a decision, it's just two numbers sitting next to each other. Whether that four-point jump means the change actually helped, or it's just noise from which examples happened to be in the set, or it's even hiding a real regression underneath — you literally cannot tell from the numbers alone, especially at the dataset sizes most teams are actually running.

**Host:** So the platform did its job, technically — it produced a score — but it never answered the question anyone actually cared about, which is 'should I ship this.' What has to be true for that number to actually mean something?

**Guest:** Three things, and each one can fail without anyone noticing. The grader has to be capable of marking something wrong, otherwise a broken system and a working one look identical. The dataset has to be big enough to even see the size of improvement you're claiming, since small deltas are invisible below a certain scale. And the dataset has to be checked against actual correctness, not just against what the system itself produced last time — otherwise you're just measuring agreement with your own past mistakes.

### 2. Three conditions that fail silently

**Host:** So walk me through why these three things fail silently. If a grader can't fail, what does that actually look like in practice — is it obviously broken, or does it just look fine on the dashboard?

**Guest:** It looks completely fine, that's the problem. You'll see a harness that scores everything highly because the grading prompt is too lenient, or the rubric only checks for surface features like 'did it mention the right keyword.' Nobody gets an error message. You just get a green number every single time, for a broken system and a good one alike, and the dashboard never tells you which one you're looking at.

**Host:** And the same goes for dataset size and the correctness check — there's no alarm bell, just a number that quietly stops meaning anything.

**Guest:** Exactly. At the dataset sizes teams actually use, a set will happily report a four-point swing and nobody can tell whether that swing is real signal or just noise. And if your 'ground truth' is just last month's model output, you're not measuring correctness at all — you're measuring how well the new system agrees with the old one's mistakes, which rewards consistency, not accuracy. All three failures produce a perfectly normal-looking number, which is exactly why they get missed.

### 3. Turning the conditions into a checklist

**Host:** So let's turn those three failure modes into something you can actually check for in a platform. If I hand you an eval system, what are the concrete boxes it needs to tick?

**Guest:** First, the grader itself has to pass a meta-test: feed it a deliberately broken system and it must score zero, feed it a perfect one and it must score a hundred. Then every comparison reports an interval, never a bare point estimate, and each set publishes its own smallest detectable delta so a claim can be checked against what that set can actually resolve. On top of that you want provenance per example — who verified this answer and against what — flaky examples named instead of averaged away, and a path to the model that skips the response cache entirely.

**Host:** That cache one is easy to miss — walk me through why bypassing it matters as much as the statistics do.

### 4. Why effect size squared breaks everyone's budget

**Host:** We'll get to the cache, but first I want to sit with a number you keep coming back to: effect size enters the sample-size calculation squared. Why does that one detail wreck so many teams' evaluation budgets?

**Guest:** Because it means intuition about cost is wrong by an order of magnitude. Halving the delta you want to detect more than quadruples the examples required — effect size enters the calculation squared. At an 85% baseline, going from a 5-point detectable delta to a 3-point one takes you from 683 examples to over 2,000. People plan evaluation sets like the relationship is linear, and it just isn't.

**Host:** So walk me through what that actually costs someone. If a team wants to catch a three-point improvement at an 85% baseline, what are they signing up for?

**Guest:** Roughly two thousand verified examples per arm — and that's the architecture's biggest line item, because model spend is examples times arms times repeats, and curation time scales the same way. Flip it around and the smallest-visible-delta table tells the uncomfortable truth: a 50-example set can only see a 20-point swing, so reporting '88%' without also reporting that resolution is how a four-point improvement gets treated as real when the set was structurally blind to it.

### 5. Anatomy of a false improvement: 84% to 88%

**Host:** So walk me through the canonical case, the one everybody's seen without realizing it: 84% goes to 88% on a 50-example set. On its face that's a win — where does it actually fall apart?

**Guest:** It falls apart the moment you compute the interval instead of just the point estimate. That four-point gain carries a 95% confidence interval running from about negative 9.6% to positive 17.6% — which means the exact same data is fully consistent with a ten-point regression. You didn't measure an improvement, you measured a number that improvement is compatible with, along with about a dozen other stories including 'this got worse.'

**Host:** And nobody reports the interval, they just report the 88 and move on.

**Guest:** Right, and that's how it becomes roadmap-worthy — someone screenshots '84 to 88,' it goes in a slide, and a quarter of engineering effort gets justified by four points that a 50-example set was never built to see in the first place. The set's own resolution floor at that baseline is roughly twenty points, so this measurement was noise dressed up as signal from the moment it was collected.

### 6. Undecidable is a verdict, not a shrug

**Host:** So that resolution-floor problem you just described — is that what forces the three-state design? Most people would just say the comparison returns true or false, significant or not.

**Guest:** Exactly that. Comparison dot is\_significant returns True, False, or None, and None isn't a bug, it's the honest answer when expected cell counts drop below about five — which is precisely the regime small eval sets live in. If you force that into False, you're not simplifying, you're lying, because False says 'no difference' and None says 'this set cannot tell,' and those two claims should never be acted on the same way.

**Host:** So collapsing them is the actual failure mode — not a rounding error, but a category error that kills the investigation before it starts.

**Guest:** Right, because False closes the case — engineers move on, nothing to see here. None should open a case, but about the eval set itself: why can't this instrument resolve a question this important, and what would it take to fix that. Undecidable is a verdict that points the investigation somewhere; false is a verdict that ends it.

### 7. The meta-test: can your eval even fail?

**Host:** So before we trust any of these numbers — the effect sizes, the confidence intervals, all of it — is there a test underneath all of them, something that checks the checker itself?

**Guest:** There's exactly one test that has to exist before any other number means anything: feed the harness a system that's always wrong, and assert it scores zero. If that fails, every other result in the suite is unverified, because you have no proof the grader can distinguish wrong from right — it might just be returning correct on an exception and calling it a pass. The twin test asserts a perfect system scores 100%, because a harness that always fails is just as useless as one that never does; an eval that cannot fail, in either direction, is not an eval.

### 8. Graders are systems too — and need their own evaluation

**Host:** So the harness itself can pass that zero-and-hundred test and still lie to you, because the grader sitting inside it is broken in a different way. Walk me through the contains grader problem — you said it passes an output that says both things?

**Guest:** Right, a contains grader just checks whether the right answer appears as a substring, and verbose model output routinely states the correct answer and its opposite in the same response — hedging, showing both sides, restating the wrong premise before correcting it. The grader sees the right string, doesn't see that it's sitting next to its negation, and marks it correct. That's not an edge case, that's what a chatty model does by default, so a contains grader can pass exactly the kind of output that a careful reader would call wrong.

**Host:** And that's presumably why people reach for an LLM-as-judge instead — let a model read the whole thing and decide. But you're telling me that's the least trustworthy piece in the entire pipeline?

**Guest:** It's the least verifiable component, full stop, because it needs its own evaluation against its own verified set before its verdicts mean anything — you can't just trust a judge model because it sounds reasonable. And there's a sharper problem underneath that: the judge is a model reading text that the system under test produced, which means it's an injection surface. If a graded output can address the judge directly, the system under test can influence its own score, and now you don't have an evaluation, you have a conversation the candidate is winning.

### 9. When the dataset measures agreement with itself

**Host:** So beyond graders lying, there's a problem with the dataset itself. You mentioned earlier that some eval sets grow from production output — walk me through how that goes wrong.

**Guest:** Say you don't have a human-verified answer for some tricky input, so you take what the system produced last quarter and label that the expected answer. Fine, once. But do that repeatedly and the set stops measuring correctness — it starts measuring whether the system still agrees with its earlier self. If the system was wrong back then, it'll be wrong forever and score perfectly, because the wrong answer is now the target it's being compared against.

**Host:** And the accuracy number gives no hint that's happening.

**Guest:** None. It looks entirely normal. That's why provenance can't be an assumption you carry in your head about how the set was built — it has to be a recorded field on every example, human-verified versus captured-from-output, so you can report what fraction of your 'accuracy' is actually measuring agreement with a possibly-broken past rather than correctness.

### 10. Naming instability instead of averaging it away

**Host:** So say you run each example five times to smooth out noise, and average the results. That sounds responsible — where does it go wrong?

**Guest:** It goes wrong because averaging makes two very different problems look identical. An example that passes half the time and one that deterministically gets half credit both show up as 50% — but one is a coin flip you need to fix or throw out, and the other is a stable partial-match you can reason about. The fix is to name the flaky ones individually — flag which examples are unstable across repeats — so someone can actually look at them, instead of burying that signal inside a plausible-looking average that never tells you which examples are the problem.

### 11. The cache hiding underneath the eval

**Host:** You mentioned the cache in passing a minute ago, and I want to stop on it, because it sounds like the eval suite can fail in a way that has nothing to do with any of the statistical problems we've covered. What's going on there?

**Guest:** Right, this is a completely different failure class. If your eval suite calls the model through the same path production traffic uses, and that path has a semantic cache sitting in front of the model, your suite isn't measuring the model — it's measuring whatever the cache decided to return. So you ship a model upgrade, run your eval, and the score is identical to last time. That reads as 'the upgrade did nothing,' but what actually happened is a bunch of your eval examples hit cached responses from the old model and never reached the new one at all.

**Host:** So the eval passes, the dashboard looks stable, and there's just no signal in it at all.

**Guest:** None — and it's worse than a neutral non-signal, because it actively looks like confirmation that nothing broke. That's why bypass can't be an option you remember to set; it has to be the default for anything calling itself an evaluation. Every other fix we've talked about — the intervals, the meta-test, naming instability — assumes the number you're looking at came from the system you think it did, and the cache is the one place that assumption can be false without a single line of your eval code being wrong.

### 12. What it costs, who can touch it, and what to watch

**Host:** Let's put a number on all of this, because I think people hear 'run more examples' and don't feel the actual cost. If you want to detect a three-point improvement at an 85% baseline, what are you signing up for?

**Guest:** Roughly two thousand verified examples per arm, and that's the platform's largest line item, full stop. Cost scales with examples times arms times repeats, and the part that doesn't parallelize is curation — a human has to verify each one, and that time doesn't compress no matter how much compute you throw at it. The inverse number is the one that should sit on every dashboard: at n=500 your set can't see anything smaller than about six points, at n=1000 it's four and a half. Report the accuracy without that number and you've invited the exact error this whole architecture exists to prevent.

**Host:** And then there's the part nobody puts in the architecture diagram — who's allowed to touch the dataset itself.

**Guest:** Right, because that dataset is a leak surface — it's curated, high-value, often real customer data sitting in a system built for convenience, not confidentiality. Worse, if it ever reaches a training corpus, contamination gives you no warning, just scores that quietly improve. So access to change an expected answer is access to change the verdict, which means edit access needs review, not just write permission for whoever's running an experiment — and if you're using a judge grader, remember it's an injection surface too, since a graded output that can address the judge can influence its own score. Watch four things going forward and you'll catch most of what we've covered today before it costs you: smallest detectable delta, undecidable rate, provenance coverage, and grader disagreement.

### Not covered

The planner wanted these and found nothing in the source to support them:

- Vendor-specific pricing or throughput benchmarks for running LLM-as-judge graders at scale
- Guidance on choosing an embedding model for a semantic cache used alongside this evaluation platform
