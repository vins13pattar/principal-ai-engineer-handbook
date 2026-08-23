# Module 5: Agent Engineering — The Loop That Has to Behave Itself

_An agent is just a control loop wrapped around a non-deterministic decision step — every hard problem in this module (runaway execution, side effects, permissions, partial failure) is a control-systems problem this handbook already has vocabulary for, now applied to a model's output instead of code you wrote._

- **Source:** [module:05-agent-engineering](/learn/modules/05-agent-engineering/)
- **Runtime:** 14:09 · 38 turns · 11 beats
- **Written by:** claude-sonnet-5 on 2026-08-22
- **Voices:** af_heart (host), am_michael (guest)

> Generated from the page above and spoken by a local text-to-speech model.
> Two synthetic voices, not a recorded conversation. Where this differs from
> the page, the page is correct.

---

## 1. An Agent Is Not a Smarter Model

**Host:** Okay, module five, agent engineering. And I want to start by killing a phrase, because I think it's actively getting in people's way. An agent is not a smarter model. That's not what we're building here.

**Guest:** Right, and I think that's the single most common misconception people bring into this. They think if the model gets good enough, it just becomes an agent on its own. But an agent is a control loop — observe, decide, act, observe again — and the model only owns one step of that, the deciding part. Everything else is structure you build around it.

**Host:** So when we say agent engineering is a discipline, we mean the discipline is really about that loop — making it safe, bounded, debuggable — not about coaxing more intelligence out of the model. And the twist is that every hard problem we're about to cover — runaway execution, side effects, permissions, partial failure — is just a control-systems problem this handbook already has words for, now sitting at the seam between what the model asks to do and what your system actually lets happen.

---

## 2. Inside the Loop: A Model That Requests, a System That Decides

**Host:** So let's get concrete about that seam. When the model decides to use a tool, what actually happens — it's not like it's reaching out and executing something on your machine, right?

**Guest:** Right, it never runs anything. It emits a structured request — a function name and some arguments — that matches a schema you gave it up front. Your system is the one that validates that request, decides whether it's even well-formed, and only then executes it and feeds the result back in as the next observation.

**Host:** So a hallucinated tool name or garbage arguments never even gets a chance to run — it just bounces back as an observation the model has to react to. That's a pretty clean trust boundary to design around.

---

## 3. Two Guards That Separate a Demo from a Production Loop

**Host:** Right, but the trust boundary isn't just about catching malformed calls — the diagram shows two actual guard components doing the load-bearing work here. What are they?

**Guest:** The first is a step or cost budget check, and it runs before every single decision, not just once at the start — without it enforced continuously, an agent isn't a reliability feature, it's just a resource-usage risk waiting to happen. The second is a permission and schema check sitting between the model's decision and actual execution, and that's the one people skip in demos: the model requesting a tool call is not the same thing as the system agreeing to run it.

---

## 4. Four Levers to Stop a Loop from Running Forever

**Host:** So the budget check runs continuously, fine — but what's actually in that check? You said step or cost, and I want to slow down on that, because it sounds like one thing and I suspect it's not.

**Guest:** It's four separate levers, and all four need to exist at once: a step budget capping total iterations, a cost budget capping estimated spend, a wall-clock timeout, and the model's own done-signal. Each one catches a runaway shape the others miss — a step budget catches an infinite loop of cheap tool calls, a cost budget catches a handful of very expensive calls that never trip a step count, and a wall-clock timeout catches a loop that's technically making progress but far too slowly to be useful. The done-signal is real too, it's just not sufficient on its own — relying on the model to know when to stop isn't a termination condition, it's a hope, so it rides alongside the other three rather than replacing them.

**Host:** And you'd said context growth needs its own budget separately from that — why isn't a wall-clock timeout enough to catch that too?

