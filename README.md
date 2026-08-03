# Principal AI Engineer Interview Handbook

**Production AI Systems, Agentic AI & Distributed Infrastructure**

A version-controlled, HTML-first engineering handbook for Principal AI Engineer, Staff AI Engineer, AI Platform Engineer, AI Architect, and Founding AI Engineer roles.

The project is intentionally company-neutral so it can be published as a reusable open engineering resource.

## Current release

`v0.2` introduces the Principal engineering mindset and the first technical module: **Production Python for AI Infrastructure Engineers**.

Open [`index.html`](index.html) to start the handbook.

## Repository structure

```text
.
├── index.html
├── roadmap.html
├── assets/
│   ├── css/main.css
│   └── js/main.js
├── modules/
│   ├── 00-principal-mindset/index.html
│   └── 01-production-python/index.html
├── playbooks/
│   └── ai-infrastructure-interview/index.html
├── examples/                  # Production-quality code examples
├── diagrams/                  # SVG and Mermaid source files
└── README.md
```

## Design goals

- Semantic, accessible HTML pages
- Responsive navigation and layouts
- Shared CSS and lightweight JavaScript
- Print-friendly pages for browser-to-PDF export
- GitHub Pages-compatible static hosting
- Production-focused modules with architecture, code, trade-offs, failure modes, and interview questions
- Generic terminology suitable for future open-source publication

## Version roadmap

| Version | Scope |
|---|---|
| `v0.1` | HTML foundation, design system, Module 0, and generic AI infrastructure interview track |
| `v0.2` | Production Python, asyncio, concurrency, reliability, and coding exercises |
| `v0.3` | Distributed systems and networking |
| `v0.4` | Agent architecture, MCP, and LangGraph |
| `v0.5` | Production RAG and vector databases |
| `v0.6` | Model serving and Kubernetes for AI |
| `v0.7` | Cloud, observability, reliability, and security |
| `v0.8` | AI system design case studies |
| `v0.9` | Coding, leadership, behavioural, and role-oriented playbooks |
| `v1.0` | Complete reviewed handbook and publishable build |

See the visual roadmap in [`roadmap.html`](roadmap.html).

## Local preview

The pages can be opened directly in a browser. For a local web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select the `main` branch and `/ (root)`, and save.

## Working model

- `main` contains reviewed, usable content.
- New modules and substantial revisions should use feature branches.
- Prefer small, focused commits using Conventional Commit-style messages.
- Keep content semantic and readable without JavaScript.
- Add citations to primary documentation or research for technical claims.
- Test pages at mobile, tablet, desktop, and print widths.
- Avoid organization, recruiter, or company-specific names in published content.

## Author

**Vinod Pattar**  
Principal Engineer · AI Platform & Full-Stack Architecture

## Status

Work in progress — building `v0.2` and expanding the Production Python lab.
