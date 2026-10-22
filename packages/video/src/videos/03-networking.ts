import type { VideoScript } from "./types.ts";

/**
 * Module 3 — Networking. Every claim is drawn from
 * apps/handbook/src/content/docs/learn/modules/03-networking.mdx and its streaming-path diagram.
 */
export const networking: VideoScript = {
  slug: "03-networking",
  module: "03",
  plate: "PLATE 03 · NETWORKING",
  chapter: "Networking",
  title: "Networking: why streaming silently breaks",
  youtube: {
    titleSuffix: "Networking: why streaming silently breaks",
    summary:
      "The setup cost every connection pays, why time to first token beats total duration, the path a streamed response takes, and the buffering proxies, head-of-line blocking and idle timeouts that break it. Module 3 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 3 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/03-networking/",
      },
      {
        label: "Lab: Async AI Gateway",
        url: "https://handbook.vinodspattar.in/build/labs/async-ai-gateway/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "networking",
      "streaming",
      "server-sent events",
      "HTTP/2",
      "load balancing",
      "time to first token",
      "AI infrastructure",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "Perfect locally, one silent block in production",
      narration:
        "You stream a response token by token, and in local development it looks perfect. In production, the same response arrives as one silent block. A reverse proxy somewhere in the path has response buffering switched on. It collects the entire upstream response before forwarding any of it. Streaming never reached the user. It is the single most common way streaming quietly breaks, and it is invisible locally, where the client talks straight to the gateway.",
      map: {
        places: [
          { id: "gw", label: ["Gateway"], x: 0, y: 226, w: 260 },
          { id: "proxy", label: ["Buffering proxy"], x: 640, y: 70, w: 340, beat: 1 },
          { id: "browser", label: ["Browser"], x: 1330, y: 226, w: 260 },
        ],
        links: [
          { from: "gw", to: "browser", beat: 0, arrow: "end", label: "local development" },
          { from: "gw", to: "proxy", beat: 1, arrow: "end" },
          { from: "proxy", to: "browser", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        { beat: 0, paths: [["gw", "browser"]], results: ["ok"] },
        {
          beat: 1,
          paths: [["gw", "proxy", "browser"]],
          results: ["stall"],
          marks: ["one silent block"],
        },
      ],
      captions: [
        "In local development the client talks straight to the gateway, and tokens stream.",
        "In production a proxy with response buffering sits in the path.",
        "The whole response arrives at once, after a silent wait.",
      ],
      beats: [
        { at: 0 },
        { at: 0.3, cue: "A reverse proxy somewhere in the path" },
        { at: 0.6, cue: "Streaming never reached the user" },
      ],
    },
    {
      id: "setup",
      kind: "axis",
      headline: "Setup cost comes before work cost",
      narration:
        "Every network request pays a setup cost before it pays a work cost. A fresh secure connection pays, in order, DNS resolution, unless it is cached. Then the TCP handshake, one round trip. Then the TLS handshake, one round trip for TLS one point three. That is easily two to three round trips of pure setup before any application data moves, and for short requests the setup often dominates. Reusing the connection with keep-alive amortizes that cost across many requests, which makes it the single highest-leverage optimization in this module. A service that does not reuse connections pays the whole setup on every single call.",
      ends: ["setup cost", "work cost"],
      stations: [
        { name: "DNS", line: "Resolve the name", detail: "Skipped when cached" },
        { name: "TCP", line: "Handshake: one round trip", detail: "Before any data moves" },
        {
          name: "TLS",
          line: "Handshake: one round trip on TLS 1.3",
          detail: "Before any data moves",
        },
        {
          name: "Your request",
          line: "Application data moves",
          detail: "Only now does work begin",
        },
      ],
      beats: [
        { at: 0.2, cue: "unless it is cached" },
        { at: 0.29, cue: "round trip. Then the" },
        { at: 0.36, cue: "one round trip for" },
        { at: 0.46, cue: "easily two to three" },
      ],
    },
    {
      id: "firstbyte",
      kind: "bars",
      headline: "A fast first token beats a fast total",
      narration:
        "For streaming, add a second mental model. Time to first byte, or first token, is a separate and often more important metric than total duration. Take a response that takes eight seconds in total, but starts streaming within two hundred milliseconds. To a user watching text appear, it feels fast. Now take a response that takes three seconds in total, but arrives as one block after a three second silence. It feels slow, even though it is objectively faster end to end.",
      items: [
        { label: "Streamed: total", value: 8, unit: "s", tone: "normal" },
        {
          label: "Streamed: first token",
          value: 0.2,
          unit: "s",
          note: "feels fast",
          tone: "route",
        },
        { label: "One block: total", value: 3, unit: "s", tone: "normal" },
        { label: "One block: first byte", value: 3, unit: "s", note: "feels slow", tone: "fault" },
      ],
      max: 8,
      caption: "The module's worked example: seconds to total, and seconds to the first byte.",
      beats: [
        { at: 0.34, cue: "takes eight seconds in total" },
        { at: 0.43, cue: "within two hundred milliseconds" },
        { at: 0.64, cue: "takes three seconds in total" },
        { at: 0.76, cue: "after a three second silence" },
      ],
    },
    {
      id: "path",
      kind: "diagram",
      headline: "The path of a streamed response",
      narration:
        "Here is the path a streamed response takes. The client connects to the edge using TLS one point three with keep-alive. The edge hands the request to a layer seven load balancer, which passes it to the gateway, serving a text event-stream. The gateway sends token by token chunks back through the load balancer, through the edge, to the client. Two decisions are explicit. Every hop between the gateway and the client has to forward bytes as they arrive, and a single buffering proxy anywhere defeats streaming for every request that passes through it. And the gateway checks for a disconnect on every chunk, so a client that leaves stops the gateway from pulling, and paying for, tokens.",
      layout: "03-networking.streaming-path",
      legend: [
        { kind: "place", label: "hop" },
        { kind: "route", label: "streamed bytes" },
      ],
      steps: [
        { at: 0, show: ["Client", "Edge", "e1"], focus: ["Client", "Edge", "e1"] },
        {
          at: 0.19,
          cue: "The edge hands the request",
          show: ["LB", "e2"],
          focus: ["Edge", "LB", "e2"],
        },
        {
          at: 0.28,
          cue: "which passes it to the gateway",
          show: ["GW", "e3"],
          focus: ["LB", "GW", "e3"],
        },
        {
          at: 0.39,
          cue: "token by token chunks",
          show: ["e4", "e5", "e6"],
          focus: ["GW", "LB", "Edge", "Client", "e4", "e5", "e6"],
        },
        { at: 0.67, cue: "a single buffering proxy", show: [], focus: ["Edge"] },
        { at: 0.81, cue: "checks for a disconnect", show: [], focus: ["GW", "e4"] },
      ],
    },
    {
      id: "disconnect",
      kind: "anatomy",
      headline: "Check for a disconnect on every chunk",
      narration:
        "The disconnect check is a few lines. For each chunk the gateway yields, the endpoint asks whether the client has disconnected, and breaks if so. It checks on every chunk, not once at the start, because a client can leave at any point. Picture a user closing the tab three seconds into a ten second response. Without the check, the gateway keeps pulling tokens for the full ten seconds, burning metered compute on a response nobody will see. With it, the gateway notices on the very next chunk. And first-token time is recorded as its own percentile distribution, apart from total duration, so a dashboard can tell streams that start slowly from streams that run long.",
      lines: [
        { text: "async for chunk in gateway.stream(prompt):", group: "plain" },
        { text: "    if await request.is_disconnected():", group: "route" },
        { text: "        break", group: "route" },
        { text: "    yield format_sse_chunk(chunk)", group: "plain" },
        { text: "", group: "plain" },
        { text: "first_token_ms.append(now - started_at)", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "Checked on every chunk",
          body: "A client can leave at any point. Stop pulling tokens nobody will read.",
        },
        {
          group: "meta",
          title: "First token is its own metric",
          body: "Tracked with its own percentiles, apart from total stream duration.",
        },
      ],
      beats: [
        { at: 0.2, cue: "It checks on every chunk" },
        { at: 0.73, cue: "And first-token time is recorded" },
      ],
    },
    {
      id: "protocols",
      kind: "lanes",
      headline: "The least demanding protocol wins",
      narration:
        "Which streaming protocol? Server-sent events is the simplest option for one-directional, server-to-client token streaming. It is plain HTTP, it works through most existing HTTP infrastructure, and browsers reconnect automatically. WebSockets give full bidirectional communication, but every intermediary must explicitly support the protocol upgrade, and some proxies and load balancers need extra configuration. Streaming over gRPC is efficient and strongly typed, but it requires HTTP two end to end, including through any intermediary. For a one-directional completion stream, server-sent events is the right default, specifically because of how little it demands from the path in between.",
      lanes: [
        {
          title: "Server-sent events",
          subtitle: ["One direction. Plain HTTP that most infrastructure already passes."],
          chain: ["Gateway", "text/event-stream", "Browser"],
        },
        {
          title: "WebSockets",
          subtitle: ["Both directions. Proxies and balancers may need extra configuration."],
          chain: ["Gateway", "Protocol upgrade", "Browser"],
        },
        {
          title: "gRPC streaming",
          subtitle: ["Efficient and typed. The biggest operational ask of the three."],
          chain: ["Gateway", "HTTP/2 end to end", "Client"],
          tone: "fault",
        },
      ],
      takeaway: "Default to server-sent events for one-way token streams.",
      beats: [
        { at: 0.02, cue: "Server-sent events is the simplest option" },
        { at: 0.33, cue: "WebSockets give full bidirectional" },
        { at: 0.58, cue: "is efficient and strongly typed" },
        { at: 0.87, cue: "specifically because of how little" },
      ],
    },
    {
      id: "blocking",
      kind: "lanes",
      headline: "One lost packet, many stalled streams",
      narration:
        "Versions of HTTP differ in what one lost packet costs. HTTP one point one sends one request at a time per connection, so clients open several connections for concurrency. HTTP two multiplexes many requests over one TCP connection. But because it is still built on TCP, a single lost packet stalls every multiplexed stream on that connection until it is retransmitted. That is head-of-line blocking, shared by streams that have nothing to do with each other. HTTP three, built on QUIC over UDP, gives each stream independent loss recovery, so a lost packet only stalls the stream it belonged to. For many concurrent streaming completions over a shared connection, this is where it matters most.",
      lanes: [
        {
          title: "HTTP/2 over TCP",
          subtitle: ["Many streams, one connection."],
          chain: ["Stream A", "One TCP connection", "Stream B"],
          routeLabel: "one lost packet stalls both",
          tone: "fault",
        },
        {
          title: "HTTP/3 over QUIC",
          subtitle: ["Each stream recovers on its own."],
          chain: ["Stream A", "QUIC over UDP", "Stream B"],
          routeLabel: "independent loss recovery",
        },
      ],
      takeaway: "Shared connections matter most for many concurrent streams.",
      beats: [
        { at: 0.29, cue: "multiplexes many requests" },
        { at: 0.75, cue: "gives each stream independent loss recovery" },
        { at: 0.93, cue: "this is where it matters most" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where it breaks",
      narration:
        "Five failure modes. Buffering proxies: response buffering, a common default, collects the whole response before forwarding anything, and it is invisible in local development. Head-of-line blocking: one lost packet makes a completely unrelated stream stutter every other stream sharing the connection. Overly aggressive DNS caching: a client caching an address past its time to live keeps routing to a dead backend after a failover, which looks like the new backend not working. Idle timeouts: a load balancer with a shorter idle timeout than the client's keep-alive assumption closes connections the client believes are open, producing intermittent resets. And the cold connection tax. If median latency looks suspiciously close to connection setup time, check that first.",
      map: {
        places: [
          { id: "dns", label: ["DNS cache"], x: 0, y: 226, w: 250 },
          { id: "cold", label: ["New connection"], x: 369, y: 226, w: 250 },
          { id: "shared", label: ["Shared connection"], x: 738, y: 226, w: 250 },
          { id: "proxy", label: ["Edge proxy"], x: 1107, y: 226, w: 250 },
          { id: "lb", label: ["Load balancer"], x: 1476, y: 226, w: 250 },
        ],
        links: [
          { from: "dns", to: "cold", arrow: "end" },
          { from: "cold", to: "shared", arrow: "end" },
          { from: "shared", to: "proxy", arrow: "end" },
          { from: "proxy", to: "lb", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "proxy",
          title: "Buffering proxies",
          body: "The whole response is held, then sent at once. Invisible in local development.",
        },
        {
          at: "shared",
          title: "Head-of-line blocking",
          body: "One lost packet stutters every stream on the connection.",
        },
        {
          at: "dns",
          title: "Aggressive DNS caching",
          body: "Traffic keeps going to a dead backend past the time to live.",
        },
        {
          at: "lb",
          title: "Idle timeouts",
          body: "A shorter timeout than the client assumes causes intermittent resets.",
        },
        {
          at: "cold",
          title: "Cold-connection tax",
          body: "Full setup on every call, often costing more than the work.",
        },
      ],
      beats: [
        { at: 0.02, cue: "Buffering proxies" },
        { at: 0.19, cue: "Head-of-line blocking: one lost packet" },
        { at: 0.35, cue: "Overly aggressive" },
        { at: 0.62, cue: "Idle timeouts" },
        { at: 0.83, cue: "And the cold connection tax" },
      ],
    },
    {
      id: "balancing",
      kind: "lanes",
      headline: "Layer four and layer seven",
      narration:
        "Load balancing comes in two layers. A layer four balancer routes on IP and port without looking at application content. It is fast and low-overhead, but blind to what is in the request, so there is no routing by tenant or API version. A layer seven balancer can route on headers, paths or even request content, at the cost of terminating and inspecting more of the connection, which is added latency and CPU per request. Many production topologies use both: layer four at the edge for raw throughput, and layer seven behind it where the smarter decisions need to happen.",
      lanes: [
        {
          title: "Layer 4",
          subtitle: ["Fast and low-overhead. Blind to request content."],
          chain: ["Client", "IP and port", "Backend"],
        },
        {
          title: "Layer 7",
          subtitle: ["Route by tenant or API version. Costs latency and CPU."],
          chain: ["Client", "Headers, paths, content", "Backend"],
        },
      ],
      takeaway: "Many topologies use both: layer 4 at the edge, layer 7 behind it.",
      beats: [
        { at: 0.05, cue: "A layer four balancer routes" },
        { at: 0.43, cue: "A layer seven balancer can route" },
        { at: 0.74, cue: "Many production topologies use both" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. One: setup cost comes before work cost, so reuse connections, and track time to first token as its own metric. Two: every hop between the gateway and the client must forward bytes as they arrive, and the gateway must check for a disconnect on every chunk. Three: choose the protocol that demands least from the path, which for one-way token streams is server-sent events. To go further, put nginx in front of the gateway's stream endpoint, watch it buffer, then switch buffering off. Links are in the description.",
      points: [
        {
          statement: "Setup cost comes first",
          support: "Reuse connections. Track time to first token apart from total duration.",
          glyph: "tick",
        },
        {
          statement: "Every hop must forward bytes",
          support: "One buffering proxy defeats streaming. Check for a disconnect on every chunk.",
          glyph: "chain",
        },
        {
          statement: "Ask the least of the path",
          support: "Server-sent events is the default for one-way token streams.",
          glyph: "gate",
        },
      ],
      footer: "Next: Module 4 builds the AI platform stack around the gateway.",
      beats: [
        { at: 0.05, cue: "setup cost comes before work cost" },
        { at: 0.25, cue: "every hop between the gateway" },
        { at: 0.52, cue: "choose the protocol" },
        { at: 0.72, cue: "To go further, put nginx" },
      ],
    },
  ],
};
