import type { VideoScript } from "./types.ts";

/**
 * Module 15 — Agent Identity. Every claim below is drawn from
 * apps/handbook/src/content/docs/learn/modules/15-agent-identity.mdx.
 */
export const agentIdentity: VideoScript = {
  slug: "15-agent-identity",
  module: "15",
  plate: "PLATE 15 · AGENT IDENTITY",
  chapter: "Agent Identity",
  title: "Agent identity: on whose authority, and as whom",
  youtube: {
    titleSuffix: "Agent identity: on whose authority, and as whom",
    summary:
      "Why an agent should never carry the user's token, how token exchange mints short-lived, audience-bound agent credentials, and the five checks a remote MCP server must run on every request. Module 15 of the Principal AI Engineer Handbook.",
    links: [
      {
        label: "Module 15 (written, with transcript)",
        url: "https://handbook.vinodspattar.in/learn/modules/15-agent-identity/",
      },
      {
        label: "Lab: Policy-Gated Tool Runtime",
        url: "https://handbook.vinodspattar.in/build/labs/policy-gated-tool-runtime/",
      },
      { label: "Full handbook", url: "https://handbook.vinodspattar.in/" },
    ],
    tags: ["agent identity", "OAuth", "token exchange", "MCP", "confused deputy", "AI security"],
  },
  scenes: [
    {
      id: "hook",
      kind: "story",
      headline: "One stolen token",
      narration:
        "The easiest thing to build is an agent that carries the user's token and acts as the user everywhere. That makes the agent's blast radius the user's entire permission set. So ask the design review question: if I steal one token from this system, what can I do with it, where, and for how long? Under blanket delegation, the answer is anything the user can do, on any service, until they log out. This module replaces that default.",
      map: {
        places: [
          { id: "token", label: ["The user's token"], x: 0, y: 226, w: 280 },
          { id: "agent", label: ["The agent"], x: 420, y: 226, w: 240, beat: 0 },
          { id: "billing", label: ["Billing service"], x: 860, y: 40, w: 300, beat: 0 },
          { id: "crm", label: ["CRM service"], x: 860, y: 226, w: 300, beat: 1 },
          { id: "other", label: ["Any other service"], x: 860, y: 412, w: 300, beat: 1 },
        ],
        links: [
          { from: "token", to: "agent", beat: 0, arrow: "end" },
          { from: "agent", to: "billing", beat: 0, arrow: "end" },
          { from: "agent", to: "crm", beat: 1, arrow: "end" },
          { from: "agent", to: "other", beat: 1, arrow: "end" },
        ],
      },
      runs: [
        { beat: 0, paths: [["token", "agent", "billing"]], results: ["ok"] },
        {
          beat: 1,
          paths: [
            ["token", "agent", "crm"],
            ["token", "agent", "other"],
          ],
          results: ["fail", "fail"],
          marks: ["anything the user can do", "anything the user can do"],
        },
      ],
      captions: [
        "The agent carries the user's token and acts as the user.",
        "Its blast radius is the user's entire permission set.",
        "Anything the user can do, on any service, until they log out.",
      ],
      beats: [
        { at: 0 },
        { at: 0.32, cue: "if I steal one token from this system" },
        { at: 0.6, cue: "until they log out" },
      ],
    },
    {
      id: "dimensions",
      kind: "lanes",
      headline: "Narrow each dimension on its own",
      narration:
        "Authentication asks who is calling. Authorization asks what they may do. Agents add a third question: who is acting, on whose behalf, and for how long? A token is a claim about a subject, addressed to an audience, valid for a scope, until an expiry. Blanket delegation collapses three of the four. The audience becomes anything downstream, the scope becomes everything the user has, and the expiry becomes the user's session. An agent-scoped credential keeps the user as subject, with the agent named as actor, addressed to one server, for the tools this task needs, for minutes. Narrowing each dimension independently is the entire discipline.",
      lanes: [
        {
          title: "Blanket delegation",
          subtitle: ["A bearer credential of enormous blast radius."],
          chain: [
            "Subject: the user",
            "Audience: whatever accepts it",
            "Scope: the full permission set",
            "Lifetime: the session",
          ],
          tone: "fault",
        },
        {
          title: "Agent-scoped credential",
          subtitle: ["Narrowed on every dimension."],
          chain: [
            "Subject: the user, agent as actor",
            "Audience: one named server",
            "Scope: the tools this task needs",
            "Lifetime: minutes",
          ],
        },
      ],
      takeaway: "Narrow each dimension independently.",
      beats: [
        { at: 0.4, cue: "Blanket delegation collapses three of the four" },
        { at: 0.62, cue: "An agent-scoped credential keeps the user as subject" },
        { at: 0.9, cue: "Narrowing each dimension independently" },
      ],
    },
    {
      id: "exchange-flow",
      kind: "diagram",
      headline: "Passthrough, or token exchange",
      narration:
        "Here is the flow. The user authenticates through the identity provider, and the host receives a user token whose audience is the host. Now the agent has to call a remote server. There are two ways. The first is what most systems do first, and what the specification forbids: forward the user's token unchanged. The server sees an audience of the host, not itself, and must reject it. That is the confused deputy. The other branch is token exchange. The host posts to the token endpoint with the user token as subject, the server's canonical address as the resource, and only the scope this task needs. The authorization server returns an agent token. The agent calls the server with it as a bearer token. The server validates signature, issuer, expiry, audience and scope. If any check fails, the answer is a 401 or 403 and no tool runs. If all pass, the tool executes, and the audit log records the agent and the user.",
      layout: "15-agent-identity.token-exchange",
      blocked: ["e4", "e5"],
      legend: [
        { kind: "place", label: "step" },
        { kind: "decision", label: "decision" },
        { kind: "route", label: "path taken" },
        { kind: "blocked", label: "forbidden path" },
      ],
      steps: [
        { at: 0, show: ["User"], focus: ["User"], camera: ["User", "UserTok", "Host"] },
        {
          at: 0.08,
          cue: "the host receives a user token",
          show: ["UserTok", "Host", "e1", "e2"],
          focus: ["User", "UserTok", "Host", "e1", "e2"],
          camera: ["User", "UserTok", "Host"],
        },
        {
          at: 0.2,
          cue: "There are two ways",
          show: ["Choice", "e3"],
          focus: ["Host", "Choice", "e3"],
          camera: ["Host", "Choice", "Pass", "Exchange"],
        },
        {
          at: 0.28,
          cue: "forward the user's token unchanged",
          show: ["Pass", "e4"],
          focus: ["Choice", "Pass", "e4"],
          camera: ["Choice", "Pass", "Deputy"],
        },
        {
          at: 0.38,
          cue: "must reject it",
          show: ["Deputy", "e5"],
          focus: ["Pass", "Deputy", "e5"],
          camera: ["Choice", "Pass", "Deputy"],
        },
        {
          at: 0.48,
          cue: "The other branch is token exchange",
          show: ["Exchange", "e6"],
          focus: ["Choice", "Exchange", "e6"],
          camera: ["Choice", "Exchange", "AS"],
        },
        {
          at: 0.6,
          cue: "The authorization server returns",
          show: ["AS", "AgentTok", "e7", "e8"],
          focus: ["Exchange", "AS", "AgentTok", "e7", "e8"],
          camera: ["Exchange", "AS", "AgentTok"],
        },
        {
          at: 0.7,
          cue: "The agent calls the server",
          show: ["Call", "e9"],
          focus: ["AgentTok", "Call", "e9"],
          camera: ["Choice", "Call", "Validate", "AgentTok"],
        },
        {
          at: 0.78,
          cue: "The server validates signature",
          show: ["Validate", "e10"],
          focus: ["Call", "Validate", "e10"],
          camera: ["Call", "Validate", "Tool"],
        },
        {
          at: 0.88,
          cue: "If any check fails",
          show: ["Deny", "e11"],
          focus: ["Validate", "Deny", "e11"],
          camera: ["Validate", "Deny", "Tool"],
        },
        {
          at: 0.94,
          cue: "If all pass",
          show: ["Tool", "e12"],
          focus: ["Validate", "Tool", "e12"],
          camera: ["Validate", "Deny", "Tool"],
        },
      ],
    },
    {
      id: "exchange-request",
      kind: "anatomy",
      prose: true,
      headline: "What goes in, what comes out",
      narration:
        "Token exchange is the mechanism for narrowing. The host presents the user's token as the subject token, optionally an actor token identifying the agent, and a resource parameter naming the server by its canonical address. That resource parameter is what lets the authorization server stamp the right audience. Back comes a new token. The user is still the subject, but the audience is that one server, the scope is narrowed to what the task needs, and the lifetime is minutes. The act claim, short for actor, names the agent. Without it, an audit log cannot tell a user who clicked a button from an agent that decided to act at three in the morning.",
      lines: [
        { text: "POST /token  (RFC 8693, RFC 8707)", group: "route" },
        { text: "subject_token = the user token", group: "route" },
        { text: "resource = the server's canonical URI", group: "route" },
        { text: "scope = only what this task needs", group: "route" },
        { text: "", group: "plain" },
        { text: "Agent token", group: "meta" },
        { text: "aud = that one server", group: "meta" },
        { text: "scope = narrowed", group: "meta" },
        { text: "act = the agent's identity", group: "meta" },
        { text: "exp = minutes", group: "meta" },
      ],
      notes: [
        {
          group: "route",
          title: "The exchange request",
          body: "The user token as subject, and a resource that names exactly where the new token will be used.",
        },
        {
          group: "meta",
          title: "The agent token",
          body: "Still the user as subject, but narrower in audience, scope and lifetime, with the agent named in act.",
        },
      ],
      beats: [
        { at: 0.1, cue: "The host presents the user's token" },
        { at: 0.46, cue: "Back comes a new token" },
      ],
    },
    {
      id: "validation",
      kind: "axis",
      headline: "Five checks on every request",
      narration:
        "On the server, validation is the load-bearing half. It is not one check but five, and skipping any of them makes the rest decorative. The signature verifies against the issuer's keys. The issuer is one this server trusts. The token has not expired. The audience names this server. And the scope covers the specific tool being invoked. Order matters: audience before scope, so a misaddressed token never reaches policy evaluation. And leave the audience check to the library. Turning off audience verification while debugging is the standard way this protection is silently removed. Signed tokens prove who issued a token, not who it was issued for.",
      ends: ["a token arrives", "a tool runs"],
      stations: [
        { name: "Signature", line: "Verifies against the issuer's keys", detail: "Is it genuine?" },
        { name: "Issuer", line: "One this server trusts", detail: "Do we trust who made it?" },
        { name: "Expiry", line: "Has not expired", detail: "Is it still current?" },
        { name: "Audience", line: "Names this server", detail: "Was it issued for me?" },
        { name: "Scope", line: "Covers this tool", detail: "May it do this?" },
      ],
      beats: [
        { at: 0.16, cue: "The signature verifies" },
        { at: 0.26, cue: "The issuer is one this server trusts" },
        { at: 0.36, cue: "The token has not expired" },
        { at: 0.44, cue: "The audience names this server" },
        { at: 0.52, cue: "the scope covers the specific tool" },
      ],
    },
    {
      id: "example",
      kind: "lanes",
      headline: "A support agent and a poisoned invoice",
      narration:
        "Take a support agent summarising a customer's recent invoices. The user signs in, and the host receives a token whose audience is the host. The agent needs tools on two servers, so the host performs two exchanges. One token for the billing server, scoped to read invoices. Another for the CRM server, scoped to read contacts. Both expire in five minutes, and both name the agent. Now a prompt injection in an invoice convinces the agent to issue a refund. The billing server answers with a 403, because the token has no refund scope. The model can be talked into requesting anything, but not into holding a credential it was never issued. And the audit entry reads agent acting for user, not just user.",
      lanes: [
        {
          title: "Billing server",
          subtitle: ["Audience: billing. Scope: invoice read. Five minutes."],
          chain: ["Exchange", "Agent token for billing", "Read invoice"],
        },
        {
          title: "CRM server",
          subtitle: ["Audience: CRM. Scope: contact read. Five minutes."],
          chain: ["Exchange", "Agent token for CRM", "Read contact"],
        },
        {
          title: "The injected refund",
          subtitle: ["The token in hand has no refund scope."],
          chain: ["Injection in an invoice", "Refund requested", "403, nothing runs"],
          tone: "fault",
        },
      ],
      takeaway: "Audit entry: agent X acting for user Y.",
      beats: [
        { at: 0.28, cue: "One token for the billing server" },
        { at: 0.4, cue: "Another for the CRM server" },
        { at: 0.62, cue: "convinces the agent to issue a refund" },
        { at: 0.92, cue: "the audit entry reads" },
      ],
    },
    {
      id: "failures",
      kind: "hazards",
      headline: "Where agent identity breaks",
      narration:
        "Five failure modes. Token passthrough, the confused deputy: the host forwards the user's token to a server it does not control, and that server can replay it against every other service that accepts it. Audience verification disabled during debugging: it survives review because everything passes, and the system is fully functional and completely unprotected. Scope inflation at exchange time: the exchange requests whatever the subject token carries instead of the minimum, and every audit reads as compliant. Long-lived agent tokens: an hour of runway for a stolen credential. And revocation that only works for humans: disabling the user does not stop agent tokens already issued, so revocation needs an agent-level identity.",
      map: {
        places: [
          { id: "host", label: ["Host"], x: 0, y: 226, w: 220 },
          { id: "server", label: ["Remote server"], x: 300, y: 226, w: 250 },
          { id: "exchange", label: ["Token exchange"], x: 630, y: 226, w: 260 },
          { id: "agenttoken", label: ["Agent token"], x: 970, y: 226, w: 250 },
          { id: "account", label: ["User account"], x: 1300, y: 226, w: 250 },
        ],
        links: [
          { from: "host", to: "server", arrow: "end" },
          { from: "server", to: "exchange", arrow: "none" },
          { from: "exchange", to: "agenttoken", arrow: "end" },
          { from: "agenttoken", to: "account", arrow: "none" },
        ],
      },
      hazards: [
        {
          at: "host",
          title: "Token passthrough",
          body: "The confused deputy. The server can replay the user's token anywhere it is accepted.",
        },
        {
          at: "server",
          title: "Audience check disabled",
          body: "Fully functional and completely unprotected, with no runtime symptom.",
        },
        {
          at: "exchange",
          title: "Scope inflation",
          body: "Requesting everything the subject token carries, instead of the minimum.",
        },
        {
          at: "agenttoken",
          title: "Long-lived agent tokens",
          body: "An hour of runway for a stolen credential.",
        },
        {
          at: "account",
          title: "Revocation for humans only",
          body: "Disabling the user does not stop agent tokens already issued.",
        },
      ],
      beats: [
        { at: 0.06, cue: "Token passthrough, the confused deputy" },
        { at: 0.26, cue: "Audience verification disabled during debugging" },
        { at: 0.46, cue: "Scope inflation at exchange time" },
        { at: 0.66, cue: "Long-lived agent tokens" },
        { at: 0.8, cue: "revocation that only works for humans" },
      ],
    },
    {
      id: "tradeoffs",
      kind: "lanes",
      headline: "What narrow credentials cost",
      narration:
        "Three trade-offs. Agent-scoped tokens against on-behalf-of everywhere. Exchanging per server bounds the blast radius and makes actions attributable to the agent, at the cost of a round trip on first use of each resource, and real design work to decide the minimum scope. Short lifetimes against refresh complexity. Minutes shrink the window a leaked credential is useful, but long-running tasks must handle expiry mid-task, which is a reason to design for it, not to extend the lifetime to hours. And an identity per agent against one shared identity. Per-agent identities give attribution and revocation, at the cost of lifecycle management. A shared identity makes every audit entry say the same thing, which is worth roughly nothing during an incident.",
      lanes: [
        {
          title: "Agent-scoped tokens",
          subtitle: ["Bounded blast radius. A round trip on first use of each resource."],
          chain: ["Exchange per server", "Minimum scope decided", "Attributable to the agent"],
        },
        {
          title: "Short lifetimes",
          subtitle: ["A small window for a leaked credential. Expiry mid-task to handle."],
          chain: ["Minutes", "Refresh ahead of expiry", "Safe retry"],
        },
        {
          title: "An identity per agent",
          subtitle: ["Attribution and revocation. Lifecycle management grows with agents."],
          chain: ["One identity each", "Provision and rotate", "Revoke one agent"],
        },
      ],
      takeaway: "A shared identity makes every audit entry say the same thing.",
      beats: [
        { at: 0.06, cue: "Agent-scoped tokens against on-behalf-of everywhere" },
        { at: 0.32, cue: "Short lifetimes against refresh complexity" },
        { at: 0.58, cue: "And an identity per agent" },
        { at: 0.86, cue: "worth roughly nothing during an incident" },
      ],
    },
    {
      id: "recap",
      kind: "recap",
      headline: "Remember three things",
      narration:
        "Three things to keep. Narrow every dimension: the user as subject with the agent as actor, one server as audience, the task as scope, and minutes as lifetime. Never pass a user token through. Exchange it. And the server validates all five checks on every request, because signed tokens alone prove nothing about who a token was issued for. To go further, build the policy-gated tool runtime lab, and ask the review question: if I steal one token, what can I do with it? Links are in the description.",
      points: [
        {
          statement: "Narrow every dimension",
          support: "Subject with actor, one audience, task scope, and a lifetime of minutes.",
          glyph: "axis",
        },
        {
          statement: "Exchange, never pass through",
          support: "The user token is the input to an exchange, not a credential to forward.",
          glyph: "split",
        },
        {
          statement: "Validate all five, every request",
          support: "Signature, issuer, expiry, audience and scope.",
          glyph: "tick",
        },
      ],
      footer: "Next: build the Policy-Gated Tool Runtime lab.",
      beats: [
        { at: 0.1, cue: "Narrow every dimension" },
        { at: 0.36, cue: "Never pass a user token through" },
        { at: 0.52, cue: "validates all five checks on every request" },
        { at: 0.78, cue: "policy-gated tool runtime lab" },
      ],
    },
  ],
};
