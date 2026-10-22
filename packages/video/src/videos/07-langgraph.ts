import type { VideoScript } from "./types.ts";

/**
 * Module 7 — LangGraph. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/07-langgraph.mdx; the narration is the editable
 * artifact, and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const langgraph: VideoScript = {
  slug: "07-langgraph",
  module: "07",
  plate: "PLATE 07 · LANGGRAPH",
  chapter: "LangGraph",
  title: "LangGraph: one checkpoint, two superpowers",
  youtube: {
    titleSuffix: "LangGraph: one checkpoint, two superpowers",
    summary:
      "Why the agent loop is worth building as an explicit state graph: state and reducers, conditional edges, and how checkpointing after every step turns crash recovery and human approval into the same mechanism. Module 7 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 7 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/07-langgraph/",
      },
      {
        label: "Lab: LangGraph Checkpoint Cost",
        url: "https://handbook.vinodspattar.in/build/labs/langgraph-checkpoint-cost/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "LangGraph",
      "AI agents",
      "checkpointing",
      "human in the loop",
      "AI engineering",
      "system design",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "The run that could not resume",
      narration:
        "An agent is partway through a task when its process restarts. Everything it had done is gone, because its checkpoints lived in memory, and memory does not survive a restart. That is fine for local development, and wrong for production. Now notice something. The same mechanism that would have saved this run is also how you pause an agent before it sends an email, and wait for a human. This module is about that one mechanism.",
      map: {
        places: [
          { id: "run", label: ["Agent run"], x: 0, y: 226, w: 240 },
          { id: "step", label: ["Graph step"], x: 400, y: 70, w: 260, beat: 0 },
          { id: "mem", label: ["In-memory", "checkpointer"], x: 860, y: 70, w: 320, beat: 0 },
          { id: "restart", label: ["Process restarts"], x: 400, y: 384, w: 300, beat: 1 },
          { id: "lost", label: ["Nothing to resume"], x: 900, y: 384, w: 320, beat: 1 },
          { id: "human", label: ["Human approves"], x: 1360, y: 226, w: 340, beat: 2, tone: "ok" },
        ],
        links: [
          { from: "run", to: "step", beat: 0, arrow: "end" },
          { from: "step", to: "mem", beat: 0, arrow: "end" },
          { from: "run", to: "restart", beat: 1, arrow: "end" },
          { from: "restart", to: "lost", beat: 1, arrow: "end", tone: "fault" },
          { from: "mem", to: "human", beat: 2, arrow: "end", dashed: true, tone: "route" },
        ],
      },
      runs: [
        { beat: 0, paths: [["run", "step", "mem"]], results: ["ok"], marks: ["state saved"] },
        {
          beat: 1,
          paths: [["run", "restart", "lost"]],
          results: ["fail"],
          marks: ["state gone"],
        },
        { beat: 2, paths: [["mem", "human"]], results: ["ok"], marks: ["resume from checkpoint"] },
      ],
      captions: [
        "Each step saves state to an in-memory checkpointer.",
        "The process restarts, and in-memory state does not survive it.",
        "The same saved state is what lets a human approve and resume.",
      ],
      beats: [
        { at: 0 },
        { at: 0.2, cue: "when its process restarts" },
        { at: 0.58, cue: "Now notice something" },
      ],
    },
    {
      id: "mental",
      kind: "lanes",
      headline: "The loop from Module 5, as three concepts",
      narration:
        "Module 5 built the agent loop by hand. LangGraph expresses the same loop with three concepts. The shared context passed between steps becomes state, a typed structure that every node reads and updates. The decide and act steps become nodes, functions that compute a partial state update. And loop back or finish becomes edges, including conditional edges that inspect state to choose the next node. The shift that matters is not syntax. Control flow becomes data: a graph you can inspect, visualize, and checkpoint after every step, instead of logic that only exists while the process is running.",
      lanes: [
        {
          title: "State",
          subtitle: ["A typed structure every node reads and updates."],
          chain: ["Shared context", "State"],
        },
        {
          title: "Nodes",
          subtitle: ["Functions that compute a partial state update."],
          chain: ["Decide and act steps", "Nodes"],
        },
        {
          title: "Edges",
          subtitle: ["Conditional edges inspect state to pick the next node."],
          chain: ["Loop back or finish", "Edges"],
        },
      ],
      takeaway: "Control flow becomes data you can checkpoint.",
      beats: [
        { at: 0.18, cue: "The shared context passed between steps becomes state" },
        { at: 0.38, cue: "The decide and act steps become nodes" },
        { at: 0.56, cue: "And loop back or finish becomes edges" },
        { at: 0.76, cue: "Control flow becomes data" },
      ],
    },
    {
      id: "state",
      kind: "anatomy",
      headline: "A reducer decides how updates merge",
      narration:
        "Inside that state, each key can declare a reducer. A reducer controls how a node's partial update merges into what is already there. The default is overwrite. For a message history you declare an append reducer, here the add function on the messages list. A node does not return the full state, only a dictionary of updates, and the runtime merges them in through each key's reducer. Forget the append reducer on a list, and each node silently replaces the history instead of extending it. That is the most common LangGraph bug, and a single pass test run never shows it, because it only appears once the graph loops.",
      lines: [
        { text: "class AgentState(TypedDict):", group: "plain" },
        { text: "  messages: Annotated[list[str], add]", group: "route" },
        { text: "  steps_taken: int", group: "plain" },
        { text: "", group: "plain" },
        { text: "def decide(state: AgentState) -> dict:", group: "plain" },
        { text: "  return {", group: "meta" },
        { text: '    "messages": [next_message],', group: "meta" },
        { text: '    "steps_taken": state["steps_taken"] + 1,', group: "meta" },
        { text: "  }", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "The reducer",
          body: "Overwrite by default. Declare append on a message list, or each update replaces the history.",
        },
        {
          group: "meta",
          title: "A partial update",
          body: "A node returns only what changed. The runtime merges it through each key's reducer.",
        },
      ],
      beats: [
        { at: 0.16, cue: "A reducer controls how" },
        { at: 0.5, cue: "A node does not return the full state" },
      ],
    },
    {
      id: "graph",
      kind: "diagram",
      layout: "07-langgraph.checkpointed-graph",
      headline: "The same loop, with a checkpointer",
      narration:
        "Here is the graph. It starts at START and enters the decide node, which calls the model. From decide, a conditional edge sends control to a route function that inspects state. If a tool call was requested, the route goes to the tools node, which executes it and returns to decide. If the model gave a final answer, the route ends the run. This is Module 5's loop, with one addition. A checkpointer persists state after every node executes. After decide, and after tools, the full state is saved. And from that checkpoint, a run can resume after a crash or a human in the loop pause, by loading the checkpoint and carrying on from decide.",
      legend: [
        { kind: "place", label: "node" },
        { kind: "route", label: "control flow" },
        { kind: "store", label: "checkpointer" },
      ],
      steps: [
        { at: 0, show: ["START", "e1", "Decide"], focus: ["START", "e1", "Decide"] },
        {
          at: 0.17,
          cue: "a conditional edge sends control",
          show: ["Route", "e2"],
          focus: ["Decide", "e2", "Route"],
        },
        {
          at: 0.33,
          cue: "If a tool call was requested",
          show: ["Tools", "e3", "e5"],
          focus: ["Route", "e3", "Tools", "e5", "Decide"],
          camera: ["Decide", "Route", "Tools"],
        },
        {
          at: 0.5,
          cue: "If the model gave a final answer",
          show: ["END", "e4"],
          focus: ["Route", "e4", "END"],
        },
        {
          at: 0.63,
          cue: "A checkpointer persists state after every node",
          show: ["CP", "e6", "e7"],
          focus: ["CP", "e6", "e7", "Decide", "Tools"],
          camera: ["Decide", "Tools", "CP"],
        },
        {
          at: 0.82,
          cue: "And from that checkpoint",
          show: ["e8"],
          focus: ["CP", "e8", "Decide"],
          camera: ["Decide", "CP"],
        },
      ],
    },
    {
      id: "payoff",
      kind: "lanes",
      headline: "Two capabilities from one mechanism",
      narration:
        "Checkpointing is the actual payoff. After every super-step, the checkpointer persists the full state, keyed by a thread ID, and two capabilities fall out of that one mechanism. Crash recovery: resuming after a process restart means loading the last checkpoint for that thread ID. Human in the loop: compile the graph to interrupt before the send email node, and it pauses there, with the drafted email already in persisted state. A human reviews exactly what would be sent, and to whom. Approving resumes from that exact checkpoint. Rejecting updates state and routes elsewhere. Same mechanism, both times. Resume means load the checkpoint and continue.",
      lanes: [
        {
          title: "Crash recovery",
          subtitle: ["Load the last checkpoint for this thread ID."],
          chain: ["Process restarts", "Load last checkpoint", "Continue the run"],
        },
        {
          title: "Human in the loop",
          subtitle: ["Interrupt before send_email, with state persisted."],
          chain: ["Pause before send_email", "Human reviews state", "Continue from checkpoint"],
        },
      ],
      takeaway: "Resume means: load the checkpoint and continue.",
      beats: [
        { at: 0.22, cue: "Crash recovery: resuming" },
        { at: 0.44, cue: "Human in the loop: compile" },
        { at: 0.84, cue: "Resume means load the checkpoint" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Four places this breaks. First, a list in state with no reducer: the agent silently loses its message history on the very next node. Second, a conditional edge with no path to END, which is the runaway loop from Module 5. LangGraph's recursion limit is a backstop, not a substitute for an explicit step budget in the routing logic. Third, an in-memory checkpointer in production. Restart the process and every checkpoint is gone. Use SQLite for a single instance, and Postgres for anything replicated. And fourth, checkpoint cost. Every super-step re-persists the full state, so large objects in state are paid for on every single step.",
      map: {
        places: [
          { id: "state", label: ["State", "messages list"], x: 0, y: 226, w: 300, h: 100 },
          { id: "route", label: ["Conditional edge"], x: 450, y: 226, w: 320, h: 100 },
          { id: "cp", label: ["Checkpointer"], x: 920, y: 226, w: 300, h: 100 },
          { id: "write", label: ["Checkpoint write"], x: 1370, y: 226, w: 340, h: 100 },
        ],
        links: [
          { from: "state", to: "route", arrow: "end" },
          { from: "route", to: "cp", arrow: "end" },
          { from: "cp", to: "write", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "state",
          title: "No reducer on a list",
          body: "Each node's update replaces the message history instead of extending it.",
        },
        {
          at: "route",
          title: "No path to END",
          body: "A runaway loop. The recursion limit is a backstop, not a termination condition.",
        },
        {
          at: "cp",
          title: "In-memory checkpointer",
          body: "A restart loses every checkpoint. Production needs SQLite or Postgres.",
        },
        {
          at: "write",
          title: "Checkpoint cost",
          body: "Every step re-persists the full state, so large objects cost on every step.",
        },
      ],
      beats: [
        { at: 0.1, cue: "no reducer" },
        { at: 0.28, cue: "no path to END" },
        { at: 0.55, cue: "in-memory checkpointer in production" },
        { at: 0.82, cue: "checkpoint cost" },
      ],
    },
    {
      id: "cost",
      kind: "bars",
      headline: "What checkpointing costs as state grows",
      narration:
        "The Checkpoint Cost lab put bytes on that last failure. Over one hundred steps, a plain accumulating channel wrote about one point three four megabytes of checkpoints. The same run through a Delta Channel wrote about sixty kilobytes. That is quadratic against linear. So keep state lean: references or IDs, rather than full documents or large tool outputs. It is the same context growth concern from Module 5, now showing up as checkpoint write latency and storage cost, instead of prompt tokens.",
      items: [
        {
          label: "Plain accumulating channel",
          value: 1340,
          unit: "KB",
          note: "About 1.34 MB over 100 steps",
          tone: "fault",
        },
        {
          label: "DeltaChannel",
          value: 60,
          unit: "KB",
          note: "About 60 KB over the same 100 steps",
          tone: "route",
        },
      ],
      caption:
        "Bytes checkpointed over 100 steps, as measured in the LangGraph Checkpoint Cost lab.",
      beats: [
        { at: 0.2, cue: "a plain accumulating channel" },
        { at: 0.42, cue: "The same run through a Delta Channel" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "Choose the framework for the checkpoints",
      narration:
        "Three choices to make on purpose. A hand-rolled loop has no framework to learn and full control over every detail. A StateGraph costs that learning curve, and buys checkpointing, visualization, and human in the loop. If you need none of those, the hand-rolled loop is not a worse choice. It is a simpler one for a narrower job. Then the checkpointer backend. The in-memory saver is fast and needs no dependency, so it suits development and testing. A durable backend is required for anything long-running: SQLite for a single instance, Postgres for anything replicated, at the cost of a new dependency and a new failure mode.",
      lanes: [
        {
          title: "Hand-rolled loop",
          subtitle: ["No framework to learn. Full control of every detail."],
          chain: ["Bounded loop", "Simple, narrow job"],
        },
        {
          title: "StateGraph",
          subtitle: ["A learning curve buys checkpointing, visualization, human in the loop."],
          chain: ["State and nodes", "Checkpointer", "Resume and approve"],
        },
        {
          title: "Durable checkpointer",
          subtitle: ["A new dependency and a new failure mode."],
          chain: ["In-memory: development", "SQLite: one instance", "Postgres: replicated"],
        },
      ],
      takeaway: "The framework earns its complexity from checkpointing, not from the syntax.",
      beats: [
        { at: 0.1, cue: "A hand-rolled loop has no framework" },
        { at: 0.26, cue: "A StateGraph costs that learning curve" },
        { at: 0.58, cue: "Then the checkpointer backend" },
        { at: 0.88, cue: "a new failure mode" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: LangGraph turns control flow into data, with state, nodes and edges, and a reducer decides how every update merges. Two: checkpointing after every step is the payoff, and crash recovery and human approval are the same mechanism, load the checkpoint and continue. Three: in production, use a durable checkpointer, an explicit budget in the routing, and lean state. To put numbers on the cost, run the LangGraph Checkpoint Cost lab. Links are in the description.",
      points: [
        {
          statement: "Control flow becomes data",
          support: "State, nodes and edges. A reducer decides how each update merges.",
          glyph: "chain",
        },
        {
          statement: "One mechanism, two uses",
          support: "Crash recovery and human approval both load the checkpoint and continue.",
          glyph: "loop",
        },
        {
          statement: "Make production safe",
          support: "A durable checkpointer, an explicit step budget, and lean state.",
          glyph: "gate",
        },
      ],
      footer: "Next: the LangGraph Checkpoint Cost lab measures what per-step checkpointing costs.",
      beats: [
        { at: 0.1, cue: "turns control flow into data" },
        { at: 0.3, cue: "crash recovery and human approval are the same mechanism" },
        { at: 0.55, cue: "in production, use a durable checkpointer" },
        { at: 0.8, cue: "run the LangGraph Checkpoint Cost lab" },
      ],
    },
  ],
};
