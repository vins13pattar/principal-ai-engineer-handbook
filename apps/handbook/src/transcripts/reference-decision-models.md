### 1. Not generation: what a decision model is

**Host:** So we spent the last year talking about generation — bigger context windows, better reasoning traces, agents that write their own next steps. But there's a whole other half of production AI that doesn't generate anything at all, and today we're digging into it: decision models. To start simple — what is a decision model, and why isn't it just a smaller LLM?

**Guest:** The cleanest way to see it is against what it replaces. If you want an LLM to classify a ticket or decide whether to escalate an email, you send it text, it writes tokens out one at a time, and then you parse that text back into a yes or a label. A decision model skips both ends of that. You give it a piece of state — a ticket, an email, a JSON document — plus a named, typed question, and it reads that input once, a single forward pass, no decoding loop, and scores every answer you allowed. What comes back isn't text to interpret, it's a probability distribution over exactly the answers you defined. It literally cannot say something outside that set.

**Host:** So instead of text-in, text-out, it's state-in, distribution-out. What do the questions themselves look like — is it always just yes or no?

**Guest:** There are three shapes. A noul is yes-or-no and gives you a single probability. A choice is one of a labelled set — think routing categories — and you get the top pick plus a probability per option, not just the winner. And a score is a position on an ordered rubric, like a one-to-five severity scale, except it's probability-weighted so the answer can land between levels instead of snapping to one. And that's really the whole premise of putting a model in a routing or gating path in the first place.

### 2. Four products in sixteen days

**Host:** So this didn't trickle out — you said it landed like a landmark. What actually happened in September?

**Guest:** Sixteen days, four products. TypeSafe AI's Jev came first, September 15th, early access, closed weights, hosted — but it set the API shape everyone else used. Three days later Convai released Laya, Apache-2.0, a 421M open encoder that scores options at mask tokens. Then OpenAI announced a Decisions API at DevDay on the 29th, in limited preview, built on GPT-6 Luna, with no public reference yet. And October 1st, Cloudflare ships Clef and Clef-flash, 27B and 9B, frozen Qwen backbones, images accepted, and explicitly Jev-API compatible — meaning a Jev client can switch by changing the endpoint, though the probabilities that come back are a different model's. Four teams, one shared request shape, inside two and a half weeks.

### 3. The numbers, and who's holding the stopwatch

**Host:** Okay, so let's actually put the numbers next to each other — Clef at 209 milliseconds median, Clef-flash at 39, Jev at 524. OpenAI's Decisions API supposedly at 150 milliseconds against a 1.6 second baseline call. Who's actually standing behind these?

**Guest:** That's the thing you have to ask before you believe any of them. The Clef numbers are Cloudflare's own benchmark, comparing itself to Jev — a competitor it has every incentive to beat. The OpenAI figure isn't even from documentation, it's from a DevDay slide, and the baseline it's compared against is OpenAI's own model. Laya's 39.5 milliseconds per question is Convai measuring Convai on a T4. There's no independent benchmark in this entire category yet — every number is a vendor grading its own homework, or grading a rival's without the rival's cooperation.

**Host:** And the one that actually stopped me — Laya's zero-shot accuracy is 0.362, which is below its own 0.461 majority-class baseline. That's in Convai's own model card.

**Guest:** Right, and they say it plainly — zero-shot, meaning before you fine-tune it on your own data, Laya does worse than just always guessing the most common answer. It only gets to 0.766 after fine-tuning, which edges out Jev's reported 0.727, except that Jev number is third-party and Convai never reproduced it themselves. And there's a second landmine in the same card: accuracy falls off a cliff as option count rises, down to 0.425 on a 77-label set. So a choice field with five options and a choice field with two hundred options are not the same product, even though the API will happily accept both and hand you back a number that looks exactly as confident either way.

### 4. Confidence is not calibration

**Host:** Okay, so that number TypeSafe hands back with every answer, the confidence score — people are going to read that as 'how sure am I this is right.' Is that what it is?

**Guest:** No, and this is the trap the whole episode's been circling. Confidence is TypeSafe's own word for how concentrated the distribution is — one if all the mass sits on a single option, zero if it's spread evenly across the set. That's a statement about the shape of the guess, not about whether the guess is true. A model can put 0.98 on the wrong answer and the number will look exactly as reassuring as 0.98 on the right one.

**Host:** So concentrated and correct are just two different axes, and nothing in the API tells you which one you're looking at.

**Guest:** Right, and Laya's own card gives you the receipt — expected calibration error of 0.466 out of the box, meaning the gap between stated confidence and actual accuracy is enormous before you fit it, and it only comes down to 0.081 after temperature fitting, which is a step you have to do yourself, on your own traffic. Pair that with 'cannot hallucinate' — all that phrase actually guarantees is that the output is a valid member of your label set. It can still be the wrong member, stated with high confidence, in a form that sailed past every check a text output would have tripped.

### 5. The escalation trap decision models make possible — and dangerous

**Host:** So this is the thing the probability actually buys you — escalate to the expensive model when the cheap one's confidence drops. That sounds like exactly the right use for a calibrated number. Where's the trap?

**Guest:** The trap is in the metric everyone reaches for first. On a 200-task run, even with a perfect confidence signal — low exactly when the answer's wrong, the best case any policy could hit — escalation took accuracy from 166 correct to 197, which is genuinely good. But cost per correct answer went from 0.00024 to 0.00279, eleven times worse, and that holds at every price ratio we tried, 75x down to 2x. It's not a tuning failure, it's arithmetic: the cheap model is already right most of the time, so it's generating a huge pile of cheap correct answers, and escalation only adds a thin layer of expensive ones on top. Average cost per correct can only go up, even when the policy is working exactly as designed.

**Host:** So if that metric can't tell a working policy from a broken one, what do you actually look at before you turn escalation on?

**Guest:** Marginal cost per rescued answer — escalated cost minus baseline cost, divided by the extra correct answers escalation bought you. At a 2x price gap that came out to about 0.00044 per rescued answer; at 75x it's about 0.016. Whether that's worth paying is a product question about what a wrong answer costs you, and it depends on a confidence threshold you fit on your own traffic, not a number the vendor hands you or a benchmark that was never running your workload.

### 6. Where it actually sits in a production stack

**Host:** So zoom out for a second — where does this actually live in a stack someone's building today? It's not instead of rules, and not instead of an LLM.

**Guest:** It's the middle tier. Deterministic rules where the answer is certain, a decision model where the question is bounded — which queue, in scope or not, call a tool or answer — and an LLM where it's genuinely open-ended. And the exact same shape shows up inside an agent: is this the right next action, does this output clear the guardrail before it goes out. That's still a bounded decision with a probability attached, it's just the agent asking instead of a router.

**Host:** And the discipline underneath both of those is the same thing we've spent this whole episode on.

**Guest:** Exactly the same thing. Because the failure mode here was never going to announce itself. It doesn't throw an error. It just hands you a wrong answer dressed up as a sure one.

### Not covered

The planner wanted these and found nothing in the source to support them:

- A head-to-head independent benchmark comparing Jev, Laya, Clef, and the Decisions API on the same task set
- Details of the OpenAI Decisions API's request schema, pricing, or rate limits
- Real-world case study of a company switching from Jev to Clef and what broke