**Guest:** Because context growth is a cost and latency problem that compounds silently long before you'd hit a hard limit or a timeout — every loop iteration adds tokens to the running context, so cost and latency compound over a long task even if nothing's gone wrong. That's why summarizing or pruning older observations has to happen well before the context window's actual ceiling, not at it. And separately, per-step latency needs its own budget too, because one slow tool call can quietly eat the entire task's time allowance while every other check still looks green.

---

## 5. Plan-Then-Act vs. Interleaved Reasoning

**Host:** Let's talk about how the loop actually structures its thinking. There seem to be two schools here — have the model draw up a full plan before touching anything, or have it think and act one step at a time. Walk me through that split.

**Guest:** Right, so the first approach is plan-then-act: the model produces a complete sequence of steps upfront, and only then does execution start. That's great for review — a human can look at the whole plan before anything real happens, and it gives clearer visibility into what the agent intends to do. The trade-off is it's brittle: it's less adaptive when the plan doesn't survive contact with real tool results.

**Host:** And the alternative is the ReAct pattern you mentioned back when we were talking about the loop itself — reason, act, observe, repeat.

**Guest:** Exactly, that interleaving is what makes it adaptive — each step's reasoning incorporates the actual observation from the last action, so it responds to reality as it unfolds instead of assuming the plan still holds. The cost is reviewability: there's no fixed plan sitting there for a human to inspect before execution starts, because the plan is being generated one step at a time as it goes. Neither one wins outright — it's really a question of whether the task needs to be reviewable before it starts or adaptive while it's running.

---

## 6. Memory Isn't Just the Context Window

**Host:** Okay, next control-systems problem: memory. It's tempting to think the context window just is the agent's memory, but you're saying that's already a category error.

**Guest:** Right, the context window is short-term memory only — it's bounded, and every token in it costs money and latency on every single call, so an agent that treats it as the only memory either runs out of room on long tasks or pays to re-send the whole history every turn. Long-term memory is retrieval from an external store, something Module 8 goes deep on, and it's what lets the agent recall something from beyond what fits in context without carrying it in-window the whole time. Production agents need both — context for immediate continuity within the current step, retrieval for anything that has to persist beyond what fits or beyond what's affordable to keep re-sending.

---

## 7. The Bounded Agent Loop, in Code

**Host:** Let's make this concrete with actual code, because I think the two guards you described — the step budget and the permission check — sound abstract until you see where they live. Walk me through this BoundedAgentLoop.

**Guest:** Sure. The run method loops up to max\_steps times, calling decide with the observations so far, and if the model returns a final answer, you're done. But look at what happens on a tool call — it goes to an execute step, and every single failure path in there, an unknown tool name, a permission denial, a tool that literally throws an exception, all of them return a string observation instead of raising. Nothing crashes the loop.

**Host:** So a tool blowing up doesn't end the task, it just becomes another line of text the model reads on the next step. That's a deliberate design choice, not just error handling for its own sake.

**Guest:** Exactly, the model gets to see its own failures the same way it sees successes and react to them, maybe retry with different arguments, maybe try a different tool. And the permission check is the other guard made concrete — each tool carries a set of task types it's allowed to run for, checked with a plain if statement in code, not a suggestion in a prompt. If the task type isn't in that set, the tool never runs, full stop, no model judgment involved.

---

## 8. A Support Ticket, Including the Moment It Breaks

**Host:** Let's walk through an actual ticket so this stops being abstract. What does one clean iteration look like end to end?

**Guest:** The model gets a ticket with some error message, decides to call search\_kb with that error text, and the tool comes back with three matching articles as the observation. Now the model has real context, so on the next step it calls draft\_reply, pointing at one of those articles as the source. Two tool calls, each result fed back in before the next decision — nothing exotic, just the loop doing its job.

**Host:** Okay, now break it. What happens when draft\_reply actually fails?

**Guest:** Say the templating service is down and draft\_reply raises. That exception doesn't crash the task, it just becomes another observation — literally a string saying the tool failed and why — and the model sees that like it sees any other result. It might retry, it might escalate to a human tool instead, or it might burn through its step budget without resolving anything, and at that point the loop's own fallback fires: incomplete, step budget exhausted, handing off to a human. That's the whole point of the guard — a graceful, informative stop instead of a silent hang or the model hammering the same broken call forever.

