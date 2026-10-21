import type { VideoScript } from "./types.ts";

/**
 * Module 6 — MCP. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/06-mcp.mdx; the narration is the editable artifact,
 * and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const mcp: VideoScript = {
  slug: "06-mcp",
  module: "06",
  plate: "PLATE 06 · MCP",
  chapter: "MCP",
  title: "MCP: why the protocol went stateless",
  youtube: {
    titleSuffix: "MCP: why the protocol went stateless",
    summary:
      "How the Model Context Protocol splits host, client and server, who decides to invoke each primitive, and why its 2026-07-28 revision removed the handshake and the session. Module 6 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 6 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/06-mcp/",
      },
      {
        label: "Lab: Multi-Tenant MCP Server",
        url: "https://handbook.vinodspattar.in/build/labs/multi-tenant-mcp-server/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "MCP",
      "Model Context Protocol",
      "AI engineering",
      "distributed systems",
      "system design",
      "stateless",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "custom",
      component: "mcp-hook",
      headline: "Fine on one replica. Broken behind a load balancer.",
      narration:
        "It works on your laptop. Put it behind a load balancer, and it fails, but only sometimes. One replica holds your session. The others have never heard of it. The 2026 revision of MCP removes the session behind that failure. Here is how.",
      beats: [
        { at: 0 },
        { at: 0.2, cue: "Put it behind a load balancer" },
        { at: 0.52, cue: "One replica holds your session" },
        { at: 0.76, cue: "removes the session behind that failure" },
      ],
    },
    {
      id: "problem",
      kind: "custom",
      component: "mcp-bridges",
      headline: "Every app, every tool: one custom bridge each",
      narration:
        "Before the Model Context Protocol, connecting a model to your tools meant writing a custom integration for every pair. A filesystem integration for one application, a GitHub integration for another, and neither reusable by anyone else. MCP standardizes that connection. You write an integration once, as a server, and any compliant host can use it. But the most instructive thing about MCP right now isn't the standard itself. It's what its July 2026 revision changed, because that change is a distributed systems lesson in disguise.",
      beats: [{ at: 0 }, { at: 0.3, cue: "standardizes that connection" }],
    },
    {
      id: "roles",
      kind: "diagram",
      layout: "06-mcp.host-client-server",
      headline: "One client per server",
      narration:
        "MCP splits the system into three roles, and the split is the whole design. The host is the application running the conversation, an IDE or a chat client. Inside it, a client manages the connection to exactly one server. A server is a separate process exposing capabilities, and the guidance is one small, focused server per integration. Here the filesystem server speaks JSON-RPC over stdio, while the GitHub server speaks it over Streamable HTTP, so nothing forces every server onto the same transport. Because each connection is its own client, a misbehaving server only affects its own client, not the whole host. The host then aggregates everything, tools, resources and prompts, into one context for the model.",
      legend: [
        { kind: "place", label: "component" },
        { kind: "route", label: "active connection" },
        { kind: "region", label: "the host" },
      ],
      steps: [
        { at: 0, show: ["Host", "C1", "C2"], focus: ["Host"] },
        {
          at: 0.36,
          cue: "Here the filesystem server",
          show: ["S1", "e1"],
          focus: ["C1", "S1", "e1"],
        },
        { at: 0.5, cue: "while the GitHub server", show: ["S2", "e2"], focus: ["C2", "S2", "e2"] },
        {
          at: 0.82,
          cue: "The host then aggregates everything",
          show: ["Model", "e3"],
          focus: ["Host", "Model", "e3"],
          camera: ["Host", "C1", "C2", "S1", "S2", "Model", "e1", "e2", "e3"],
        },
      ],
    },
    {
      id: "primitives",
      kind: "custom",
      component: "mcp-spectrum",
      headline: "Who decides to invoke it?",
      narration:
        "Servers expose three kinds of capability, and what matters is who decides to use each one. Tools are model-controlled: the model decides to call them, the same function-calling mechanics as Module 5, standardized across servers. Resources are application-controlled data, like files or database rows, that the host decides to attach to context. Prompts are user-controlled templates, often surfaced as slash commands, that the user decides to run. That is a security boundary, not just a taxonomy. Expose read this file as a resource and the host stays in control. Expose it as a tool and you have handed the model the decision.",
      beats: [
        { at: 0.04, cue: "Tools are model-controlled" },
        { at: 0.3, cue: "Resources are application-controlled" },
        { at: 0.5, cue: "Prompts are user-controlled" },
        { at: 0.7, cue: "Expose read this file as a resource" },
        { at: 0.85, cue: "Expose it as a tool" },
      ],
    },
    {
      id: "stateless",
      kind: "diagram",
      layout: "06-mcp.stateless-routing",
      headline: "Removing the handshake",
      narration:
        "Now the change. Under the previous revision, a connection began with an initialize handshake and a session ID. Every later request had to return to the same server instance, because that instance held the session state. So the load balancer needed sticky routing, and instance B could never pick up where A left off. That is the exact lesson of Module 2 about state ownership, arriving as a protocol redesign. The 2026-07-28 revision removes the handshake and the session. Every request now carries what the server needs, so the load balancer can route on headers alone, and any instance can serve any request. Rolling deploys get easier, and there is no session store to operate or leak.",
      blocked: ["e3"],
      legend: [
        { kind: "place", label: "component" },
        { kind: "route", label: "request path" },
        { kind: "blocked", label: "cannot route here" },
        { kind: "region", label: "protocol revision" },
      ],
      steps: [
        { at: 0, show: ["Before", "BC", "BLB", "e1"], focus: ["Before"], camera: ["Before"] },
        {
          at: 0.2,
          cue: "Every later request had to return",
          show: ["BS1", "e2"],
          focus: ["BLB", "BS1", "e2"],
          camera: ["Before"],
        },
        {
          at: 0.36,
          cue: "instance B could never pick up",
          show: ["BS2", "e3"],
          focus: ["BLB", "BS2", "e3"],
          camera: ["Before"],
        },
        {
          at: 0.5,
          cue: "revision removes the handshake",
          show: ["After", "AC", "ALB", "e4", "e8"],
          focus: ["After", "AC", "ALB", "e4"],
          camera: ["After"],
        },
        {
          at: 0.7,
          cue: "route on headers alone",
          show: ["AS1", "AS2", "AS3", "e5", "e6", "e7"],
          focus: ["ALB", "AS1", "AS2", "AS3", "e5", "e6", "e7"],
          camera: ["After"],
        },
      ],
    },
    {
      id: "anatomy",
      kind: "anatomy",
      headline: "Every request describes itself",
      narration:
        "So what does a request carry? Two things. First, headers: Mcp-Method on every request, and Mcp-Name on the ones that name a specific tool, resource or prompt. That lets a gateway or rate limiter route and meter without parsing the body. Second, the protocol version, client information and client capabilities travel in _meta on every request, instead of being negotiated once. A client that wants capabilities up front calls server slash discover explicitly. The cost is repetition: a few extra bytes on every call, in exchange for no affinity and no session store.",
      lines: [
        { text: "# Streamable HTTP request", group: "plain" },
        { text: "Mcp-Method: tools/call", group: "route" },
        { text: "Mcp-Name: <tool name>", group: "route" },
        { text: "", group: "plain" },
        { text: "body._meta {", group: "meta" },
        { text: "  io.modelcontextprotocol/protocolVersion", group: "meta" },
        { text: "  io.modelcontextprotocol/clientInfo", group: "meta" },
        { text: "  io.modelcontextprotocol/clientCapabilities", group: "meta" },
        { text: "}", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Routable",
          body: "Gateways and rate limiters decide without parsing the body.",
        },
        {
          group: "meta",
          title: "Self-describing",
          body: "Version, client, and capabilities travel on every request.",
        },
      ],
      beats: [
        { at: 0.3, cue: "First, headers" },
        { at: 0.62, cue: "Second, the protocol version" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Four failure modes are worth knowing. Tool poisoning: a server writes a tool description that manipulates the model, and descriptions are part of the model's context. Trusting model arguments: validate every tools slash call against your own schema, always. Trusting headers without checking the body: a server that never verifies Mcp-Method and Mcp-Name against the body lets a caller route a request as a cheap operation while executing an expensive one, and the specification requires servers to reject disagreement. And session assumptions carried into a stateless server: a cached identity or capability set that works on one replica in development, then fails intermittently behind a load balancer in production.",
      map: {
        regions: [{ title: "Server instance", x: 1034, y: 82, w: 694, h: 366 }],
        places: [
          { id: "model", label: ["Model"], x: 0, y: 226, w: 210, h: 90 },
          { id: "host", label: ["Host", "with clients"], x: 294, y: 226, w: 250, h: 90 },
          { id: "lb", label: ["Load balancer"], x: 644, y: 226, w: 250, h: 90 },
          { id: "desc", label: ["tool descriptions"], x: 1064, y: 146, w: 634, h: 70 },
          { id: "call", label: ["tools/call handler"], x: 1064, y: 246, w: 634, h: 70 },
          { id: "state", label: ["cached session state"], x: 1064, y: 346, w: 634, h: 70 },
        ],
        links: [
          { from: "model", to: "host", arrow: "both" },
          { from: "host", to: "lb", arrow: "both" },
          { from: "lb", to: "call", arrow: "both" },
        ],
      },
      hazards: [
        {
          at: "desc",
          title: "Tool poisoning",
          body: "A server can write a description that steers the model beyond what the tool does.",
        },
        {
          at: "call",
          title: "Trusting model arguments",
          body: "Validate every tools/call against your own schema, always.",
        },
        {
          at: "lb",
          title: "Headers that disagree with the body",
          body: "Route as a cheap call, execute an expensive one. The specification requires rejection.",
        },
        {
          at: "state",
          title: "Session assumptions",
          body: "Cached identity or capabilities work on one replica, then fail behind a load balancer.",
        },
      ],
      beats: [
        { at: 0.1, cue: "Tool poisoning" },
        { at: 0.32, cue: "Trusting model arguments" },
        { at: 0.5, cue: "Trusting headers without checking the body" },
        { at: 0.78, cue: "session assumptions carried into a stateless server" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "custom",
      component: "mcp-routes",
      headline: "Two decisions to make on purpose",
      narration:
        "Two decisions to make on purpose. First, transport. stdio is the simplest: no network, no authentication, and the process lifecycle is the connection, but it only works for a server running beside the host. Streamable HTTP serves remote and shared servers, at the cost of real authentication and the routing headers. The older HTTP plus SSE transport is deprecated, so it is not a third option for new work. Second, statelessness costs bytes on every request. Behind a load balancer that is clearly worth it. For a local stdio server that was never going to be load balanced, it is pure overhead.",
      beats: [
        { at: 0.1, cue: "is the simplest" },
        { at: 0.34, cue: "serves remote and shared servers" },
        { at: 0.6, cue: "transport is deprecated" },
        { at: 0.8, cue: "Second, statelessness costs bytes" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: MCP separates host, client and server, with one client per server connection. Two: tools, resources and prompts differ by who decides to invoke them, and that is a security boundary. Three: the 2026-07-28 revision removed the handshake and the session, so every request is self-describing and any instance can serve it. To go further, build the multi-tenant MCP server lab, and test the statelessness yourself by round-robining requests across replicas. Links are in the description.",
      points: [
        {
          statement: "Three roles, one client per server",
          support: "Host, client, and server. Each connection gets its own client.",
        },
        {
          statement: "Three owners decide who invokes",
          support: "Tools: the model. Resources: the application. Prompts: the user.",
        },
        {
          statement: "No session: any instance can answer",
          support: "Self-describing requests let any replica serve any request.",
        },
      ],
      footer: "Next: build the Multi-Tenant MCP Server lab and round-robin it across replicas.",
      beats: [
        { at: 0.1, cue: "separates host, client and server" },
        { at: 0.3, cue: "differ by who decides to invoke them" },
        { at: 0.52, cue: "removed the handshake and the session" },
        { at: 0.75, cue: "build the multi-tenant" },
      ],
    },
  ],
};
