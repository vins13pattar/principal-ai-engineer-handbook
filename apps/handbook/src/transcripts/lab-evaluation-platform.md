### 1. The Math Nobody Runs Before Celebrating a Number

**Host:** So we've all seen the slide: baseline eighty-four percent, new prompt eighty-eight percent, team high-fives, ship it. I want to spend this whole episode on why that slide can be lying to you, using nothing but a fifty-example eval set. Where does the lie actually live?

**Guest:** It lives in the confidence interval nobody computed. Run the math on that eighty-four to eighty-eight jump on fifty examples and the ninety-five percent interval is something like negative nine point six to positive seventeen point six percent. Zero is comfortably inside that range, which means the same data is equally consistent with a ten-point regression as it is with a four-point win.

**Host:** So the number on the dashboard and its exact opposite are both plausible readings of the same test. What's the actual floor, then — how big does a set need to be before a four-point move even means anything, and why does it get expensive so fast?

**Guest:** At an eighty-five percent baseline, fifty examples can't resolve anything smaller than about twenty points — you'd need somewhere near two thousand examples just to reliably see a three-point delta. And the scaling is brutal because effect size enters the sample-size formula squared, so halving the delta you care about roughly quadruples the data you need — actually closer to 4.95x, since variance shrinks as the rate climbs toward one and makes the coarse measurement disproportionately cheap by comparison.

### 2. Teaching the Harness to Say 'I Don't Know'

**Host:** So if fifty examples usually can't resolve anything meaningful, what does the significance function actually return in that regime? I'm guessing it doesn't just say false.

**Guest:** Right, and this is the part teams miss — the significance check has three states, not two: True, False, or None. None fires when expected cell counts drop below about five, which is exactly where small eval sets live, and it means the approximation simply isn't usable. If you collapse that into False, you're telling someone 'no difference' when the honest answer is 'this set cannot tell,' and those two conclusions get acted on completely differently — one closes the investigation, the other should open one into whether your eval set is even fit for purpose.

**Host:** That's a sharp distinction to bake into code rather than leave as a caveat in a README. But how do you know the harness itself is trustworthy enough to even return that None correctly?

**Guest:** That's what the meta-test is for — you deliberately feed the harness a system that's always wrong and assert it scores exactly 0%, plus the mirror case, a perfect system that must score 100%. If the always-wrong system doesn't land at zero, nothing else in the suite means anything, because an eval that can't fail isn't an eval at all. It's the cheapest possible check, and almost nobody runs it before trusting their scoreboard.

### 3. Where Eval Sets Quietly Lie, and What to Ask About Yours

**Host:** Okay, so beyond the meta-test, what actually goes wrong inside a real suite that a passing accuracy number won't show you? Give me the sneaky ones.

**Guest:** Three come up constantly. A contains-grader will happily pass an answer that states the right fact and its opposite in the same paragraph, because the substring is technically there — verbose model output does this all the time. Flaky examples get hidden the same way: you average across repeats and get a smooth, confident-looking number instead of naming which specific examples are unstable and fixing them. And the quiet one — if your eval set was built from the system's own past outputs, you're measuring agreement with a former self, not correctness, and it will never catch a regression that was baked in from day one. None of that shows up in the score. You have to go looking for it.

**Host:** So if I'm sitting across from a team and I want to actually pressure-test their scoreboard instead of just nodding at it, what do I ask?

**Guest:** Four questions, in order. What's the smallest delta this eval set can even detect — if nobody knows, nobody knows whether last quarter's win was real. Are you pairing the tests, since running both arms on the same examples makes something like McNemar's far more powerful, though it's worth checking whether that pairing would've actually changed any decision. If you're testing five prompt variants against one baseline, are you correcting for multiple comparisons, because that's five chances to get lucky and it raises the sample size you actually need. And last — who verified the golden answers, because a dataset that grew out of production output is quietly measuring consistency with itself, not truth. Ask those four before you trust any number on a dashboard.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A worked example of McNemar's paired test actually reducing the required sample size
- How the numbers would shift with a real (non-toy) embedding or scoring model
- Cost/latency tradeoffs of running this harness continuously vs. on a sampled cadence, per Module 4/12's observability framing
