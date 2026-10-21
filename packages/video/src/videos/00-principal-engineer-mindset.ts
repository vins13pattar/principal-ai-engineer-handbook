import type { VideoScript } from "./types.ts";

/**
 * Module 0 — Principal Engineer Mindset. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/00-principal-engineer-mindset.mdx.
 */
export const mindset: VideoScript = {
  slug: "00-principal-engineer-mindset",
  module: "00",
  plate: "PLATE 00 · MINDSET",
  chapter: "Principal Engineer Mindset",
  title: "How Principal Engineers make decisions that last",
  youtube: {
    titleSuffix: "How Principal Engineers make decisions that last",
    summary:
      "The leverage ladder, the one distinction that decides how much process a decision deserves (reversible or not), and the six questions that make a decision checkable months later. Module 0 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 0 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/00-principal-engineer-mindset/",
      },
      {
        label: "Lab: Async AI Gateway",
        url: "https://handbook.vinodspattar.in/build/labs/async-ai-gateway/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "principal engineer",
      "staff engineer",
      "decision making",
      "ADR",
      "system design",
      "engineering leadership",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "The wrong amount of rigor for the door",
      narration:
        "Most bad technical decisions aren't wrong on the merits. They get the right amount of rigor applied to the wrong kind of door. A decision you can barely undo, made in a Slack thread. Or one a rollback would have fixed, stuck in a four-week review. That mismatch is what this module trains out of you.",
      map: {
        places: [
          { id: "decision", label: ["A decision"], x: 0, y: 226, w: 240 },
          { id: "slack", label: ["Slack thread"], x: 400, y: 70, w: 280, beat: 0 },
          { id: "oneway", label: ["Hard to reverse"], x: 860, y: 70, w: 300, beat: 0 },
          { id: "review", label: ["Four-week review"], x: 400, y: 384, w: 280, beat: 1 },
          { id: "easy", label: ["Easy to roll back"], x: 860, y: 384, w: 300, beat: 1 },
        ],
        links: [
          { from: "decision", to: "slack", beat: 0, arrow: "end" },
          { from: "slack", to: "oneway", beat: 0, arrow: "end" },
          { from: "decision", to: "review", beat: 1, arrow: "end" },
          { from: "review", to: "easy", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [["decision", "slack", "oneway"]],
          results: ["fail"],
          marks: ["no way back"],
        },
        {
          beat: 1,
          paths: [["decision", "review", "easy"]],
          results: ["stall"],
          marks: ["weeks spent"],
        },
      ],
      captions: [
        "A decision you can barely undo, made in a Slack thread.",
        "A decision a rollback would have fixed, stuck in review for four weeks.",
        "The wrong amount of rigor for the door.",
      ],
      beats: [
        { at: 0 },
        { at: 0.4, cue: "Or one a rollback would have fixed" },
        { at: 0.74, cue: "That mismatch" },
      ],
    },
    {
      id: "ladder",
      kind: "axis",
      headline: "The leverage ladder",
      narration:
        "Every engineering level trades direct output for indirect output through other people's work. A junior engineer's lever is their own code. A mid-level engineer's, their own features. A senior engineer's, a component. A staff engineer's, a system. And a principal engineer's lever is a platform or an organization. The central question changes with it, from how do I build this correctly, to what's the simplest system that keeps working as the company grows. The ladder isn't about title politics. It's about where your time produces the most value. A week hand-optimizing one function is a leverage mistake if a design review could stop ten teams repeating it.",
      ends: ["direct output: your own work", "indirect output: through other people's work"],
      stations: [
        { name: "Junior", line: "Their own code", detail: "How do I build this correctly?" },
        {
          name: "Mid-level",
          line: "Their own features",
          detail: "How do I deliver this reliably?",
        },
        { name: "Senior", line: "A component", detail: "How should this service behave?" },
        { name: "Staff", line: "A system", detail: "How should these components work together?" },
        {
          name: "Principal",
          line: "A platform or org",
          detail: "What is the simplest system that keeps working as the company grows?",
        },
      ],
      beats: [
        { at: 0.1, cue: "A junior engineer's lever is their own code" },
        { at: 0.24, cue: "A mid-level engineer's" },
        { at: 0.33, cue: "A senior engineer's" },
        { at: 0.4, cue: "A staff engineer's" },
        { at: 0.48, cue: "And a principal engineer's lever" },
      ],
    },
    {
      id: "pipeline",
      kind: "diagram",
      headline: "A decision is a system",
      narration:
        "Treat a decision as a system, with an input, a process, and an output. The input is an ambiguous problem. You frame it and its constraints, draft options, including a deliberately simple baseline, and write it down as an RFC or ADR draft. Then comes the question that matters most: is it reversible? A reversible Type 2 decision gets an async written review. A hard to reverse Type 1 decision gets a synchronous design review. Either way, the decision is recorded with its consequences, then implemented, with a revisit trigger defined up front. When the trigger fires, the loop starts again.",
      layout: "00-principal-engineer-mindset.decision-flow",
      steps: [
        { at: 0, show: ["A", "B"] },
        { at: 0.2, cue: "draft options", show: ["C", "D"] },
        { at: 0.42, cue: "is it reversible", show: ["E"] },
        { at: 0.54, cue: "A reversible Type 2", show: ["F", "G"] },
        { at: 0.72, cue: "Either way, the decision is recorded", show: ["H", "I"] },
        { at: 0.86, cue: "with a revisit trigger", show: ["J"] },
      ],
    },
    {
      id: "doors",
      kind: "lanes",
      headline: "Classify the door before choosing a speed",
      narration:
        "The branch after reversible is the highest-leverage distinction in this whole process. It comes from Jeff Bezos's 2015 shareholder letter. Type 2 decisions can be walked back, so they should move fast, with async written review from a small number of people. Over-processing one spends expensive synchronous time on a risk a rollback would have solved cheaper. Type 1 decisions are hard to reverse: a data model migration, a public API contract, a vendor lock-in. They deserve the synchronous review, the wider stakeholder list, and the extra week. The skill is classifying the door before you choose a speed.",
      lanes: [
        {
          title: "Type 2: reversible",
          subtitle: ["Move fast. A rollback is cheaper than a long review."],
          chain: ["Decide", "Async written review", "Roll back if wrong"],
        },
        {
          title: "Type 1: hard to reverse",
          subtitle: ["A data model migration, a public API contract, a vendor lock-in."],
          chain: ["Decide", "Synchronous design review", "Hard to undo"],
        },
      ],
      takeaway: "Classify the door first. Then choose the speed.",
      beats: [
        { at: 0.28, cue: "Type 2 decisions can be walked back" },
        { at: 0.58, cue: "Type 1 decisions are hard to reverse" },
        { at: 0.86, cue: "classifying the door before you choose a speed" },
      ],
    },
    {
      id: "questions",
      kind: "anatomy",
      prose: true,
      headline: "Six questions, in this order",
      narration:
        "The process box needs a concrete framework. Use six questions, in order, because skipping ahead to alternatives before constraints is the most common way design docs go wrong. Problem, stated without naming a technology. Constraints, found before you propose anything. Alternatives: at least two real options, one of them a deliberately boring baseline. Trade-offs: what each option improves, what it costs, and what it makes harder to change later. Decision, tied to the constraints that made it fit now. And consequences, including the concrete signal that would justify revisiting it. Without that, decisions calcify into dogma.",
      lines: [
        { text: "1  Problem", group: "route" },
        { text: "2  Constraints", group: "route" },
        { text: "3  Alternatives, with a boring baseline", group: "route" },
        { text: "", group: "plain" },
        { text: "4  Trade-offs", group: "meta" },
        { text: "5  Decision", group: "meta" },
        { text: "6  Consequences and a revisit trigger", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Frame it",
          body: "State the problem without naming a technology. Find constraints before you propose anything. Offer at least two real options.",
        },
        {
          group: "meta",
          title: "Make it checkable",
          body: "Say what each option costs, decide against the constraints that fit now, and name the signal that would make you revisit.",
        },
      ],
      beats: [
        { at: 0.28, cue: "Problem, stated without naming a technology" },
        { at: 0.58, cue: "Trade-offs: what each option improves" },
      ],
    },
    {
      id: "incident",
      kind: "lanes",
      headline: "The framework on a real incident",
      narration:
        "Here is the framework on a real incident. A gateway serving multiple tenants sees tenant B's requests time out whenever tenant A's traffic spikes. The senior engineer's first instinct is a per-tenant queue in the request handler. That's an implementation, not yet a decision. The problem is noisy-neighbor latency, and the constraint is a stateless gateway with several replicas. Three alternatives. An in-process token bucket, the boring baseline, which is wrong here because it limits per replica, so a tenant gets replica count times its real quota. A Redis-backed limiter shared across replicas. Or push isolation into a service mesh, rejected for now as too large an organizational lift. They ship the Redis limiter, and make its failure behavior an explicit choice: fail open with a tighter local limit.",
      lanes: [
        {
          title: "In-process bucket",
          subtitle: ["The boring baseline. Wrong here."],
          chain: ["Tenant", "Replica", "Local bucket"],
          routeLabel: "per replica, so the quota multiplies",
          tone: "fault",
        },
        {
          title: "Shared Redis limiter",
          subtitle: ["Chosen. Fail open with a tighter local limit."],
          chain: ["Tenant", "Replica", "Shared limiter"],
          routeLabel: "one quota across replicas",
        },
        {
          title: "Service mesh",
          subtitle: ["Rejected for now: too big a lift."],
          chain: ["Tenant", "Mesh", "Per-tenant limit"],
          routeLabel: "isolation in the infrastructure layer",
        },
      ],
      beats: [
        { at: 0.5, cue: "An in-process token bucket" },
        { at: 0.68, cue: "A Redis-backed limiter shared across replicas" },
        { at: 0.8, cue: "push isolation into a service mesh" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where decisions go wrong",
      narration:
        "Five failure modes, each a place the decision pipeline breaks. Technology-first design: picking Kafka, an agent framework, or a vector database before a problem statement exists. You can tell when the design doc's title is a product name. Consensus paralysis: waiting for everyone to agree on a Type 2 decision that one written review should have settled. Premature platform-building: a generalized, multi-tenant version of something with exactly one caller. Unmeasured optimization: fixing a bottleneck you assumed instead of one you measured. And ignoring operations: designing the happy path and leaving deployment, monitoring, rollback and on-call to whoever ships it.",
      map: {
        places: [
          { id: "problem", label: ["Problem"], x: 0, y: 226, w: 220 },
          { id: "options", label: ["Options"], x: 300, y: 226, w: 220 },
          { id: "review", label: ["Review"], x: 600, y: 226, w: 220 },
          { id: "build", label: ["Build"], x: 900, y: 226, w: 220 },
          { id: "measure", label: ["Measure"], x: 1200, y: 226, w: 220 },
          { id: "operate", label: ["Operate"], x: 1500, y: 226, w: 220 },
        ],
        links: [
          { from: "problem", to: "options", arrow: "end" },
          { from: "options", to: "review", arrow: "end" },
          { from: "review", to: "build", arrow: "end" },
          { from: "build", to: "measure", arrow: "end" },
          { from: "measure", to: "operate", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "problem",
          title: "Technology-first design",
          body: "A product name is the design doc's title, and no problem statement exists.",
        },
        {
          at: "review",
          title: "Consensus paralysis",
          body: "Everyone must agree on a decision one written review should have settled.",
        },
        {
          at: "build",
          title: "Premature platform-building",
          body: "A generalized, multi-tenant version of something with one caller.",
        },
        {
          at: "measure",
          title: "Unmeasured optimization",
          body: "Fixing a bottleneck you assumed, not one you measured.",
        },
        {
          at: "operate",
          title: "Ignoring operations",
          body: "Deployment, rollback and on-call left to whoever ships it.",
        },
      ],
      beats: [
        { at: 0.08, cue: "Technology-first design" },
        { at: 0.32, cue: "Consensus paralysis" },
        { at: 0.5, cue: "Premature platform-building" },
        { at: 0.68, cue: "Unmeasured optimization" },
        { at: 0.84, cue: "And ignoring operations" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "Autonomy against alignment",
      narration:
        "Three trade-offs recur. Speed versus certainty: a fast wrong Type 2 decision costs a rollback, but a fast wrong Type 1 decision costs a migration, or becomes permanent, so classify the door first. Documentation versus velocity: the six questions scale down, and a low-blast-radius Type 2 decision might get three sentences in a Slack thread with a permalink. And autonomy versus alignment. Let every team choose its own patterns and you get fragmentation. Centralize every choice and you kill the local judgment that caught the bug. Principal engineers centralize contracts, APIs, event schemas and SLOs, and leave implementation to the team closest to the problem.",
      lanes: [
        {
          title: "Every team chooses",
          subtitle: ["Short-term velocity. Long-term fragmentation."],
          chain: ["Team A", "Team B", "Team C"],
        },
        {
          title: "Every choice is central",
          subtitle: ["Consistency. It kills the local judgment that caught the bug."],
          chain: ["Team A", "Central review", "Team B"],
          tone: "fault",
        },
      ],
      takeaway: "Centralize contracts. Leave implementation to the team closest to the problem.",
      beats: [
        { at: 0.5, cue: "Let every team choose its own patterns" },
        { at: 0.64, cue: "Centralize every choice" },
        { at: 0.82, cue: "Principal engineers centralize contracts" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. Classify the door before you choose a speed: reversible decisions move fast, hard to reverse ones earn the synchronous review. Write the decision down before you build, with at least two options and a revisit trigger stated as a fact you can check. And pull the highest-leverage lever, but only after you've confirmed the problem is real and recurring, because the same instinct that makes you effective is how you end up building a platform for one caller.",
      points: [
        {
          statement: "Classify the door first",
          support:
            "Reversible decisions move fast. Hard-to-reverse ones earn the synchronous review.",
          glyph: "gate",
        },
        {
          statement: "Write it down before you build",
          support: "At least two options, and a revisit trigger stated as a fact you can check.",
          glyph: "chain",
        },
        {
          statement: "Pull the highest-leverage lever",
          support: "After you have confirmed the problem is real and recurring.",
          glyph: "axis",
        },
      ],
      footer: "Next: Module 1 turns this decision into running code in the async gateway lab.",
      beats: [
        { at: 0.1, cue: "Classify the door before you choose a speed" },
        { at: 0.36, cue: "Write the decision down before you build" },
        { at: 0.64, cue: "pull the highest-leverage lever" },
        { at: 0.9 },
      ],
    },
  ],
};
