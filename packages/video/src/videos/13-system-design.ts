import type { VideoScript } from "./types.ts";

/**
 * Module 13 — System Design. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/13-system-design.mdx.
 */
export const systemDesign: VideoScript = {
  slug: "13-system-design",
  module: "13",
  plate: "PLATE 13 · SYSTEM DESIGN",
  chapter: "System Design",
  title: "System design: claims you can measure",
  youtube: {
    titleSuffix: "System design: claims you can measure",
    summary:
      "The design method for AI systems: constraints before components, capacity and cost in numbers, the decision that is hardest to undo, and a quality signal that can prove the design wrong. Module 13 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 13 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/13-system-design/",
      },
      {
        label: "Lab: Async AI Gateway",
        url: "https://handbook.vinodspattar.in/build/labs/async-ai-gateway/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "system design",
      "capacity planning",
      "Little's Law",
      "AI engineering",
      "architecture",
      "principal engineer",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Three times the limit",
      narration:
        "Many teams, each with their own quota, behind a gateway with three replicas. The quota counter lived in process memory. On one replica that is correct. On three, each replica enforces the quota independently, and a tenant silently receives three times their limit. By the time anyone noticed, tenants had built against the wrong limit. That is a one-way door, walked through casually. This module is how to find those doors before anyone writes the first line.",
      map: {
        places: [
          { id: "tenant", label: ["A tenant"], x: 0, y: 226, w: 240 },
          { id: "r1", label: ["Replica 1"], x: 400, y: 40, w: 240, beat: 0 },
          { id: "r2", label: ["Replica 2"], x: 400, y: 226, w: 240, beat: 0 },
          { id: "r3", label: ["Replica 3"], x: 400, y: 412, w: 240, beat: 0 },
          { id: "count", label: ["Local quota counter"], x: 860, y: 226, w: 300, beat: 0 },
          { id: "over", label: ["Three times the limit"], x: 1300, y: 226, w: 340, beat: 1 },
        ],
        links: [
          { from: "tenant", to: "r1", beat: 0, arrow: "end" },
          { from: "tenant", to: "r2", beat: 0, arrow: "end" },
          { from: "tenant", to: "r3", beat: 0, arrow: "end" },
          { from: "r1", to: "count", beat: 0, arrow: "end" },
          { from: "r2", to: "count", beat: 0, arrow: "end" },
          { from: "r3", to: "count", beat: 0, arrow: "end" },
          { from: "count", to: "over", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        { beat: 0, paths: [["tenant", "r1", "count"]], results: ["ok"] },
        {
          beat: 1,
          paths: [["tenant", "r2", "count", "over"]],
          results: ["fail"],
          marks: ["tenants built against it"],
        },
      ],
      captions: [
        "The quota counter lives in process memory.",
        "Three replicas enforce the quota independently.",
        "By the time anyone noticed, tenants had built against the wrong limit.",
      ],
      beats: [
        { at: 0 },
        { at: 0.3, cue: "each replica enforces the quota independently" },
        { at: 0.62, cue: "By the time anyone noticed" },
      ],
    },
    {
      id: "claims",
      kind: "anatomy",
      prose: true,
      headline: "A design is a set of falsifiable claims",
      narration:
        "A design is a set of falsifiable claims, not a diagram. A diagram says what the parts are. A design says what the system will do, at this rate, at this latency, for this cost per call, and each claim is something measurement can refute. Retrieval quality is sufficient is not a claim. Recall at ten stays above point eight five on the labelled set, checked on every index rebuild, is. Anything that cannot be refuted is decoration. AI systems raise the stakes, because the model degrades without erroring, costs real money per call, and returns different answers to identical inputs.",
      lines: [
        { text: "Not a claim", group: "route" },
        { text: "Retrieval quality is sufficient", group: "route" },
        { text: "", group: "plain" },
        { text: "A claim", group: "meta" },
        { text: "Recall@10 stays above 0.85 on the labelled set,", group: "meta" },
        { text: "checked on every index rebuild", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Decoration",
          body: "Nothing a measurement could refute.",
        },
        {
          group: "meta",
          title: "Falsifiable",
          body: "Names the measurement and the threshold at which you would act.",
        },
      ],
      beats: [
        { at: 0.36, cue: "Retrieval quality is sufficient is not a claim" },
        { at: 0.5, cue: "Recall at ten stays above" },
      ],
    },
    {
      id: "method",
      kind: "diagram",
      headline: "The design method",
      narration:
        "Here is the method. Start with a new AI system and establish constraints: volume, latency, correctness, data boundary, cost per call. Characterize the workload: arrival shape, payload size, read and write mix, tail sensitivity. Model capacity and cost. Then ask which decision is hardest to reverse. Three branches matter most in AI systems: the data boundary and permission model, state ownership and durability, and the external contract and versioning. Decompose into components with one owner each. Define the quality signal, with an eval set, thresholds and a regression gate. Then the operational signal: SLOs, burn rate, cost per request. Now ask, is it reversible within one deploy? If so, ship behind a flag and measure. If not, first name the evidence that would change the decision. Finally, compare against the declared thresholds. Within budget, the design holds. Outside budget, go back to the constraints. A design is finished when measurement agrees with it.",
      layout: "13-system-design.design-method",
      legend: [
        { kind: "terminal", label: "start" },
        { kind: "place", label: "step" },
        { kind: "decision", label: "decision" },
        { kind: "route", label: "path taken" },
      ],
      steps: [
        { at: 0, show: ["START"], focus: ["START"], camera: ["START", "CONSTRAINTS"] },
        {
          at: 0.07,
          cue: "establish constraints",
          show: ["CONSTRAINTS", "e1"],
          focus: ["START", "CONSTRAINTS", "e1"],
          camera: ["START", "CONSTRAINTS", "WORKLOAD"],
        },
        {
          at: 0.16,
          cue: "Characterize the workload",
          show: ["WORKLOAD", "e2"],
          focus: ["WORKLOAD", "e2"],
          camera: ["CONSTRAINTS", "WORKLOAD", "CAPACITY"],
        },
        {
          at: 0.27,
          cue: "Model capacity and cost",
          show: ["CAPACITY", "e3"],
          focus: ["CAPACITY", "e3"],
          camera: ["WORKLOAD", "CAPACITY", "HARD"],
        },
        {
          at: 0.33,
          cue: "which decision is hardest to reverse",
          show: ["HARD", "e4"],
          focus: ["HARD", "e4"],
          camera: ["HARD", "DATA", "STATE", "CONTRACT"],
        },
        {
          at: 0.41,
          cue: "the data boundary and permission model",
          show: ["DATA", "STATE", "CONTRACT", "e5", "e6", "e7"],
          focus: ["DATA", "STATE", "CONTRACT", "e5", "e6", "e7"],
          camera: ["HARD", "DATA", "STATE", "CONTRACT"],
        },
        {
          at: 0.52,
          cue: "Decompose into components",
          show: ["DECOMPOSE", "e8", "e9", "e10"],
          focus: ["DECOMPOSE", "e8", "e9", "e10"],
          camera: ["DATA", "STATE", "CONTRACT", "DECOMPOSE"],
        },
        {
          at: 0.6,
          cue: "Define the quality signal",
          show: ["EVAL", "e11"],
          focus: ["EVAL", "e11"],
          camera: ["DECOMPOSE", "EVAL", "OBSERVE"],
        },
        {
          at: 0.68,
          cue: "the operational signal",
          show: ["OBSERVE", "e12"],
          focus: ["OBSERVE", "e12"],
          camera: ["EVAL", "OBSERVE", "REVERSIBLE"],
        },
        {
          at: 0.74,
          cue: "is it reversible within one deploy",
          show: ["REVERSIBLE", "e13"],
          focus: ["REVERSIBLE", "e13"],
          camera: ["OBSERVE", "REVERSIBLE", "SHIP", "EVIDENCE"],
        },
        {
          at: 0.8,
          cue: "ship behind a flag and measure",
          show: ["SHIP", "e14"],
          focus: ["REVERSIBLE", "SHIP", "e14"],
          camera: ["REVERSIBLE", "SHIP", "EVIDENCE"],
        },
        {
          at: 0.85,
          cue: "first name the evidence that would change the decision",
          show: ["EVIDENCE", "e15", "e16"],
          focus: ["REVERSIBLE", "EVIDENCE", "SHIP", "e15", "e16"],
          camera: ["REVERSIBLE", "SHIP", "EVIDENCE"],
        },
        {
          at: 0.91,
          cue: "compare against the declared thresholds",
          show: ["MEASURE", "e17"],
          focus: ["SHIP", "MEASURE", "e17"],
          camera: ["SHIP", "MEASURE", "DONE", "CONSTRAINTS"],
        },
        {
          at: 0.95,
          cue: "Within budget, the design holds",
          show: ["DONE", "e18"],
          focus: ["MEASURE", "DONE", "e18"],
          camera: ["MEASURE", "DONE", "CONSTRAINTS"],
        },
        {
          at: 0.975,
          cue: "Outside budget, go back to the constraints",
          show: ["e19"],
          focus: ["MEASURE", "CONSTRAINTS", "e19"],
          camera: ["MEASURE", "DONE", "CONSTRAINTS"],
        },
      ],
    },
    {
      id: "constraints",
      kind: "anatomy",
      prose: true,
      headline: "Six constraint questions",
      narration:
        "Constraints come first, and the answers should be numbers or named parties. Who calls this, and how often, at peak rather than average. How fast must it answer, as a target for the tail, and what happens when it is missed. How wrong may it be, and how would you know. That is the AI-specific one: correct needs a definition, and the definition needs an eval set. Then the boundaries. Whose data is it: tenant, region and retention, the constraint most often discovered late. What does a call cost: tokens in, tokens out, retrieval hops, retries. And what is the failure budget.",
      lines: [
        { text: "Who calls this, and how often?", group: "route" },
        { text: "How fast must it answer?", group: "route" },
        { text: "How wrong may it be, and how would you know?", group: "route" },
        { text: "", group: "plain" },
        { text: "Whose data is it?", group: "meta" },
        { text: "What does a call cost?", group: "meta" },
        { text: "What is the failure budget?", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "The target",
          body: "Peak rate, a tail latency target, and a definition of correct backed by an eval set.",
        },
        {
          group: "meta",
          title: "The boundaries",
          body: "Tenant, region and retention. Tokens, retrievals and retries. Acceptable unavailability.",
        },
      ],
      beats: [
        { at: 0.1, cue: "Who calls this, and how often" },
        { at: 0.58, cue: "Then the boundaries" },
      ],
    },
    {
      id: "capacity",
      kind: "bars",
      headline: "Capacity is arithmetic",
      narration:
        "Little's Law is the whole of it for a first pass: concurrency equals arrival rate times average latency. At 200 requests per second with an average latency of 2 seconds, 400 requests are in flight at any moment. That number sets connection pool sizes, semaphore bounds, memory and replica count, and you can derive it before any code exists. If the model says 400 concurrent requests and the connection pool is configured for 100, that is a bug found before it was written. Most capacity surprises are this arithmetic not being done.",
      items: [
        {
          label: "In flight: 200 per second times 2 seconds",
          value: 400,
          unit: "requests",
          tone: "route",
        },
        {
          label: "Connection pool, as configured",
          value: 100,
          unit: "connections",
          tone: "fault",
          note: "A bug found before it was written",
        },
      ],
      max: 400,
      caption: "concurrency = arrival rate × average latency",
      beats: [
        { at: 0.36, cue: "400 requests are in flight" },
        { at: 0.7, cue: "the connection pool is configured for 100" },
      ],
    },
    {
      id: "doors",
      kind: "lanes",
      headline: "Find the decision that is hardest to undo",
      narration:
        "Then find the irreversible decision. Ask of each choice: if this is wrong, what does fixing it cost? A retry policy is a config change. A queue technology is a week. A data model that mixes two tenants' embeddings in one index is a migration, an audit, and a disclosure. Rank by that, and spend design effort in the same order. These are Bezos's one-way and two-way doors. Treating every decision as a one-way door is slow. The rarer, worse failure is treating a one-way door as reversible.",
      lanes: [
        {
          title: "Retry policy",
          subtitle: ["A config change."],
          chain: ["Wrong choice", "Edit config", "Fixed"],
        },
        {
          title: "Queue technology",
          subtitle: ["A week."],
          chain: ["Wrong choice", "Swap and migrate", "A week"],
        },
        {
          title: "Two tenants in one index",
          subtitle: ["A migration, an audit, and a disclosure."],
          chain: ["Tenants mixed", "Migrate and audit", "Disclose"],
          tone: "fault",
        },
      ],
      takeaway: "Spend design time in proportion.",
      beats: [
        { at: 0.2, cue: "A retry policy is a config change" },
        { at: 0.3, cue: "A queue technology is a week" },
        { at: 0.4, cue: "A data model that mixes" },
        { at: 0.62, cue: "Rank by that" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where designs fail",
      narration:
        "Six ways a design fails. Components chosen before constraints: the tell is that changing the requirements would not change the diagram. Capacity estimated in adjectives, so the pool or the replica count is chosen by default rather than by arithmetic. No quality signal: answers degrade for six weeks after an index rebuild changes the chunking, and latency monitoring cannot see it. Cost discovered in the invoice: retries, grown context, or retrieval firing on every request. Irreversible decisions made casually, because nobody asked how hard they are to undo. And designing for a scale that never arrives, which carries the operational burden every day for capacity nobody uses.",
      map: {
        places: [
          { id: "constraints", label: ["Constraints"], x: 0, y: 226, w: 250 },
          { id: "capacity", label: ["Capacity"], x: 290, y: 226, w: 250 },
          { id: "quality", label: ["Quality signal"], x: 580, y: 226, w: 250 },
          { id: "cost", label: ["Cost per call"], x: 870, y: 226, w: 250 },
          { id: "doors", label: ["One-way doors"], x: 1160, y: 226, w: 250 },
          { id: "scale", label: ["Scale"], x: 1450, y: 226, w: 250 },
        ],
        links: [
          { from: "constraints", to: "capacity", arrow: "end" },
          { from: "capacity", to: "quality", arrow: "end" },
          { from: "quality", to: "cost", arrow: "end" },
          { from: "cost", to: "doors", arrow: "end" },
          { from: "doors", to: "scale", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "constraints",
          title: "Components before constraints",
          body: "Changing the requirements would not change the diagram.",
        },
        {
          at: "capacity",
          title: "Capacity in adjectives",
          body: "Pool and replica count chosen by default, not arithmetic.",
        },
        {
          at: "quality",
          title: "No quality signal",
          body: "Answers degrade for weeks and latency monitoring cannot see it.",
        },
        {
          at: "cost",
          title: "Cost in the invoice",
          body: "Retries, grown context, or retrieval on every request.",
        },
        {
          at: "doors",
          title: "Casual one-way doors",
          body: "Nobody asked how hard it is to undo.",
        },
        {
          at: "scale",
          title: "A scale that never arrives",
          body: "The operational burden is carried daily for capacity nobody uses.",
        },
      ],
      beats: [
        { at: 0.06, cue: "Components chosen before constraints" },
        { at: 0.2, cue: "Capacity estimated in adjectives" },
        { at: 0.36, cue: "No quality signal" },
        { at: 0.54, cue: "Cost discovered in the invoice" },
        { at: 0.68, cue: "Irreversible decisions made casually" },
        { at: 0.83, cue: "designing for a scale that never arrives" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "How much to decide up front",
      narration:
        "Two trade-offs decide how much to design up front. Design up front catches the irreversible mistakes while they are still cheap, but costs time before any user is served. Designing as you go finds real requirements faster, but accumulates decisions that are hard to undo. The split follows reversibility: decide the data boundary, state ownership and external contract early, and let everything else be discovered. And platform versus the case in front of you. A platform pays for itself at the third consumer. Watch the second consumer, not the first. One is a use case, two is a pattern.",
      lanes: [
        {
          title: "Design up front",
          subtitle: ["Catches one-way doors while cheap. Costs time before any user."],
          chain: ["Data boundary", "State ownership", "External contract"],
        },
        {
          title: "Design as you go",
          subtitle: ["Finds real requirements faster. Hard-to-undo decisions pile up."],
          chain: ["Build", "Learn", "Decisions accumulate"],
        },
        {
          title: "Platform or the case in front of you",
          subtitle: ["A platform pays for itself at the third consumer."],
          chain: ["One caller", "Second consumer", "Platform"],
        },
      ],
      takeaway: "One is a use case. Two is a pattern.",
      beats: [
        { at: 0.1, cue: "Design up front catches" },
        { at: 0.28, cue: "Designing as you go finds" },
        { at: 0.62, cue: "And platform versus the case in front of you" },
        { at: 0.86, cue: "One is a use case" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. First, a design is a set of falsifiable claims, so establish constraints before components, and name the measurement that would refute each claim. Second, find the decision that is hardest to undo, the data boundary, state ownership or the external contract, and spend design time in that order. Third, write the decision down, with what it cost, what was rejected, and what would change the answer. To see the method at work, read how the async AI gateway lab traces back to its constraints. Links are in the description.",
      points: [
        {
          statement: "Constraints before components",
          support: "A design is claims that measurement can refute, each with a threshold.",
          glyph: "gate",
        },
        {
          statement: "Find the hardest decision to undo",
          support: "Data boundary, state ownership, external contract. Spend effort in that order.",
          glyph: "stack",
        },
        {
          statement: "Record what would change the answer",
          support: "The cost, the rejected options, and the evidence that would prove it wrong.",
          glyph: "chain",
        },
      ],
      footer: "Next: see the method at work in the Async AI Gateway lab.",
      beats: [
        { at: 0.1, cue: "a design is a set of falsifiable claims" },
        { at: 0.4, cue: "find the decision that is hardest to undo" },
        { at: 0.66, cue: "write the decision down" },
        { at: 0.84, cue: "gateway lab" },
      ],
    },
  ],
};
