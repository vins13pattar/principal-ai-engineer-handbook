import type { VideoScript } from "./types.ts";

/**
 * Module 5 — Agent Engineering. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/05-agent-engineering.mdx and its agent-loop diagram.
 */
export const agentEngineering: VideoScript = {
  slug: "05-agent-engineering",
  module: "05",
  plate: "PLATE 05 · AGENT ENGINEERING",
  chapter: "Agent Engineering",
  title: "Agent engineering: the model never executes anything",
  youtube: {
    titleSuffix: "Agent engineering: the model never executes anything",
    summary:
      "An agent is a control loop, not a smarter model. The budgets that bound it, the permission and schema check between a model's request and your system's action, and the failure modes that follow. Module 5 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 5 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/05-agent-engineering/",
      },
      {
        label: "Lab: Policy-Gated Tool Runtime",
        url: "https://handbook.vinodspattar.in/build/labs/policy-gated-tool-runtime/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "AI agents",
      "agent loop",
      "tool calling",
      "ReAct",
      "guardrails",
      "idempotency",
      "AI engineering",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "An agent that never stops",
      narration:
        "An agent is handed a task it cannot actually complete. With no enforced budget, it loops, calling the model and a tool again and again, consuming model calls and their cost the whole time. The model should know when to stop is not a mitigation. With a budget checked before every decision, the same loop ends in a graceful hand off to a human.",
      map: {
        places: [
          { id: "model", label: ["Model decides"], x: 0, y: 226, w: 280 },
          { id: "tool", label: ["Tool call"], x: 600, y: 70, w: 280 },
          { id: "budget", label: ["Budget check"], x: 600, y: 384, w: 280, beat: 2 },
          { id: "human", label: ["Hand off", "to a human"], x: 1200, y: 384, w: 300, beat: 2 },
        ],
        links: [
          { from: "model", to: "tool", arrow: "both", beat: 0 },
          { from: "model", to: "budget", arrow: "end", beat: 2 },
          { from: "budget", to: "human", arrow: "end", beat: 2 },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [["model", "tool", "model", "tool"]],
          results: ["stall"],
          marks: ["no end, cost keeps adding up"],
        },
        { beat: 2, paths: [["model", "budget", "human"]], results: ["ok"] },
      ],
      captions: [
        "A task the agent cannot finish, and no enforced budget.",
        "It keeps calling the model and the tool, and the cost keeps adding up.",
        "A budget checked before every decision ends it with a hand off.",
      ],
      beats: [
        { at: 0 },
        { at: 0.37, cue: "consuming model calls and their cost" },
        { at: 0.67, cue: "With a budget checked before every decision" },
      ],
    },
    {
      id: "seam",
      kind: "lanes",
      headline: "The model requests. Your system decides.",
      narration:
        "An agent is not a smarter model. It is a control loop: observe the context, decide the next action, act, observe the result, and repeat until the task finishes or a limit is reached. The decide step is a model call instead of deterministic code, so every other step has to compensate with structure the model does not provide. And the model never executes anything. A tool call is a structured request, a function name and arguments. Your system validates it, executes it, and feeds the result back as the next observation. Every trust and safety boundary sits at that seam, between the model's request to act and your system's decision to act.",
      lanes: [
        {
          title: "What the model does",
          subtitle: ["Emits a structured request. Nothing runs."],
          chain: ["Observe context", "Decide", "Emit a tool call"],
        },
        {
          title: "What your system does",
          subtitle: ["Validates, executes, and feeds the result back."],
          chain: ["Validate", "Execute", "Append observation"],
          gate: { after: 0, label: "permission and schema check" },
        },
      ],
      takeaway: "The boundary sits between the request to act and the decision to act.",
      beats: [
        { at: 0.0, cue: "An agent is not a smarter model" },
        { at: 0.66, cue: "Your system validates it" },
        { at: 0.79, cue: "Every trust and safety boundary" },
      ],
    },
    {
      id: "loop",
      kind: "diagram",
      headline: "A bounded control loop",
      narration:
        "Here is the loop with its guards. A task is received, and before every decision, not just the first, the loop asks whether step or cost budget remains. If not, it stops and hands off to a human, marked incomplete. If so, the model decides to call a tool, ask a question, or finish. A final answer ends the loop. A tool call must first pass a permission and schema check. If it fails, a rejection is appended to the context as an error observation the model can react to. If it passes, the tool executes, sandboxed, with an idempotency key attached. Either way an observation is appended, and the loop returns to the budget check.",
      layout: "05-agent-engineering.agent-loop",
      legend: [
        { kind: "place", label: "step" },
        { kind: "route", label: "path taken" },
      ],
      steps: [
        { at: 0, show: ["Start", "Budget", "e1"], focus: ["Start", "Budget", "e1"] },
        {
          at: 0.23,
          cue: "If not, it stops",
          show: ["Handoff", "e2"],
          focus: ["Budget", "Handoff", "e2"],
        },
        {
          at: 0.33,
          cue: "If so, the model decides",
          show: ["Decide", "e3"],
          focus: ["Budget", "Decide", "e3"],
        },
        {
          at: 0.45,
          cue: "A final answer ends",
          show: ["Done", "e4"],
          focus: ["Decide", "Done", "e4"],
        },
        {
          at: 0.53,
          cue: "must first pass a permission",
          show: ["Perm", "e5"],
          focus: ["Decide", "Perm", "e5"],
        },
        { at: 0.59, cue: "If it fails", show: ["Reject", "e6"], focus: ["Perm", "Reject", "e6"] },
        { at: 0.76, cue: "If it passes", show: ["Exec", "e7"], focus: ["Perm", "Exec", "e7"] },
        {
          at: 0.86,
          cue: "Either way an observation",
          show: ["Observe", "e8", "e9", "e10"],
          focus: ["Observe", "Budget", "e8", "e9", "e10"],
        },
      ],
    },
    {
      id: "code",
      kind: "anatomy",
      headline: "The two guards, in code",
      narration:
        "The two guards, in code. The loop runs for at most max steps. Each iteration asks the decide function for a step, and a final answer returns. Otherwise the tool call goes through execute, and when the budget runs out the loop returns an incomplete result that hands off to a human. Execute is where the permission boundary lives. An unknown tool, a tool not permitted for this task type, or a tool that raises, all return a string observation rather than raising out of the loop. That is deliberate. The model sees and reacts to failures the way it sees successes, instead of the whole task crashing, and the permission set is enforced in code, not left to the model's judgment.",
      lines: [
        { text: "for _ in range(self._max_steps):", group: "route" },
        { text: "    step = await decide(observations)", group: "plain" },
        { text: '    if step.kind == "final_answer": return ...', group: "plain" },
        { text: "    observations.append(await self._execute(...))", group: "plain" },
        { text: 'return "incomplete: step budget exhausted..."', group: "route" },
        { text: "", group: "plain" },
        { text: "if task_type not in tool.allowed_for_task_types:", group: "meta" },
        { text: '    return f"error: tool not permitted"', group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "A hard step budget",
          body: "When it runs out, the loop hands off to a human instead of hanging.",
        },
        {
          group: "meta",
          title: "Failures become observations",
          body: "Unknown tool, denied tool, raised error: the model sees it and reacts.",
        },
      ],
      beats: [
        { at: 0.04, cue: "The loop runs for at most" },
        { at: 0.41, cue: "Execute is where the permission boundary lives" },
      ],
    },
    {
      id: "termination",
      kind: "axis",
      headline: "Four levers, all at once",
      narration:
        "Four levers keep a loop from running forever. A step budget, the maximum number of iterations. A cost budget, the maximum estimated spend. A wall-clock timeout. And an explicit done signal the model can emit. All four should exist at once, and relying on the model to know when to stop is not a termination condition. It is a hope. Each catches a different runaway. A step budget catches infinite loops even when each call is cheap. A cost budget catches a few very expensive calls a step budget would not flag. A timeout catches a loop that is making progress, but too slowly to be useful. All are checked before every decision, with a graceful hand off to a human.",
      ends: ["enforced from outside", "signalled by the model"],
      stations: [
        {
          name: "Step budget",
          line: "Maximum loop iterations",
          detail: "Catches infinite loops, even cheap ones",
        },
        {
          name: "Cost budget",
          line: "Maximum estimated spend",
          detail: "Catches a few very expensive calls",
        },
        {
          name: "Wall-clock timeout",
          line: "Maximum elapsed time",
          detail: "Catches progress that is too slow",
        },
        {
          name: "Done signal",
          line: "The model says it is finished",
          detail: "Alone, it is a hope",
        },
      ],
      beats: [
        { at: 0.06, cue: "A step budget, the maximum" },
        { at: 0.12, cue: "A cost budget, the maximum" },
        { at: 0.18, cue: "A wall-clock timeout" },
        { at: 0.21, cue: "And an explicit done signal" },
      ],
    },
    {
      id: "planning",
      kind: "lanes",
      headline: "Plan first, or plan as you go",
      narration:
        "Planning style is a trade-off. A full upfront plan is easier to review before execution starts and shows what the agent intends to do, but it is less adaptive when the plan does not survive contact with real tool results. Interleaved planning, the ReAct pattern, reasons about the next step, acts, observes and reasons again. It adapts step by step, but there is no fixed plan a human can review before anything happens. Neither is strictly better. Choose by how reviewable the task must be before it starts, against how much it must adapt mid-flight.",
      lanes: [
        {
          title: "Upfront plan",
          subtitle: ["Reviewable first. Less adaptive."],
          chain: ["Plan everything", "Human review", "Execute step by step"],
        },
        {
          title: "Interleaved, ReAct",
          subtitle: ["Adaptive. No fixed plan to review."],
          chain: ["Reason", "Act", "Observe, reason again"],
        },
      ],
      takeaway: "Reviewable ahead of time, or adaptive mid-flight.",
      beats: [
        { at: 0.05, cue: "A full upfront plan" },
        { at: 0.41, cue: "Interleaved planning" },
        { at: 0.74, cue: "Neither is strictly better" },
      ],
    },
    {
      id: "autonomy",
      kind: "lanes",
      headline: "Autonomy against an approval gate",
      narration:
        "Autonomy is the other trade-off. Full autonomy is faster and needs no human to be available, but every action executes without a check. That suits low-risk, easily reversible actions. A human approval gate before high-risk or irreversible actions, sending an email, spending money, deleting data, adds latency and needs a person available. In exchange it is a real safety backstop the loop cannot provide itself. In security terms, the gate is a hard requirement for irreversible actions, not a configurable nicety. Scope each tool to exactly what the task needs, and sandbox any code execution completely.",
      lanes: [
        {
          title: "Full autonomy",
          subtitle: ["Fast. For low-risk, easily reversible actions."],
          chain: ["Decide", "Execute", "No check"],
        },
        {
          title: "Approval gate",
          subtitle: ["Adds latency. For email, spending and deleting."],
          chain: ["Decide", "Human approves", "Execute"],
          tone: "fault",
        },
      ],
      takeaway: "Irreversible actions get a human gate.",
      beats: [
        { at: 0.05, cue: "Full autonomy is faster" },
        { at: 0.3, cue: "A human approval gate" },
        { at: 0.67, cue: "In security terms" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failure modes. Runaway loops with no enforced budget: the model should know when to stop is not a mitigation. Tool call hallucination: a tool that does not exist, or arguments that do not match the schema, so validate every call before execution and never dispatch dynamically on unchecked model output. Side-effecting calls retried without idempotency: the ambiguous timeout from Module 2 again, where a retry can run the side effect twice. Context window overflow: early context silently truncated, with no error, just behavior that looks like forgetting. And confident progression past a failed step. A model that treats a failure as a minor setback can build a confident final answer on a step that never succeeded.",
      map: {
        places: [
          { id: "budget", label: ["Loop budget"], x: 0, y: 226, w: 250 },
          { id: "decision", label: ["Model decision"], x: 369, y: 226, w: 250 },
          { id: "exec", label: ["Tool execution"], x: 738, y: 226, w: 250 },
          { id: "context", label: ["Context window"], x: 1107, y: 226, w: 250 },
          { id: "answer", label: ["Final answer"], x: 1476, y: 226, w: 250 },
        ],
        links: [
          { from: "budget", to: "decision", arrow: "end" },
          { from: "decision", to: "exec", arrow: "end" },
          { from: "exec", to: "context", arrow: "end" },
          { from: "context", to: "answer", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "budget",
          title: "Runaway loops",
          body: "No enforced budget. Hoping the model stops is not a mitigation.",
        },
        {
          at: "decision",
          title: "Tool call hallucination",
          body: "A tool that does not exist, or bad arguments. Validate before execution.",
        },
        {
          at: "exec",
          title: "Retried side effects",
          body: "An ambiguous failure plus a retry runs the side effect twice.",
        },
        {
          at: "context",
          title: "Context window overflow",
          body: "Early context is truncated silently. It looks like forgetting.",
        },
        {
          at: "answer",
          title: "Progress past a failed step",
          body: "A confident answer built on a step that never succeeded.",
        },
      ],
      beats: [
        { at: 0.02, cue: "Runaway loops" },
        { at: 0.16, cue: "Tool call hallucination" },
        { at: 0.42, cue: "Side-effecting calls retried" },
        { at: 0.6, cue: "Context window overflow" },
        { at: 0.73, cue: "And confident progression" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. One: an agent is a bounded control loop, with step, cost and time budgets checked before every decision. Two: the model requests and your system decides, so validate, permission and sandbox every tool call, and turn failures into observations. Three: any tool with a side effect needs an idempotency key, the Module 2 pattern. To go further, build the Policy-Gated Tool Runtime lab. Links are in the description.",
      points: [
        {
          statement: "A bounded loop, not a smarter model",
          support: "Budgets checked before every decision, with a hand off to a human.",
          glyph: "loop",
        },
        {
          statement: "The model requests, your system decides",
          support: "Validate, scope and sandbox every call. Failures become observations.",
          glyph: "gate",
        },
        {
          statement: "Side effects need idempotency keys",
          support: "The Module 2 pattern, so a retry never acts twice.",
          glyph: "tick",
        },
      ],
      footer: "Next: Module 6 standardizes how tools reach the model, with MCP.",
      beats: [
        { at: 0.06, cue: "an agent is a bounded control loop" },
        { at: 0.3, cue: "the model requests and your system decides" },
        { at: 0.58, cue: "any tool with a side effect" },
        { at: 0.76, cue: "To go further, build" },
      ],
    },
  ],
};