---

## 9. Where Agents Actually Break

**Host:** So we've seen one failure mode up close. What does the fuller catalog look like — where do these loops actually go wrong in production?

**Guest:** Start with the boring one: no budget at all — that's the same step and cost cap we already covered as the fix. Then there's malformed tool calls — the model invents a tool that doesn't exist, or gets the arguments wrong, and if you dynamically dispatch on that unchecked output instead of validating against a schema first, you're executing garbage.

**Host:** And the side-effect one — that's got to be where Module 2 comes back, right? Ambiguous timeouts on a real action like sending an email or charging a card.

**Guest:** Exactly the same problem, just with a model in the loop instead of a retry policy — the tool call times out, the agent can't tell if it landed, and if it retries blind, that email or charge fires twice. Same fix too: idempotency keys, claimed before the action runs. And there's one more subtler one — a model can shrug off a failed step and hand you a confident answer built on top of it instead of surfacing that something never actually succeeded.

---

## 10. Guardrails and the Autonomy Trade-off

**Host:** So beyond retries and idempotency, there's a whole other category of failure that's about permissions and trust. What does that look like in practice?

**Guest:** It starts with least-privilege tool scoping — the allowed for task types check we already wired into the loop isn't just a routing detail, it's the concrete mechanism that keeps a tool scoped to exactly what the task needs, rather than being an afterthought bolted onto a tool that can already do more. And anything irreversible — sending an email, spending money, deleting data — needs a mandatory human approval gate, full stop, not a config flag someone forgot to set. Code execution tools get sandboxed completely, no host filesystem, no network, no ambient credentials beyond exactly what that task needs.

**Host:** And there's a sneakier injection risk too, right — not through the prompt itself?

**Guest:** Right, it comes in through tool outputs — a fetched webpage or a document can contain text that reads like an instruction, and the model's next loop iteration might just follow it. It's the same prompt injection problem Module 4 covers, just arriving as an observation instead of the initial prompt, which is exactly why it's easy to miss. That's the security side — the other half is a real trade-off: full autonomy is fast and needs no human around, but every action fires without a check, so it only belongs on low-risk reversible stuff, while approval gates buy you a real backstop at the cost of latency and someone having to be there. Same tension shows up in tool-set shape — one agent with every tool is simple to operate but gets slower and dumber as its context fills with tool descriptions, while multiple narrow agents scale better but now you need the ownership and lease coordination from Module 2 to keep them from stepping on each other.

---

## 11. From Theory to Enforcement: The Policy-Gated Tool Runtime

**Host:** So if someone wants to see all of this stop being theory and start being code, that's the policy-gated tool runtime lab. Walk me through what's actually enforced there.

**Guest:** It's the pipeline version of everything we just talked about, in a specific order for a reason: scope check first because it's cheapest and shouldn't leak that a tool even exists to someone with no grant on it, then schema validation so a malformed call can't burn a well-behaved caller's rate limit, then the limiter itself keyed per tenant and per tool so a search and a fund transfer never share a budget, and only last the approval gate — because that's the one stage that blocks on a human, and you don't pay that latency for a call that was going to fail anyway. And it logs denials just as carefully as successes, because a tool nobody ever approves needs to be visible in the audit trail, not buried.

**Host:** And the extension exercise ties it straight back to Module 2, right — idempotency keys on the tool call itself?

**Guest:** Exactly — you add an idempotency key to the ToolCall, wire it through the same IdempotentTaskStore pattern from the distributed systems module, and write a test that fires the same call twice and proves the handler only actually runs once. That's the whole point of this module in miniature: an agent loop is a control system, and once a step can retry, every side-effecting action needs the same durability guarantee a distributed job would need. Get that right and you've genuinely built the thing, not just talked about it — which is as good a place as any to leave this module.
