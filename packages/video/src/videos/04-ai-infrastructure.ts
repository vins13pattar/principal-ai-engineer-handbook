import type { VideoScript } from "./types.ts";

/**
 * Module 4 — AI Infrastructure. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/04-ai-infrastructure.mdx and its platform-stack diagram.
 */
export const aiInfrastructure: VideoScript = {
  slug: "04-ai-infrastructure",
  module: "04",
  plate: "PLATE 04 · AI INFRASTRUCTURE",
  chapter: "AI Infrastructure",
  title: "AI infrastructure: a model swap is a deploy",
  youtube: {
    titleSuffix: "AI infrastructure: a model swap is a deploy",
    summary:
      "Why model choice is a routing decision, how the platform stack separates fast-changing from slow-changing layers, how to model cost and the hosted versus self-hosted crossover, and why a prompt or model change deserves a canary. Module 4 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 4 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/04-ai-infrastructure/",
      },
      {
        label: "Lab: Async AI Gateway",
        url: "https://handbook.vinodspattar.in/build/labs/async-ai-gateway/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "AI infrastructure",
      "LLM gateway",
      "model routing",
      "evaluation",
      "cost modeling",
      "canary deploys",
      "self-hosting",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "A cheaper provider, and nobody notices",
      narration:
        "A team wants to switch its default provider to a cheaper one. Done naively, just change the config and deploy, a quality regression reaches every request before anyone notices. There is no error and no change in status code. The response is a 200 with a worse answer, and a conventional monitor sees nothing wrong.",
      map: {
        places: [
          { id: "config", label: ["Config change"], x: 0, y: 226, w: 260 },
          { id: "gw", label: ["Gateway"], x: 420, y: 226, w: 260 },
          { id: "pb", label: ["Cheaper", "provider B"], x: 850, y: 226, w: 300 },
          { id: "users", label: ["100% of", "traffic"], x: 1330, y: 226, w: 280, beat: 1 },
        ],
        links: [
          { from: "config", to: "gw", arrow: "end" },
          { from: "gw", to: "pb", arrow: "end" },
          { from: "pb", to: "users", arrow: "end", beat: 1 },
        ],
      },
      runs: [
        { beat: 0, paths: [["config", "gw", "pb"]], results: ["ok"] },
        {
          beat: 1,
          paths: [["gw", "pb", "users"]],
          results: ["fail"],
          marks: ["status 200, worse answers"],
        },
      ],
      captions: [
        "Just change the config and deploy.",
        "A quality regression reaches all of the traffic.",
        "No error, no status change. A monitor sees nothing wrong.",
      ],
      beats: [
        { at: 0 },
        { at: 0.34, cue: "a quality regression reaches" },
        { at: 0.5, cue: "There is no error" },
      ],
    },
    {
      id: "layers",
      kind: "axis",
      headline: "Layers change at different rates",
      narration:
        "An AI platform stack has layers that change at very different rates, and the architecture should reflect that, not fight it. Models and providers change fastest: new versions, new vendors, pricing changes, sometimes silent quality shifts under a stable interface. The gateway and routing layer changes occasionally. The application changes slowest. The design principle follows. Treat model and provider choice as a routing decision, not a hardcoded dependency. If swapping the fastest-changing layer requires touching the slowest-changing one, the dependency direction is backwards.",
      ends: ["changes fastest", "changes slowest"],
      stations: [
        {
          name: "Models and providers",
          line: "New versions, vendors, prices",
          detail: "Sometimes silent quality shifts",
        },
        {
          name: "Gateway and routing",
          line: "New policies, new providers",
          detail: "Absorbs the layer that changes fastest",
        },
        {
          name: "Application",
          line: "Product surface and prompts",
          detail: "Should not change on a swap",
        },
      ],
      beats: [
        { at: 0.24, cue: "Models and providers change fastest" },
        { at: 0.46, cue: "The gateway and routing layer" },
        { at: 0.54, cue: "The application changes slowest" },
      ],
    },
    {
      id: "stack",
      kind: "diagram",
      headline: "The platform stack",
      narration:
        "Here is the stack. The application, with its prompts and product logic, calls a gateway that handles routing, policy and quota. The gateway fans out to hosted provider A, hosted provider B, and a self-hosted model. Wrapped around all of it is evaluation and observability, watching quality, cost and latency per request. That layer is deliberate. In a typical backend, did it work is a status code. An AI system's failure is often a 200 with a wrong or low-quality answer, invisible to conventional monitoring unless something is specifically watching for it.",
      layout: "04-ai-infrastructure.platform-stack",
      legend: [
        { kind: "place", label: "layer" },
        { kind: "route", label: "request path" },
      ],
      steps: [
        { at: 0, show: ["App"], focus: ["App"] },
        { at: 0.12, cue: "calls a gateway", show: ["GW", "e1"], focus: ["App", "GW", "e1"] },
        {
          at: 0.23,
          cue: "fans out to hosted provider",
          show: ["P1", "P2", "P3", "e2", "e3", "e4"],
          focus: ["GW", "P1", "P2", "P3", "e2", "e3", "e4"],
        },
        {
          at: 0.37,
          cue: "Wrapped around all of it",
          show: ["Eval", "e5", "e6", "e7", "e8", "e9"],
          focus: ["Eval", "e5", "e6", "e7", "e8", "e9"],
        },
        { at: 0.54, cue: "That layer is deliberate", show: [], focus: ["Eval"] },
      ],
    },
    {
      id: "cost",
      kind: "bars",
      headline: "Output tokens cost several times more",
      narration:
        "Cost needs modeling too. Hosted providers typically price input and output tokens separately, with output usually costing several times more. The module's illustrative table shows it: a large model at three tenths of a cent per thousand input tokens, and one and a half cents per thousand output tokens. A small model costs a fraction of that. This changes the economics. Summarize this document, large input and small output, is cheap. Expand this outline into a report, small input and large output, is expensive. So track cost per request, not just a monthly total, or one expensive feature can dominate spend with no way to attribute it.",
      items: [
        { label: "Large model: input", value: 0.003, unit: "$ per 1K tokens", tone: "normal" },
        { label: "Large model: output", value: 0.015, unit: "$ per 1K tokens", tone: "fault" },
        { label: "Small model: input", value: 0.0005, unit: "$ per 1K tokens", tone: "normal" },
        { label: "Small model: output", value: 0.0015, unit: "$ per 1K tokens", tone: "route" },
      ],
      max: 0.015,
      caption:
        "Illustrative prices from the module's example table. Real prices change on the provider's schedule.",
      beats: [
        { at: 0.27, cue: "three tenths of a cent" },
        { at: 0.36, cue: "one and a half cents" },
        { at: 0.44, cue: "A small model costs" },
        { at: 0.48, cue: "a fraction of that" },
      ],
    },
    {
      id: "buildbuy",
      kind: "lanes",
      headline: "Build versus buy is a number",
      narration:
        "Build versus buy is a number, not a vibe. Hosted APIs win on time to market, no infrastructure to operate, and frontier quality without a training budget. Self-hosting wins on cost at sufficient scale, latency control, data residency and compliance, and the ability to fine-tune. Hosted cost scales linearly with usage. Self-hosting has a large fixed cost, in GPUs and operations headcount, and a much lower marginal cost per request. Below the crossover volume, hosted wins. Above it, self-hosting wins, assuming you can actually run it. Model the crossover explicitly, rather than defaulting to whichever the team is more comfortable with.",
      lanes: [
        {
          title: "Hosted provider",
          subtitle: ["Fast to ship. Cost scales linearly with usage."],
          chain: ["Request", "Provider endpoint", "Pay per use"],
        },
        {
          title: "Self-hosted model",
          subtitle: ["Large fixed cost, much lower marginal cost."],
          chain: ["Request", "Your own model", "GPUs and operations"],
        },
      ],
      takeaway: "Model the crossover volume explicitly.",
      beats: [
        { at: 0.08, cue: "Hosted APIs win" },
        { at: 0.25, cue: "Self-hosting wins on cost" },
        { at: 0.83, cue: "Model the crossover explicitly" },
      ],
    },
    {
      id: "evaluation",
      kind: "lanes",
      headline: "A prompt change is a deploy",
      narration:
        "Non-determinism is a first-class engineering concern. The same prompt can produce different outputs on different calls, which breaks the assumption every other module relies on. Unit tests that assert exact output equality are the wrong tool. The right one is an evaluation harness that scores outputs against a rubric or a reference set, run against a fixed test suite on every prompt or model change. And a model or prompt change is a deploy. Swapping a default model, bumping a version or editing a production prompt changes user-facing behavior exactly as a code deploy does, so canary it, compare against the baseline, and keep a rollback path.",
      lanes: [
        {
          title: "Exact-match unit test",
          subtitle: ["The wrong tool for non-deterministic output."],
          chain: ["Same prompt", "Different output", "Test breaks"],
          tone: "fault",
        },
        {
          title: "Evaluation harness",
          subtitle: ["Run on every prompt or model change."],
          chain: ["Fixed test suite", "Score against a rubric", "Gate the change"],
        },
      ],
      takeaway: "A model or prompt change is a deploy.",
      beats: [
        { at: 0.23, cue: "Unit tests that assert" },
        { at: 0.33, cue: "The right one is an evaluation harness" },
        { at: 0.59, cue: "And a model or prompt change" },
      ],
    },
    {
      id: "canary",
      kind: "bars",
      headline: "A model swap, done properly",
      narration:
        "Here is a model swap done properly. Route five percent of traffic to provider B. Run the evaluation rubric against both arms for a fixed period, and compare quality score, p95 latency and cost per request side by side. If B holds up, ramp to twenty-five percent, then one hundred. If quality drops below a defined threshold, roll back to a hundred percent provider A. It is the same canary and rollback shape as any other production deploy, applied to a model swap instead of a code change.",
      items: [
        {
          label: "Canary",
          value: 5,
          unit: "% of traffic",
          note: "compare both arms",
          tone: "route",
        },
        { label: "Ramp", value: 25, unit: "% of traffic", tone: "normal" },
        { label: "Full", value: 100, unit: "% of traffic", tone: "normal" },
      ],
      max: 100,
      caption: "Roll back to 100 percent provider A if quality drops below a defined threshold.",
      beats: [
        { at: 0.07, cue: "Route five percent of traffic" },
        { at: 0.48, cue: "ramp to twenty-five percent" },
        { at: 0.53, cue: "then one hundred" },
      ],
    },
    {
      id: "tier",
      kind: "lanes",
      headline: "A decision tier between rules and a model",
      narration:
        "Most model calls are not generation. Much of what a production system sends is a bounded question: which queue does this ticket belong in, is this request in scope, is this output safe to return. Asking a language model costs generation latency and price, and returns text that must be parsed back. A decision model answers the same question directly, from a set you define, with a probability attached. That places a tier between rules and a language model. Deterministic rules where the answer is certain, a decision model where it is bounded, a language model where it is open-ended. A threshold turns the probability into routing policy, but it is only as good as its calibration, so fit it on your own labelled traffic, and re-fit as it drifts.",
      lanes: [
        {
          title: "Deterministic rules",
          subtitle: ["The answer is certain."],
          chain: ["Input", "Rule", "Answer"],
        },
        {
          title: "Decision model",
          subtitle: ["The answer is bounded. Act above a threshold."],
          chain: ["Input", "Set you define, with a probability", "Act or escalate"],
        },
        {
          title: "Language model",
          subtitle: ["The answer is open-ended."],
          chain: ["Input", "Generation", "Text to parse"],
        },
      ],
      takeaway: "Fit the threshold on your own labelled traffic.",
      beats: [
        { at: 0.58, cue: "Deterministic rules where the answer" },
        { at: 0.64, cue: "a decision model where it is bounded" },
        { at: 0.69, cue: "a language model where it is open-ended" },
        { at: 0.87, cue: "so fit it on your own labelled traffic" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failure modes. Silent model degradation: a provider updates the model behind a stable endpoint, quality shifts, and nothing a conventional monitor watches would catch it. Only a running evaluation harness comparing against a baseline can. Cost runaway from unbounded generation length: with no cap, one request becomes disproportionately expensive, and output tokens cost more, so cap length explicitly. Evaluation blind spots: a suite that only tests happy-path prompts misses adversarial inputs and the tail of real queries. Prompt injection: a model that follows instructions in untrusted input can be steered even without malicious intent, and it shows up first as broken behavior. And vendor rate-limit surprises. A limit that never mattered becomes a hard ceiling in a spike, and the gateway's own admission control does nothing about it.",
      map: {
        places: [
          { id: "input", label: ["Untrusted input"], x: 0, y: 226, w: 250 },
          { id: "quota", label: ["Provider quota"], x: 369, y: 226, w: 250 },
          { id: "model", label: ["Provider model"], x: 738, y: 226, w: 250 },
          { id: "length", label: ["Output length"], x: 1107, y: 226, w: 250 },
          { id: "eval", label: ["Evaluation suite"], x: 1476, y: 226, w: 250 },
        ],
        links: [
          { from: "input", to: "quota", arrow: "end" },
          { from: "quota", to: "model", arrow: "end" },
          { from: "model", to: "length", arrow: "end" },
          { from: "length", to: "eval", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "model",
          title: "Silent model degradation",
          body: "Quality shifts behind a stable endpoint. Only an evaluation harness notices.",
        },
        {
          at: "length",
          title: "Cost runaway",
          body: "No cap on generation length. Output tokens cost more. Cap it explicitly.",
        },
        {
          at: "eval",
          title: "Evaluation blind spots",
          body: "Happy-path prompts miss adversarial inputs and the tail of real traffic.",
        },
        {
          at: "input",
          title: "Prompt injection",
          body: "Untrusted content can steer the model. It looks like broken behavior first.",
        },
        {
          at: "quota",
          title: "Vendor rate-limit surprises",
          body: "A limit that never mattered becomes a hard ceiling in a spike.",
        },
      ],
      beats: [
        { at: 0.02, cue: "Silent model degradation" },
        { at: 0.27, cue: "Cost runaway from unbounded" },
        { at: 0.44, cue: "Evaluation blind spots" },
        { at: 0.59, cue: "Prompt injection" },
        { at: 0.78, cue: "And vendor rate-limit surprises" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. One: treat model and provider choice as a routing decision, with the gateway as the seam. Two: a model or prompt change is a deploy, so evaluate it, canary it, and keep a rollback path. Three: track cost, quality and latency per request, because the failure you fear most returns a 200 with a wrong answer. To go further, build the cost-tracking wrapper from the module, and keep the pricing table in versioned config. Links are in the description.",
      points: [
        {
          statement: "Routing, not a hardcoded dependency",
          support: "The gateway is the seam that absorbs the fastest-changing layer.",
          glyph: "fan",
        },
        {
          statement: "A model or prompt change is a deploy",
          support: "Evaluate it, canary it, and keep a rollback path.",
          glyph: "gate",
        },
        {
          statement: "Watch quality, cost and latency",
          support: "Per request, because a 200 can still be a wrong answer.",
          glyph: "tick",
        },
      ],
      footer: "Next: Module 5 turns the model into a bounded control loop.",
      beats: [
        { at: 0.05, cue: "treat model and provider choice" },
        { at: 0.24, cue: "a model or prompt change is a deploy" },
        { at: 0.46, cue: "track cost, quality and latency" },
        { at: 0.69, cue: "To go further, build" },
      ],
    },
  ],
};
