import type { VideoScript } from "./types.ts";

/**
 * Module 6 — MCP. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/06-mcp.mdx; the narration is the editable artifact,
 * and `at` values are fractions of a scene until narration timestamps replace them.
 */
export const mcp: VideoScript = {
  slug: "06-mcp",
  tag: "MODULE 06",
  chapter: "MCP",
  title: "MCP: why the protocol went stateless",
  scenes: [
    {
      id: "problem",
      kind: "fanout",
      headline: "Every app, every tool: one custom integration each",
      narration:
        "Before the Model Context Protocol, connecting a model to your tools meant writing a custom integration for every pair. A filesystem integration for one application, a GitHub integration for another, and neither reusable by anyone else. MCP standardizes that connection. You write an integration once, as a server, and any compliant host can use it. But the most instructive thing about MCP right now isn't the standard itself. It's what its July 2026 revision changed, because that change is a distributed systems lesson in disguise.",
    },
    {
      id: "roles",
      kind: "diagram",
      layout: "hostClientServer",
      headline: "One client per server",
      narration:
        "MCP splits the system into three roles, and the split is the whole design. The host is the application running the conversation, an IDE or a chat client. Inside it, a client manages the connection to exactly one server. A server is a separate process exposing capabilities, and the guidance is one small, focused server per integration. Here the filesystem server speaks JSON-RPC over stdio, while the GitHub server speaks it over Streamable HTTP, so nothing forces every server onto the same transport. Because each connection is its own client, a misbehaving server only affects its own client, not the whole host. The host then aggregates everything, tools, resources and prompts, into one context for the model.",
      steps: [
        { at: 0, show: ["Host", "C1", "C2"], focus: ["Host"] },
        { at: 0.36, show: ["S1", "e1"], focus: ["C1", "S1", "e1"] },
        { at: 0.5, show: ["S2", "e2"], focus: ["C2", "S2", "e2"] },
        {
          at: 0.82,
          show: ["Model", "e3"],
          focus: ["Host", "Model", "e3"],
          camera: ["Host", "C1", "C2", "S1", "S2", "Model", "e1", "e2", "e3"],
        },
      ],
    },
    {
      id: "primitives",
      kind: "cards",
      headline: "Who decides to invoke it?",
      narration:
        "Servers expose three kinds of capability, and what matters is who decides to use each one. Tools are model-controlled: the model decides to call them, the same function-calling mechanics as Module 5, standardized across servers. Resources are application-controlled data, like files or database rows, that the host decides to attach to context. Prompts are user-controlled templates, often surfaced as slash commands, that the user decides to run. That is a security boundary, not just a taxonomy. Expose read this file as a resource and the host stays in control. Expose it as a tool and you have handed the model the decision.",
      columns: 3,
      at: [0.2, 0.42, 0.6],
      cards: [
        {
          title: "Tools",
          kicker: "The model decides",
          body: "Function calls, standardized across servers",
        },
        {
          title: "Resources",
          kicker: "The application decides",
          body: "Files, database rows, search results",
        },
        { title: "Prompts", kicker: "The user decides", body: "Templates, often slash commands" },
      ],
      footer:
        "“Read this file” as a resource keeps the host in control. As a tool, the model decides.",
    },
    {
      id: "stateless",
      kind: "diagram",
      layout: "statelessRouting",
      headline: "Removing the handshake",
      narration:
        "Now the change. Under the previous revision, a connection began with an initialize handshake and a session ID. Every later request had to return to the same server instance, because that instance held the session state. So the load balancer needed sticky routing, and instance B could never pick up where A left off. That is the exact lesson of Module 2 about state ownership, arriving as a protocol redesign. The 2026-07-28 revision removes the handshake and the session. Every request now carries what the server needs, so the load balancer can route on headers alone, and any instance can serve any request. Rolling deploys get easier, and there is no session store to operate or leak.",
      steps: [
        { at: 0, show: ["Before", "BC", "BLB", "e1"], focus: ["Before"], camera: ["Before"] },
        { at: 0.2, show: ["BS1", "e2"], focus: ["BLB", "BS1", "e2"], camera: ["Before"] },
        { at: 0.36, show: ["BS2", "e3"], focus: ["BLB", "BS2", "e3"], camera: ["Before"] },
        {
          at: 0.5,
          show: ["After", "AC", "ALB", "e4", "e8"],
          focus: ["After", "AC", "ALB", "e4"],
          camera: ["After"],
        },
        {
          at: 0.7,
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
          at: 0.3,
        },
        {
          group: "meta",
          title: "Self-describing",
          body: "Version, client, and capabilities travel on every request.",
          at: 0.62,
        },
      ],
    },
    {
      id: "failures",
      kind: "cards",
      headline: "Where it breaks",
      narration:
        "Four failure modes are worth knowing. Tool poisoning: a server writes a tool description that manipulates the model, and descriptions are part of the model's context. Trusting model arguments: validate every tools slash call against your own schema, always. Trusting headers without checking the body: a server that never verifies Mcp-Method and Mcp-Name against the body lets a caller route a request as a cheap operation while executing an expensive one, and the specification requires servers to reject disagreement. And session assumptions carried into a stateless server: a cached identity or capability set that works on one replica in development, then fails intermittently behind a load balancer in production.",
      columns: 2,
      at: [0.1, 0.32, 0.5, 0.78],
      cards: [
        {
          title: "Tool poisoning",
          kicker: "Descriptions are model context",
          body: "A server can write a description that steers the model beyond what the tool does.",
          tone: "danger",
        },
        {
          title: "Trusting model arguments",
          kicker: "Validate server-side, always",
          body: "The schema constrains a well-behaved client, not what the server received.",
          tone: "danger",
        },
        {
          title: "Headers that disagree with the body",
          kicker: "Reject the mismatch",
          body: "Route as a cheap call, execute an expensive one. The specification requires rejection.",
          tone: "danger",
        },
        {
          title: "Session assumptions",
          kicker: "Fine on one replica",
          body: "Cached identity or capabilities fail intermittently behind a load balancer.",
          tone: "danger",
        },
      ],
    },
    {
      id: "tradeoffs",
      kind: "compare",
      headline: "Two decisions to make on purpose",
      narration:
        "Two decisions to make on purpose. First, transport. stdio is the simplest: no network, no authentication, and the process lifecycle is the connection, but it only works for a server running beside the host. Streamable HTTP serves remote and shared servers, at the cost of real authentication and the routing headers. The older HTTP plus SSE transport is deprecated, so it is not a third option for new work. Second, statelessness costs bytes on every request. Behind a load balancer that is clearly worth it. For a local stdio server that was never going to be load balanced, it is pure overhead.",
      left: {
        title: "stdio",
        rows: [
          { label: "Network", value: "None" },
          { label: "Authentication", value: "Not needed" },
          { label: "Connection", value: "The process lifecycle" },
          { label: "Reach", value: "Local to the host only" },
        ],
      },
      right: {
        title: "Streamable HTTP",
        rows: [
          { label: "Network", value: "Remote and shared" },
          { label: "Authentication", value: "Required" },
          { label: "Connection", value: "Self-describing requests" },
          { label: "Reach", value: "Many hosts, one server" },
        ],
      },
      footer:
        "HTTP+SSE is deprecated · Stateless costs bytes per request, buys scaling without affinity",
      at: [0.1, 0.34, 0.8],
    },
    {
      id: "recap",
      kind: "cards",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: MCP separates host, client and server, with one client per server connection. Two: tools, resources and prompts differ by who decides to invoke them, and that is a security boundary. Three: the 2026-07-28 revision removed the handshake and the session, so every request is self-describing and any instance can serve it. To go further, build the multi-tenant MCP server lab, and test the statelessness yourself by round-robining requests across replicas. Links are in the description.",
      columns: 3,
      at: [0.1, 0.3, 0.52],
      cards: [
        {
          title: "1 · Three roles",
          kicker: "Host, client, server",
          body: "One client per server connection.",
        },
        {
          title: "2 · Three owners",
          kicker: "Model, application, user",
          body: "Who invokes it is a security boundary.",
        },
        {
          title: "3 · No session",
          kicker: "Self-describing requests",
          body: "Any instance can serve any request.",
        },
      ],
      footer: "Lab: Multi-Tenant MCP Server · Module 6 and transcript on the handbook site",
    },
  ],
};
