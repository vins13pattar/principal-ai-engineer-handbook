import type { VideoScript } from "./types.ts";

/**
 * Module 12 — Observability. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/12-observability.mdx.
 */
export const observability: VideoScript = {
  slug: "12-observability",
  module: "12",
  plate: "PLATE 12 · OBSERVABILITY",
  chapter: "Observability",
  title: "Observability: signals that can lie",
  youtube: {
    titleSuffix: "Observability: signals that can lie",
    summary:
      "Metrics, logs and traces for AI systems, why a fast, cheap, wrong answer is invisible to all three, how SLO burn-rate alerting cuts noise, and why a green build is a signal that can lie. Module 12 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 12 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/12-observability/",
      },
      {
        label: "Lab: SLO-Driven AI Operations",
        url: "https://handbook.vinodspattar.in/build/labs/slo-driven-ai-operations/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "observability",
      "SLO",
      "distributed tracing",
      "AI engineering",
      "CI",
      "principal engineer",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Green, and nothing ran",
      narration:
        "A lab was published labelled production-ready. Its build was green. But the job had left out a dependency extra, so pytest's collection aborted before a single test ran. Behind that green check sat thirteen type errors and a failing test. A pipeline that ran its tests and one that skipped them emit the same signal. This module is about signals that can lie, in production and in the pipeline.",
      map: {
        places: [
          { id: "change", label: ["A change"], x: 0, y: 226, w: 240 },
          { id: "ci", label: ["CI job"], x: 400, y: 226, w: 240, beat: 0 },
          { id: "badge", label: ["Green check"], x: 860, y: 70, w: 280, beat: 0 },
          { id: "suite", label: ["Test suite"], x: 860, y: 384, w: 280, beat: 1 },
        ],
        links: [
          { from: "change", to: "ci", beat: 0, arrow: "end" },
          { from: "ci", to: "badge", beat: 0, arrow: "end" },
          { from: "ci", to: "suite", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        { beat: 0, paths: [["change", "ci", "badge"]], results: ["ok"] },
        {
          beat: 1,
          paths: [["change", "ci", "suite"]],
          results: ["stall"],
          marks: ["not one test ran"],
        },
      ],
      captions: [
        "Labelled production-ready. The build was green.",
        "The job left out a dependency extra, so collection aborted before a single test ran.",
        "Ran its tests or skipped them: the same green signal.",
      ],
      beats: [
        { at: 0 },
        { at: 0.3, cue: "before a single test ran" },
        { at: 0.64, cue: "emit the same signal" },
      ],
    },
    {
      id: "signals",
      kind: "anatomy",
      prose: true,
      headline: "Three signals, and one they cannot see",
      narration:
        "Three signals, correlated by a shared identifier, cover most production debugging. Metrics are aggregated numbers over time: request rate, error rate, latency percentiles. They tell you something is wrong right now, but not what happened to one request. Logs are structured events carrying a request ID, tying them to the same request across every service. Traces are a tree of timed spans, the only signal that shows causality and sequencing directly. But all three describe how a request executed. None describes whether the answer was correct. A model that hallucinates confidently returns a normal response, a normal latency, and a clean trace. So AI systems need a fourth signal: evaluation, monitored on its own.",
      lines: [
        { text: "Metrics: aggregated numbers over time", group: "route" },
        { text: "Logs: structured events with a request ID", group: "route" },
        { text: "Traces: a tree of timed spans", group: "route" },
        { text: "", group: "plain" },
        { text: "Evals: was the answer correct?", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "How it executed",
          body: "Rate, errors, latency, the call graph. A confident wrong answer looks clean here.",
        },
        {
          group: "meta",
          title: "Whether it was right",
          body: "Evaluation runs as its own, separately monitored signal.",
        },
      ],
      beats: [
        { at: 0.1, cue: "Metrics are aggregated numbers" },
        { at: 0.72, cue: "need a fourth signal" },
      ],
    },
    {
      id: "pipeline",
      kind: "diagram",
      headline: "One request, three correlated signals",
      narration:
        "Here is one request producing all of it. It reaches an instrumented service. That service emits structured logs, R E D metrics, and spans in one trace. The root span is handle request, with a nested model call span carrying tokens, cost and model, and a tool call span beneath it. For an agent that fans out into many calls, those nested spans are what make one slow step visible. Everything flows into a collector, then into a log store, a metrics store and a trace store. The metrics store feeds SLO burn-rate alerting. The trace store feeds debugging, one request ID, every span. And the eval harness joins separately, a quality signal that is not request scoped, feeding the same alerting layer.",
      layout: "12-observability.signal-pipeline",
      legend: [
        { kind: "place", label: "component" },
        { kind: "route", label: "signal path" },
        { kind: "store", label: "store" },
        { kind: "region", label: "three signals, one request" },
      ],
      steps: [
        { at: 0, show: ["Req", "Svc", "e1"], focus: ["Req", "Svc", "e1"], camera: ["Req", "Svc"] },
        {
          at: 0.1,
          cue: "That service emits structured logs",
          show: ["Signals", "Logs", "Metrics", "SpanRoot", "e2", "e3", "e4"],
          focus: ["Svc", "Logs", "Metrics", "SpanRoot", "e2", "e3", "e4"],
          camera: ["Svc", "Logs", "Metrics", "SpanRoot"],
        },
        {
          at: 0.28,
          cue: "The root span is handle request",
          show: ["SpanLLM", "SpanTool", "e5", "e6"],
          focus: ["SpanRoot", "SpanLLM", "SpanTool", "e5", "e6"],
          camera: ["SpanRoot", "SpanLLM", "SpanTool"],
        },
        {
          at: 0.5,
          cue: "Everything flows into a collector",
          show: [
            "Collector",
            "LogStore",
            "MetricStore",
            "TraceStore",
            "e7",
            "e8",
            "e9",
            "e10",
            "e11",
            "e12",
          ],
          focus: ["Collector", "LogStore", "MetricStore", "TraceStore", "e10", "e11", "e12"],
          camera: ["Collector", "LogStore", "MetricStore", "TraceStore"],
        },
        {
          at: 0.7,
          cue: "The metrics store feeds",
          show: ["SLO", "Debug", "e13", "e14"],
          focus: ["MetricStore", "TraceStore", "SLO", "Debug", "e13", "e14"],
          camera: ["MetricStore", "TraceStore", "SLO", "Debug"],
        },
        {
          at: 0.84,
          cue: "the eval harness joins separately",
          show: ["EvalHarness", "e15"],
          focus: ["EvalHarness", "SLO", "e15"],
          camera: ["Collector", "EvalHarness", "SLO", "Debug"],
        },
      ],
    },
    {
      id: "burn",
      kind: "lanes",
      headline: "Page on the trend, not the blip",
      narration:
        "To know when something is wrong, use SLIs, SLOs and error budgets. An SLI is a measured metric, such as ninety-ninth percentile latency. An SLO is the target, say under 800 milliseconds over a rolling 28 days. The error budget is how much violation you can afford. Alerting on every threshold crossing, a single slow request or one error, produces so much noise that on-call engineers start ignoring pages. Alerting on burn rate, how fast the budget is being consumed, separates a blip from a trend that will actually exhaust it.",
      lanes: [
        {
          title: "Alert on every threshold crossing",
          subtitle: ["A single slow request. One error."],
          chain: ["One slow request", "Page", "Noise, ignored"],
          tone: "fault",
        },
        {
          title: "Alert on SLO burn rate",
          subtitle: ["How fast the error budget is being consumed."],
          chain: ["Error budget", "Burn rate", "Page on a trend"],
        },
      ],
      takeaway: "Fewer, more actionable pages.",
      beats: [
        { at: 0.5, cue: "Alerting on every threshold crossing" },
        { at: 0.72, cue: "Alerting on burn rate" },
        { at: 0.9, cue: "a trend that will actually exhaust it" },
      ],
    },
    {
      id: "green",
      kind: "anatomy",
      prose: true,
      headline: "Green is a claim, not proof",
      narration:
        "The pipeline that guards your system is a system too, and green is its dashboard. A red build is looked at within minutes, because someone is blocked. A false green is looked at by nobody, because nothing is blocked. So CI correctness is four claims, and the exit code establishes only the first: the check succeeded. It does not prove the check actually executed, that it covered the scope you believed, or that unexpected skips were surfaced. Exit code zero proves the process considered itself successful. It does not prove any tests were discovered.",
      lines: [
        { text: "1  The check succeeded", group: "route" },
        { text: "", group: "plain" },
        { text: "2  The check actually executed", group: "meta" },
        { text: "3  It covered the scope you believed", group: "meta" },
        { text: "4  Unexpected skips were surfaced", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "What exit code zero proves",
          body: "The process it invoked considered itself successful.",
        },
        {
          group: "meta",
          title: "What it does not prove",
          body: "That tests were discovered, that the checker was aimed at your change, or that nothing was skipped.",
        },
      ],
      beats: [
        { at: 0.34, cue: "the exit code establishes only the first" },
        { at: 0.58, cue: "It does not prove the check actually executed" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where observability breaks",
      narration:
        "Five failure modes. Broken trace context across an async boundary: a background task started without carrying the trace context produces an orphan span, and no error says why. Unredacted prompts reaching the log store: an access policy applied afterwards cannot retract data already stored. Cardinality explosion: a raw user ID as a metric label multiplies time series until the backend degrades. A quality regression that nothing else alerted on: requests stay fast and return successes while answers get worse. And a green pipeline that validated nothing: discovery returns nothing, cases skip themselves, the checker is aimed elsewhere, or a failure is swallowed on purpose.",
      map: {
        places: [
          { id: "request", label: ["Request"], x: 0, y: 226, w: 220 },
          { id: "async", label: ["Background task"], x: 300, y: 226, w: 260 },
          { id: "logs", label: ["Log store"], x: 640, y: 226, w: 220 },
          { id: "metrics", label: ["Metrics"], x: 940, y: 226, w: 220 },
          { id: "answers", label: ["Answers"], x: 1240, y: 226, w: 220 },
          { id: "pipeline", label: ["Pipeline"], x: 1540, y: 226, w: 188 },
        ],
        links: [
          { from: "request", to: "async", arrow: "end" },
          { from: "async", to: "logs", arrow: "end" },
          { from: "logs", to: "metrics", arrow: "end" },
          { from: "metrics", to: "answers", arrow: "end" },
          { from: "answers", to: "pipeline", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "async",
          title: "Broken trace context",
          body: "No trace context across an async boundary leaves an orphan span and no error.",
        },
        {
          at: "logs",
          title: "Unredacted prompts",
          body: "An access policy cannot retract data already stored unredacted.",
        },
        {
          at: "metrics",
          title: "Cardinality explosion",
          body: "A raw user ID as a label multiplies time series until the backend degrades.",
        },
        {
          at: "answers",
          title: "Invisible quality regression",
          body: "Fast 200s, worse answers. Only an eval signal sees it.",
        },
        {
          at: "pipeline",
          title: "Green, validated nothing",
          body: "Zero discovery, self-skipping cases, a checker aimed elsewhere.",
        },
      ],
      beats: [
        { at: 0.06, cue: "Broken trace context across an async boundary" },
        { at: 0.24, cue: "Unredacted prompts reaching the log store" },
        { at: 0.42, cue: "Cardinality explosion" },
        { at: 0.58, cue: "A quality regression that nothing else alerted on" },
        { at: 0.8, cue: "a green pipeline that validated nothing" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "What you pay to see",
      narration:
        "Two trade-offs. Tracing every request gives complete visibility, but cost grows with traffic. Sampling keeps cost bounded, by recording a percentage, or by always recording errors and slow requests, at the risk of missing the one request an investigation needs. And evaluation: running the harness continuously against live traffic catches regressions faster, but costs compute on every request path. Periodic batch evaluation against a held-out sample is cheaper, but detects a regression only as fast as the cadence. The right choice depends on how costly a live regression is to leave undetected.",
      lanes: [
        {
          title: "Trace every request",
          subtitle: ["Complete visibility. Cost grows with traffic."],
          chain: ["Every request", "Trace store", "Cost scales"],
        },
        {
          title: "Sample the traces",
          subtitle: ["Bounded cost. May miss the request you need."],
          chain: ["Errors and slow requests", "Sample", "Trace store"],
        },
        {
          title: "Batch evaluation",
          subtitle: ["Cheaper. Only as fast as the cadence."],
          chain: ["Held-out sample", "Periodic eval", "Alert"],
        },
      ],
      takeaway: "Pick by what a miss would cost.",
      beats: [
        { at: 0.08, cue: "Tracing every request" },
        { at: 0.3, cue: "Sampling keeps cost bounded" },
        { at: 0.66, cue: "Periodic batch evaluation" },
        { at: 0.88, cue: "how costly a live regression" },
      ],
    },
    {
      id: "expiry",
      kind: "lanes",
      headline: "Trust has an expiry",
      narration:
        "Trust has an expiry. A green build can be wrong because the expected checks never ran. A status such as approved can be wrong because its evidence went stale: the review was valid, the window lapsed, nobody owned revalidation, and the label stayed. Both are one defect. The label no longer describes reality, and nothing is required to notice. So treat production-ready or human-approved as derived states backed by dated evidence. Say a review is required every 30 days. The wrong design leaves the status approved when 30 days pass. The right design makes it review-expired, and the next deploy asks for revalidation. Point ownership at a role or rotation, not a person's name. And fail closed where the control guards something irreversible.",
      lanes: [
        {
          title: "Wrong",
          subtitle: ["The status stays approved."],
          chain: ["Review completed", "30 days pass", "Still approved"],
          tone: "fault",
        },
        {
          title: "Right",
          subtitle: ["The status becomes review-expired."],
          chain: ["Review completed", "30 days pass", "Revalidate on next deploy"],
        },
      ],
      takeaway: "Expiry must produce a distinct state.",
      beats: [
        { at: 0.62, cue: "The wrong design leaves" },
        { at: 0.74, cue: "The right design makes it" },
        { at: 0.92, cue: "fail closed where the control guards" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. First, metrics, logs and traces describe how a request executed, not whether the answer was right, so run evaluation as its own monitored signal, and page on error budget burn rate. Second, green is a claim, not proof. Ask a pipeline how many tests it discovered and ran, and what it declined to run. Third, trust expires. Back every status with dated evidence and an owner that resolves to a role. To go further, build the SLO-driven AI operations lab. Links are in the description.",
      points: [
        {
          statement: "Evaluation is its own signal",
          support:
            "Metrics, logs and traces cannot see a wrong answer. Page on error budget burn rate.",
          glyph: "split",
        },
        {
          statement: "Green is a claim, not proof",
          support: "Show how many tests were discovered and run, and what was skipped.",
          glyph: "tick",
        },
        {
          statement: "Trust has an expiry",
          support: "Dated evidence, a defined validity period, and an owner that is a role.",
          glyph: "loop",
        },
      ],
      footer: "Next: build the SLO-Driven AI Operations lab.",
      beats: [
        { at: 0.1, cue: "metrics, logs and traces describe how a request executed" },
        { at: 0.46, cue: "green is a claim, not proof" },
        { at: 0.7, cue: "Third, trust expires" },
        { at: 0.9, cue: "operations lab" },
      ],
    },
  ],
};
