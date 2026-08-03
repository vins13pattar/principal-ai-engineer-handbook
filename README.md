# Principal AI Engineer Interview Handbook

**Production AI Systems, Agentic AI & Distributed Infrastructure**

A version-controlled interview and architecture handbook for Principal AI Engineer, Staff AI Engineer, AI Platform Engineer, AI Architect, and Founding AI Engineer roles.

## Purpose

This repository is designed as both:

- an interview preparation handbook;
- a production AI architecture reference;
- a portfolio demonstrating senior-level AI platform thinking;
- reusable teaching material for advanced GenAI engineering sessions.

The emphasis is not on memorizing definitions. Each chapter focuses on system design, production trade-offs, reliability, scalability, security, observability, implementation patterns, and Principal-level decision-making.

## Book structure

```text
.
├── 01-ai-foundations/
├── 02-python-for-ai-engineers/
├── 03-distributed-systems/
├── 04-networking/
├── 05-ai-platforms/
├── 06-agent-architecture/
├── 07-mcp/
├── 08-langgraph/
├── 09-rag/
├── 10-vector-databases/
├── 11-model-serving/
├── 12-kubernetes-for-ai/
├── 13-cloud-infrastructure/
├── 14-observability-and-reliability/
├── 15-ai-system-design/
├── 16-coding-interviews/
├── 17-leadership-and-behavioural/
├── 18-company-playbooks/
├── appendices/
├── examples/
└── diagrams/
```

## Chapter format

Each major chapter will contain:

1. Why the concept exists
2. Core mental model
3. Architecture and data flow
4. Production implementation patterns
5. Scaling, reliability, security, and cost
6. Technology choices and trade-offs
7. Failure modes and debugging
8. Principal-level interview questions
9. Hands-on implementation exercises
10. Experience-mapping prompts for authentic interview answers

## Version roadmap

| Version | Scope |
|---|---|
| `v0.1` | Repository foundation, roadmap, book conventions, Nasiko playbook |
| `v0.2` | Python concurrency and production Python |
| `v0.3` | Distributed systems and networking |
| `v0.4` | Agent architecture, MCP, and LangGraph |
| `v0.5` | Production RAG and vector databases |
| `v0.6` | Model serving and Kubernetes for AI |
| `v0.7` | Cloud, observability, reliability, and security |
| `v0.8` | AI system design case studies |
| `v0.9` | Coding, leadership, behavioural, and company playbooks |
| `v1.0` | Complete reviewed handbook and publishable build |

## Current focus

The first company-specific track targets the **Principal / Senior AI Engineer (Python)** role at Nasiko, covering:

- production Python and `asyncio`;
- distributed agent infrastructure;
- agent registries and discovery;
- MCP servers and clients;
- LangGraph and multi-agent coordination;
- model serving;
- Kubernetes and cloud infrastructure;
- Principal-level architecture and leadership discussions.

See [`ROADMAP.md`](ROADMAP.md) and [`18-company-playbooks/nasiko/README.md`](18-company-playbooks/nasiko/README.md).

## Working model

- `main` contains reviewed, usable content.
- New chapters and major revisions should use feature branches.
- Changes should be submitted through pull requests.
- Prefer small, focused commits using Conventional Commit-style messages.
- Every technical chapter should include references to primary documentation or research where appropriate.

## Author

**Vinod Pattar**  
Principal Engineer · AI Platform & Full-Stack Architecture

## Status

🚧 Work in progress — currently building `v0.1`.
