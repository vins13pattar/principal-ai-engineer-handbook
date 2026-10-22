import type { VideoScript } from "./types.ts";

/**
 * Module 14 — Technical Leadership. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/14-leadership.mdx.
 */
export const leadership: VideoScript = {
  slug: "14-leadership",
  module: "14",
  plate: "PLATE 14 · LEADERSHIP",
  chapter: "Technical Leadership",
  title: "Leadership: decisions and the mechanisms that stick",
  youtube: {
    titleSuffix: "Leadership: decisions and the mechanisms that stick",
    summary:
      "How a Principal engineer routes decisions by reversibility, disagrees in a way that converges, and encodes conclusions in mechanisms instead of reminders. Module 14 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 14 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/14-leadership/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "technical leadership",
      "principal engineer",
      "staff engineer",
      "ADR",
      "decision making",
      "engineering management",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Routed by importance, not reversibility",
      narration:
        "A tenant data boundary gets decided in a standup. A retry policy sits in a review queue with your name on it. Both are the same mistake: routing by importance instead of by reversibility. The first is a migration, an audit and a disclosure. The second could have been undone in a deploy. At Principal scope your output is not opinions. It is decisions, and the mechanisms that make them stick.",
      map: {
        places: [
          { id: "decision", label: ["A decision"], x: 0, y: 226, w: 240 },
          { id: "standup", label: ["A standup"], x: 400, y: 70, w: 280, beat: 0 },
          { id: "boundary", label: ["Tenant data boundary"], x: 860, y: 70, w: 340, beat: 0 },
          { id: "queue", label: ["Your review queue"], x: 400, y: 384, w: 280, beat: 1 },
          { id: "retry", label: ["Retry policy"], x: 860, y: 384, w: 340, beat: 1 },
        ],
        links: [
          { from: "decision", to: "standup", beat: 0, arrow: "end" },
          { from: "standup", to: "boundary", beat: 0, arrow: "end" },
          { from: "decision", to: "queue", beat: 1, arrow: "end" },
          { from: "queue", to: "retry", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        {
          beat: 0,
          paths: [["decision", "standup", "boundary"]],
          results: ["fail"],
          marks: ["a migration and an audit"],
        },
        {
          beat: 1,
          paths: [["decision", "queue", "retry"]],
          results: ["stall"],
          marks: ["waiting on you"],
        },
      ],
      captions: [
        "A data boundary, decided in a standup.",
        "A retry policy, waiting in a queue with your name on it.",
        "Route by reversibility, not by importance.",
      ],
      beats: [
        { at: 0 },
        { at: 0.18, cue: "A retry policy sits in a review queue" },
        { at: 0.38, cue: "routing by importance instead of by reversibility" },
      ],
    },
    {
      id: "output",
      kind: "anatomy",
      prose: true,
      headline: "Decisions and mechanisms, not opinions and reminders",
      narration:
        "Your output is decisions and mechanisms, not opinions and reminders. An opinion has to be re-litigated every time a new person joins. A reminder decays the week you stop giving it. A recorded decision, with the options that lost and what would change the answer, is read once and settles the question. A mechanism that fails the build does not decay. A norm nobody enforces is a preference. We document decisions is a preference. A check that fails when a decision record is missing its Consequences section is a mechanism.",
      lines: [
        { text: "An opinion: re-litigated with every new joiner", group: "route" },
        { text: "A reminder: decays the week you stop", group: "route" },
        { text: "", group: "plain" },
        { text: "A recorded decision: read once, settles it", group: "meta" },
        { text: "A mechanism: fails the build", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "What decays",
          body: "Opinions and reminders need you in the room, every time.",
        },
        {
          group: "meta",
          title: "What lasts",
          body: "A recorded decision with the options that lost, and a check that fails loudly.",
        },
      ],
      beats: [
        { at: 0.14, cue: "An opinion has to be re-litigated" },
        { at: 0.44, cue: "A recorded decision" },
      ],
    },
    {
      id: "path",
      kind: "diagram",
      headline: "Routing a decision by reversibility",
      narration:
        "Here is how a decision should move. A problem surfaces: an incident, a cost spike, a blocked team. Frame it as a decision: what question needs answering? Then the routing key: is it reversible in one deploy? If yes, the team closest to it decides, with no review and no meeting, then ships and measures. This is the branch people under-use. If no, write it down: context, options, and the cost of each. Circulate it for written objection, async and timeboxed. Then ask what the objection is about. Constraints: resolve the constraint first, because most arguments end there. Conclusions: name the evidence that would settle it, and run a timeboxed spike. Neither: decide and record, including what was rejected. Encode it in a mechanism, a linter, a test or a review gate. And at the end, if the evidence contradicts the record, write it down again.",
      layout: "14-leadership.decision-path",
      legend: [
        { kind: "place", label: "step" },
        { kind: "decision", label: "decision" },
        { kind: "route", label: "path taken" },
        { kind: "terminal", label: "outcome" },
      ],
      steps: [
        {
          at: 0,
          show: ["SIGNAL"],
          focus: ["SIGNAL"],
          camera: ["SIGNAL", "FRAME", "REVERSIBLE"],
        },
        {
          at: 0.06,
          cue: "Frame it as a decision",
          show: ["FRAME", "e1"],
          focus: ["FRAME", "e1"],
          camera: ["SIGNAL", "FRAME", "REVERSIBLE"],
        },
        {
          at: 0.17,
          cue: "is it reversible in one deploy",
          show: ["REVERSIBLE", "e2"],
          focus: ["REVERSIBLE", "e2"],
          camera: ["FRAME", "REVERSIBLE", "OWNER"],
        },
        {
          at: 0.26,
          cue: "the team closest to it decides",
          show: ["OWNER", "e3"],
          focus: ["REVERSIBLE", "OWNER", "e3"],
          camera: ["REVERSIBLE", "OWNER", "SHIP"],
        },
        {
          at: 0.34,
          cue: "ships and measures",
          show: ["SHIP", "e4"],
          focus: ["OWNER", "SHIP", "e4"],
          camera: ["OWNER", "SHIP", "REVISIT"],
        },
        {
          at: 0.42,
          cue: "If no, write it down",
          show: ["WRITE", "e5"],
          focus: ["REVERSIBLE", "WRITE", "e5"],
          camera: ["REVERSIBLE", "SHIP", "WRITE"],
        },
        {
          at: 0.5,
          cue: "Circulate it for written objection",
          show: ["CIRCULATE", "e6"],
          focus: ["WRITE", "CIRCULATE", "e6"],
          camera: ["WRITE", "CIRCULATE"],
        },
        {
          at: 0.56,
          cue: "what the objection is about",
          show: ["DISAGREE", "e7"],
          focus: ["CIRCULATE", "DISAGREE", "e7"],
          camera: ["DISAGREE", "EVIDENCE", "REVERSIBLE", "RESOLVE", "CIRCULATE"],
        },
        {
          at: 0.62,
          cue: "resolve the constraint first",
          show: ["RESOLVE", "e8", "e11"],
          focus: ["DISAGREE", "RESOLVE", "WRITE", "e8", "e11"],
          camera: ["DISAGREE", "RESOLVE", "WRITE"],
        },
        {
          at: 0.71,
          cue: "name the evidence that would settle it",
          show: ["EVIDENCE", "SPIKE", "e9", "e12"],
          focus: ["DISAGREE", "EVIDENCE", "SPIKE", "e9", "e12"],
          camera: ["DISAGREE", "EVIDENCE", "SPIKE", "DECIDE"],
        },
        {
          at: 0.8,
          cue: "decide and record",
          show: ["DECIDE", "e10", "e13"],
          focus: ["DISAGREE", "SPIKE", "DECIDE", "e10", "e13"],
          camera: ["DISAGREE", "SPIKE", "DECIDE"],
        },
        {
          at: 0.87,
          cue: "Encode it in a mechanism",
          show: ["ENFORCE", "e14", "e15"],
          focus: ["DECIDE", "ENFORCE", "SHIP", "e14", "e15"],
          camera: ["DECIDE", "ENFORCE", "SHIP"],
        },
        {
          at: 0.94,
          cue: "if the evidence contradicts the record",
          show: ["REVISIT", "HOLD", "e16", "e17", "e18"],
          focus: ["SHIP", "REVISIT", "WRITE", "HOLD", "e16", "e17", "e18"],
          camera: ["SHIP", "REVISIT", "HOLD", "WRITE"],
        },
      ],
    },
    {
      id: "disagree",
      kind: "lanes",
      headline: "Disagreement that converges",
      narration:
        "Almost every technical argument is one of three things, and naming which one collapses most of them. A constraint disagreement: you think it must serve 200 requests per second, they think 20. You are not arguing about architecture. Write the requirement down. A conclusion disagreement from shared constraints is legitimate. Name the evidence that would settle it, and what it costs. A two-day spike beats a two-week argument. And a preference: same constraints, same evidence, different taste. That is a two-way door. Let whoever owns the code decide and move on.",
      lanes: [
        {
          title: "A constraint disagreement",
          subtitle: ["You think 200 requests per second. They think 20."],
          chain: ["Different requirements", "Write it down", "The argument ends"],
        },
        {
          title: "A conclusion disagreement",
          subtitle: ["Shared constraints. Legitimate."],
          chain: ["Shared constraints", "Name the evidence", "Two-day spike"],
        },
        {
          title: "A preference",
          subtitle: ["Same constraints, same evidence, different taste."],
          chain: ["Same evidence", "Different taste", "The owner decides"],
        },
      ],
      takeaway: "Name which one it is. Most arguments collapse.",
      beats: [
        { at: 0.14, cue: "A constraint disagreement" },
        { at: 0.36, cue: "A conclusion disagreement" },
        { at: 0.64, cue: "And a preference" },
        { at: 0.88, cue: "Let whoever owns the code decide" },
      ],
    },
    {
      id: "adr",
      kind: "anatomy",
      prose: true,
      headline: "A norm converted into a mechanism",
      narration:
        "Anything you find yourself saying twice is a candidate for automation. This repository requires every decision record to carry the same seven sections, and CI fails if one is missing. The interesting ones are Options and Consequences. Requiring Options forces the rejected alternatives into writing, which makes a decision auditable, because otherwise you cannot tell a considered choice from a default. Requiring Consequences forces the cost to be stated by the person best placed to know it. Note what the check does not do. It never judges whether the content is any good. It enforces the shape, and the shape makes a bad decision visible in review.",
      lines: [
        { text: "Status", group: "plain" },
        { text: "Context", group: "plain" },
        { text: "Problem", group: "plain" },
        { text: "Options", group: "route" },
        { text: "Decision", group: "plain" },
        { text: "Consequences", group: "meta" },
        { text: "References", group: "plain" },
      ],
      notes: [
        {
          group: "route",
          title: "Options",
          body: "Rejected alternatives are written down, so a considered choice differs from a default.",
        },
        {
          group: "meta",
          title: "Consequences",
          body: "The cost, stated by the person best placed to know it.",
        },
      ],
      beats: [
        { at: 0.36, cue: "Requiring Options forces" },
        { at: 0.58, cue: "Requiring Consequences forces" },
      ],
    },
    {
      id: "reversal",
      kind: "lanes",
      headline: "Verify the claims, then decide, then record why",
      narration:
        "This handbook's own direction was reversed by a review, and the order is a template. An outside review argued the static site was the retired one. Accepted uncritically, that would have discarded weeks of work. Rejected reflexively, it would have compounded a wrong foundation. Instead each claim was checked against the repository. Two assertions turned out to be wrong, the rest held, and the direction changed. The transferable part is the order: verify the claims, then decide, then record why, including which parts of the incoming argument did not survive. Otherwise, six months later, it reads as though there was never any doubt.",
      lanes: [
        {
          title: "Accepted uncritically",
          subtitle: ["Weeks of work discarded."],
          chain: ["The review's claim", "Accept", "Work discarded"],
          tone: "fault",
        },
        {
          title: "Rejected reflexively",
          subtitle: ["A wrong foundation compounds."],
          chain: ["The review's claim", "Reject", "Foundation compounds"],
          tone: "fault",
        },
        {
          title: "Checked against the repository",
          subtitle: ["Two assertions were wrong. The rest held."],
          chain: ["Verify the claims", "Decide", "Record why"],
        },
      ],
      takeaway: "Record which parts of the argument did not survive.",
      beats: [
        { at: 0.3, cue: "Accepted uncritically" },
        { at: 0.42, cue: "Rejected reflexively" },
        { at: 0.54, cue: "each claim was checked against the repository" },
        { at: 0.76, cue: "verify the claims, then decide, then record why" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where leadership fails",
      narration:
        "Six failure modes. Becoming the bottleneck: a queue of small reversible decisions with your name on it. Deciding by proximity instead of cost: attention goes to the loudest incident while the one-way door is walked through quietly. Being right in a way nobody can check: strong conclusions, unstated constraints, so people defer or route around you. Norms without mechanisms: we always write decision records holds for about a quarter. Hoarding the interesting work, which produces a team that cannot handle hard problems. And quality regressions with no owner: latency has a pager, model quality often has neither.",
      map: {
        places: [
          { id: "queue", label: ["Decision queue"], x: 0, y: 226, w: 250 },
          { id: "attention", label: ["Attention"], x: 290, y: 226, w: 250 },
          { id: "claims", label: ["Your claims"], x: 580, y: 226, w: 250 },
          { id: "norms", label: ["Norms"], x: 870, y: 226, w: 250 },
          { id: "work", label: ["Hard problems"], x: 1160, y: 226, w: 250 },
          { id: "quality", label: ["Model quality"], x: 1450, y: 226, w: 250 },
        ],
        links: [
          { from: "queue", to: "attention", arrow: "end" },
          { from: "attention", to: "claims", arrow: "end" },
          { from: "claims", to: "norms", arrow: "end" },
          { from: "norms", to: "work", arrow: "end" },
          { from: "work", to: "quality", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "queue",
          title: "Becoming the bottleneck",
          body: "A queue of small reversible decisions with your name on it.",
        },
        {
          at: "attention",
          title: "Deciding by proximity",
          body: "The loudest incident wins while the one-way door is walked through quietly.",
        },
        {
          at: "claims",
          title: "Right, but uncheckable",
          body: "Unstated constraints and no falsifying evidence. People defer or route around you.",
        },
        {
          at: "norms",
          title: "Norms without mechanisms",
          body: "A norm holds for about a quarter after you stop saying it.",
        },
        {
          at: "work",
          title: "Hoarding the interesting work",
          body: "A team that cannot handle hard problems, and a single point of failure with a calendar.",
        },
        {
          at: "quality",
          title: "Quality with no owner",
          body: "Latency has a pager. Model quality often has neither.",
        },
      ],
      beats: [
        { at: 0.07, cue: "Becoming the bottleneck" },
        { at: 0.2, cue: "Deciding by proximity instead of cost" },
        { at: 0.36, cue: "Being right in a way nobody can check" },
        { at: 0.54, cue: "Norms without mechanisms" },
        { at: 0.7, cue: "Hoarding the interesting work" },
        { at: 0.86, cue: "quality regressions with no owner" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "Three trade-offs to settle on purpose",
      narration:
        "Three trade-offs. Decide now, or gather evidence. Route by reversibility: two-way doors decide now, one-way doors buy the evidence, and you bound the gathering with a timebox, or more evidence becomes the decision. Consistency or autonomy. Set the small number of things that must be consistent, usually identity, observability and deployment, and let everything else vary. And mechanism or norm. A linter that is wrong five percent of the time gets disabled entirely, taking the other ninety-five percent with it. Automate invariants where a violation is unambiguous and costly, and leave judgement calls to review.",
      lanes: [
        {
          title: "Decide now, or gather evidence",
          subtitle: ["Two-way doors now. One-way doors buy evidence, timeboxed."],
          chain: ["Reversibility", "Decide or timebox", "Moves on"],
        },
        {
          title: "Consistency, or autonomy",
          subtitle: ["Consistent: identity, observability, deployment."],
          chain: ["A few shared things", "Defended hard", "The rest varies"],
        },
        {
          title: "Mechanism, or norm",
          subtitle: ["A linter wrong 5% of the time gets disabled entirely."],
          chain: ["Unambiguous and costly", "Automate it", "Judgement stays in review"],
        },
      ],
      takeaway: "Automate invariants. Leave judgement to review.",
      beats: [
        { at: 0.06, cue: "Decide now, or gather evidence" },
        { at: 0.34, cue: "Consistency or autonomy" },
        { at: 0.58, cue: "And mechanism or norm" },
        { at: 0.84, cue: "Automate invariants where" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. Route by reversibility, not importance: two-way doors belong to the team closest to them, and one-way doors earn writing and written objection. Disagree in a way that converges, by first naming whether it is a constraint, a conclusion, or a preference. And convert the norms that matter into mechanisms, because a norm nobody enforces is a preference, and a check that has never failed is indistinguishable from a check that cannot fail. Links are in the description.",
      points: [
        {
          statement: "Route by reversibility",
          support: "Two-way doors go to the closest team. One-way doors earn writing.",
          glyph: "gate",
        },
        {
          statement: "Disagree so it converges",
          support: "Name it first: a constraint, a conclusion, or a preference.",
          glyph: "split",
        },
        {
          statement: "Turn norms into mechanisms",
          support: "A check that fails the build. And one that has failed at least once.",
          glyph: "tick",
        },
      ],
      footer: "Next: write your next decision record with real Options and Consequences.",
      beats: [
        { at: 0.1, cue: "Route by reversibility, not importance" },
        { at: 0.4, cue: "Disagree in a way that converges" },
        { at: 0.66, cue: "convert the norms that matter into mechanisms" },
        { at: 0.92 },
      ],
    },
  ],
};
