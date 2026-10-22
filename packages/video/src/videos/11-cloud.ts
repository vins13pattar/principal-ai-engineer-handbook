import type { VideoScript } from "./types.ts";

/**
 * Module 11 — Cloud. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/11-cloud.mdx; the narration is the editable
 * artifact, and `at` values are fractions of a scene until narration timestamps replace them with cues.
 */
export const cloud: VideoScript = {
  slug: "11-cloud",
  module: "11",
  plate: "PLATE 11 · CLOUD",
  chapter: "Cloud",
  title: "Cloud architecture: a failover you have never run is a guess",
  youtube: {
    titleSuffix: "Cloud architecture: a failover you have never run is a guess",
    summary:
      "The cloud decisions that are expensive to reverse: managed against self-hosted, IAM as the real blast-radius control, what multi-region has to mean operationally, RTO and RPO, and cost attribution before the GPU bill arrives. Module 11 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 11 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/11-cloud/",
      },
      {
        label: "Lab: Region Failover Budget",
        url: "https://handbook.vinodspattar.in/build/labs/region-failover-budget/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: [
      "cloud architecture",
      "multi-region",
      "disaster recovery",
      "IAM",
      "RTO RPO",
      "AI infrastructure",
    ],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "The standby that had never been used",
      narration:
        "A team has a standby region. It has a replicated database and a load balancer, and it appears on the architecture diagram. Then the primary region fails, and traffic fails over for the very first time. A missing environment variable. An IAM role that was never replicated. Drift that nobody saw, because nobody had ever exercised the failover. A secondary region that has never been failed over to is an assumption, not a capability.",
      map: {
        places: [
          { id: "users", label: ["Traffic"], x: 0, y: 226, w: 240 },
          { id: "dns", label: ["Health-checked", "DNS"], x: 400, y: 226, w: 300, h: 100 },
          { id: "a", label: ["Region A", "primary"], x: 900, y: 70, w: 320, h: 100 },
          { id: "b", label: ["Region B", "standby"], x: 900, y: 384, w: 320, h: 100, beat: 1 },
          {
            id: "drift",
            label: ["Config drift", "found mid-incident"],
            x: 1360,
            y: 384,
            w: 340,
            h: 100,
            beat: 2,
            tone: "fault",
          },
        ],
        links: [
          { from: "users", to: "dns", arrow: "end" },
          { from: "dns", to: "a", arrow: "end" },
          { from: "dns", to: "b", beat: 1, arrow: "end", dashed: true },
          { from: "b", to: "drift", beat: 2, arrow: "end", tone: "fault" },
        ],
      },
      runs: [
        { beat: 0, paths: [["users", "dns", "a"]], results: ["ok"], marks: ["serving"] },
        { beat: 1, paths: [["users", "dns", "a"]], results: ["fail"], marks: ["primary is down"] },
        {
          beat: 2,
          paths: [["users", "dns", "b"]],
          results: ["fail"],
          marks: ["never exercised"],
        },
      ],
      captions: [
        "The primary region serves traffic. The standby sits on the diagram.",
        "The primary fails, and traffic fails over for the very first time.",
        "A missing variable. A role that was never replicated. An assumption, not a capability.",
      ],
      beats: [
        { at: 0 },
        { at: 0.26, cue: "Then the primary region fails" },
        { at: 0.5, cue: "A missing environment variable" },
      ],
    },
    {
      id: "buy",
      kind: "axis",
      headline: "Build or buy: control against burden",
      narration:
        "Every cloud decision in this module trades control for operational burden. Start with build versus buy. Self-hosting gives full control and usually lower steady-state cost at scale, and you own every failure mode. A managed vector database or managed Kubernetes control plane removes patching, high-availability maintenance and backup mechanics, at a real per-unit premium and with less control over tuning. The right default for most teams is managed, until a specific, measured reason justifies the switch. Cost at a scale you have actually reached, or a tuning need the managed tier cannot expose. Not the reverse.",
      ends: [
        "full control, every failure mode yours",
        "someone else owns availability and patching",
      ],
      stations: [
        {
          name: "Self-hosted",
          line: "Full control",
          detail: "Usually lower cost at scale. You own every failure mode.",
        },
        {
          name: "Managed",
          line: "Less to operate",
          detail: "Removes patching, HA maintenance and backups, at a per-unit premium.",
        },
      ],
      chip: {
        label: "Default",
        from: 1,
        to: 0,
        captions: ["Start managed", "Switch only for a measured reason"],
      },
      beats: [
        { at: 0.22, cue: "Self-hosting gives full control" },
        { at: 0.4, cue: "A managed vector database" },
        { at: 0.62, cue: "The right default for most teams" },
        { at: 0.76, cue: "until a specific, measured reason" },
      ],
    },
    {
      id: "layout",
      kind: "diagram",
      layout: "11-cloud.multi-region-architecture",
      headline: "Primary, standby, and an IAM boundary",
      narration:
        "Now the architecture. A global DNS or traffic manager, with health checks, sits in front. In normal operation it sends traffic to Region A, the primary. Inside the region, a load balancer fronts the app tier, which sits in a private subnet, and the app tier talks to the primary datastore. A NAT gateway sits beside it. Region B is the standby for disaster recovery, with the same shape: a load balancer, an app tier, and a replica datastore. If health checks fail, DNS fails over to Region B. Data reaches it through asynchronous cross-region replication. And IAM, with per-service roles and least privilege, scopes access to the app tier in both regions.",
      legend: [
        { kind: "place", label: "component" },
        { kind: "store", label: "datastore" },
        { kind: "route", label: "traffic or data" },
        { kind: "region", label: "a region" },
      ],
      steps: [
        { at: 0, show: ["DNS"], focus: ["DNS"], camera: ["DNS"] },
        {
          at: 0.15,
          cue: "sends traffic to Region A",
          show: ["RegionA", "ALBA", "e7"],
          focus: ["DNS", "e7", "ALBA"],
          camera: ["DNS", "ALBA"],
        },
        {
          at: 0.25,
          cue: "which sits in a private subnet",
          show: ["AppA", "e1"],
          focus: ["ALBA", "AppA", "e1"],
          camera: ["RegionA"],
        },
        {
          at: 0.35,
          cue: "talks to the primary datastore",
          show: ["DataA", "e2"],
          focus: ["AppA", "DataA", "e2"],
          camera: ["RegionA"],
        },
        {
          at: 0.43,
          cue: "A NAT gateway sits beside it",
          show: ["NATA", "e3"],
          focus: ["NATA", "AppA", "e3"],
          camera: ["RegionA"],
        },
        {
          at: 0.5,
          cue: "Region B is the standby",
          show: ["RegionB", "ALBB", "AppB", "DataB", "NATB", "e4", "e5", "e6"],
          focus: ["RegionB", "ALBB", "AppB", "DataB", "NATB", "e4", "e5", "e6"],
          camera: ["RegionB"],
        },
        {
          at: 0.66,
          cue: "fails over to Region B",
          show: ["e8"],
          focus: ["DNS", "e8", "ALBB"],
          camera: ["DNS", "RegionB"],
        },
        {
          at: 0.77,
          cue: "asynchronous cross-region replication",
          show: ["e9"],
          focus: ["DataA", "e9", "DataB"],
          camera: ["DataA", "DataB"],
        },
        {
          at: 0.86,
          cue: "with per-service roles and least privilege",
          show: ["IAM", "e10", "e11"],
          focus: ["IAM", "e10", "e11", "AppA", "AppB"],
          camera: ["DNS", "RegionA", "RegionB", "IAM"],
        },
      ],
    },
    {
      id: "iam",
      kind: "lanes",
      headline: "IAM decides the blast radius",
      narration:
        "A load balancer and a private subnet control network reachability. IAM controls what a compromised service can actually do once it is running, and that is usually the more consequential boundary. Public subnets should hold little more than load balancers and NAT gateways, with application and data tiers kept private. But IAM is the real blast-radius control. A per-service role, scoped to exactly the resources that service needs, one object prefix, one table, one key, means a compromised service can reach only what its role permits. A shared, broadly scoped role means compromising any one service compromises all of them. The module's example policy is scoped to exactly two resources. Secrets belong in a managed store with scoped access too.",
      lanes: [
        {
          title: "Per-service role",
          subtitle: ["Scoped to exactly what that service needs."],
          chain: [
            "One service compromised",
            "Its own scoped role",
            "Only that service's resources",
          ],
        },
        {
          title: "Shared broad role",
          subtitle: ["Easy to set up once. Costly in an incident."],
          chain: ["One service compromised", "The shared role", "Everything it can reach"],
          tone: "fault",
        },
      ],
      takeaway: "Network segmentation alone does not contain a running service.",
      beats: [
        { at: 0.36, cue: "A per-service role" },
        { at: 0.5, cue: "A shared, broadly scoped role" },
        { at: 0.9 },
      ],
    },
    {
      id: "rpo",
      kind: "bars",
      headline: "A target the replication cannot meet",
      narration:
        "Recovery, not just redundancy. Recovery Time Objective is how long you can be down. Recovery Point Objective is how much data you can afford to lose, measured in time. These numbers should come from the business impact of an outage, not from whatever the architecture happens to deliver. Take a team that commits to a fifteen-minute RTO and a one-minute RPO. A one-minute RPO needs synchronous or near-synchronous replication for anything that cannot lose a minute of data. Asynchronous replication with a ten-minute lag, however inexpensive, structurally cannot meet it, no matter how fast the failover is. Teams pick a comfortable-sounding target, build with a strategy that cannot deliver it, and discover the gap during a real incident.",
      items: [
        {
          label: "Committed RPO",
          value: 1,
          unit: "min",
          note: "What the team promised",
          tone: "route",
        },
        {
          label: "Async replication lag",
          value: 10,
          unit: "min",
          note: "What the strategy delivers",
          tone: "fault",
        },
      ],
      caption: "The module's example: a one-minute RPO against a ten-minute replication lag.",
      beats: [
        { at: 0.52, cue: "and a one-minute RPO" },
        { at: 0.74, cue: "with a ten-minute lag" },
      ],
    },
    {
      id: "controller",
      kind: "anatomy",
      headline: "A failover trigger tied to the RTO",
      narration:
        "Make the trigger executable. The module's failover controller records health checks, and fails over only when every check inside the RTO window has failed. A single blip does not trigger it, and sustained failure does. The Region Failover Budget lab then measured what that paragraph left out. Detection alone takes the whole window, and promotion, traffic shift and loading the model onto the standby's GPUs all come after it, so a window equal to the RTO overruns the RTO. Size the window from what the RTO leaves after those stages. And the line that returns false when there are no recent checks reads silence as health. A region that goes dark, taking its prober with it, is never failed over. Count a probe that was due and never arrived as a failure.",
      lines: [
        { text: "def should_failover(self, now):", group: "plain" },
        { text: "  window_start = now - self.rto", group: "route" },
        { text: "  recent = [c for c in self.checks", group: "route" },
        { text: "            if c.timestamp >= window_start]", group: "route" },
        { text: "  if not recent:", group: "meta" },
        { text: "    return False", group: "meta" },
        { text: "  return all(not c.healthy for c in recent)", group: "route" },
      ],
      notes: [
        {
          group: "route",
          title: "The window equals the RTO",
          body: "Detection spends the whole window, so promotion and traffic shift overrun the RTO.",
        },
        {
          group: "meta",
          title: "Silence reads as healthy",
          body: "A region that goes dark is never failed over. Count a missing probe as a failure.",
        },
      ],
      beats: [
        { at: 0.28, cue: "Detection alone takes the whole window" },
        { at: 0.7, cue: "reads silence as health" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where cloud architecture breaks",
      narration:
        "Four failures. An untested failover: configuration drift between primary and standby, a missing variable or a role that was never replicated, surfaces for the first time during a real incident. A broad IAM role shared across services, so the least secure service that uses it exposes everything the role can reach. Replication lag beyond the committed RPO, so a failover recovers to a point further back than promised. That is a data loss incident on top of an availability incident, and it stays silent until tested. And a public subnet placement by oversight, which makes a service directly reachable from the internet, whatever its application authentication.",
      map: {
        places: [
          { id: "standby", label: ["Standby region"], x: 0, y: 226, w: 340 },
          { id: "role", label: ["Shared IAM role"], x: 480, y: 226, w: 330 },
          { id: "repl", label: ["Replication"], x: 950, y: 226, w: 300 },
          { id: "subnet", label: ["Public subnet"], x: 1390, y: 226, w: 320 },
        ],
        links: [
          { from: "standby", to: "role", arrow: "end" },
          { from: "role", to: "repl", arrow: "end" },
          { from: "repl", to: "subnet", arrow: "end" },
        ],
      },
      hazards: [
        {
          at: "standby",
          title: "Untested failover",
          body: "Drift between primary and standby surfaces for the first time in a real incident.",
        },
        {
          at: "role",
          title: "Broad shared IAM role",
          body: "The least secure service using it exposes everything it can reach.",
        },
        {
          at: "repl",
          title: "Lag beyond the RPO",
          body: "A failover recovers further back than promised. Silent until tested.",
        },
        {
          at: "subnet",
          title: "Public by oversight",
          body: "Directly reachable from the internet, whatever the application authentication.",
        },
      ],
      beats: [
        { at: 0.08, cue: "An untested failover" },
        { at: 0.3, cue: "role shared across services" },
        { at: 0.5, cue: "Replication lag beyond the committed RPO" },
        { at: 0.78, cue: "a public subnet placement by oversight" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "Choose against the commitment",
      narration:
        "Two trade-offs to make on purpose. Synchronous replication can meet a tight RPO, but adds write latency and availability risk, because a write cannot complete if the remote region is unreachable. Asynchronous replication keeps write latency local, but caps the RPO at however far behind replication runs. So the choice has to be driven by the committed RPO, not picked independently of it. And cost attribution. Cloud spend without tagging is a single number nobody can act on. Tags are cheaper to retrofit, but depend on discipline that erodes. Separate accounts or projects per team enforce cost, and often security, boundaries structurally, at the price of more infrastructure-as-code overhead. Attribute cost before a GPU bill becomes the reason a project is cancelled.",
      lanes: [
        {
          title: "Synchronous replication",
          subtitle: ["Can meet a tight RPO. Adds write latency and availability risk."],
          chain: ["Write", "Wait for the remote region", "Tight RPO"],
        },
        {
          title: "Asynchronous replication",
          subtitle: ["Keeps writes local. Caps the RPO at the lag."],
          chain: ["Write", "Stay local", "RPO equals the lag"],
        },
        {
          title: "Tags or accounts",
          subtitle: ["Tags erode. Accounts enforce boundaries, at more code to manage."],
          chain: ["Per-resource tags", "Dedicated accounts"],
        },
      ],
      beats: [
        { at: 0.1, cue: "Synchronous replication can meet" },
        { at: 0.3, cue: "Asynchronous replication keeps write latency local" },
        { at: 0.58, cue: "And cost attribution" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to take away. One: untested disaster recovery is not disaster recovery. Set RTO and RPO from business impact, choose a replication strategy that can hit the RPO, and prove it by running a real failover. Two: IAM scoping, not the network alone, is what contains a breach. Three: default to managed until a measured reason says otherwise, and attribute cost before the bill arrives. To see the failover budget measured, run the Region Failover Budget lab. Links are in the description.",
      points: [
        {
          statement: "Run the failover",
          support:
            "RTO and RPO from business impact, a replication strategy that can hit them, and a real test.",
          glyph: "loop",
        },
        {
          statement: "Scope the identity",
          support: "A per-service IAM role limits what a compromised service can do.",
          glyph: "gate",
        },
        {
          statement: "Buy first, attribute early",
          support: "Managed until a measured reason. Cost tagged before the GPU bill arrives.",
          glyph: "split",
        },
      ],
      footer:
        "Next: run the Region Failover Budget lab and see where an RTO-sized window goes wrong.",
      beats: [
        { at: 0.1, cue: "untested disaster recovery is not disaster recovery" },
        { at: 0.36, cue: "scoping, not the network alone" },
        { at: 0.56, cue: "default to managed" },
        { at: 0.8, cue: "run the Region Failover Budget lab" },
      ],
    },
  ],
};
