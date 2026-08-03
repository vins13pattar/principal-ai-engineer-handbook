# Principal AI Engineer Interview Handbook

**Production AI Systems, Agentic AI & Distributed Infrastructure**

A version-controlled, HTML-first interview and architecture handbook for Principal AI Engineer, Staff AI Engineer, AI Platform Engineer, AI Architect, and Founding AI Engineer roles.

## Current release

`v0.1` establishes the responsive website foundation and the first company-specific interview playbook for the **Principal / Senior AI Engineer (Python)** role at Nasiko.

Open [`index.html`](index.html) to start the handbook.

## Repository structure

```text
.
├── index.html
├── roadmap.html
├── assets/
│   ├── css/main.css
│   └── js/main.js
├── company-playbooks/
│   └── nasiko/index.html
├── chapters/                  # Added release by release
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
- Production-focused chapters with architecture, code, trade-offs, failure modes, and interview questions

## Version roadmap

| Version | Scope |
|---|---|
| `v0.1` | HTML foundation, roadmap, shared design system, Nasiko playbook |
| `v0.2` | Production Python, asyncio, networking, profiling, and coding exercises |
| `v0.3` | Distributed systems and networking |
| `v0.4` | Agent architecture, MCP, and LangGraph |
| `v0.5` | Production RAG and vector databases |
| `v0.6` | Model serving and Kubernetes for AI |
| `v0.7` | Cloud, observability, reliability, and security |
| `v0.8` | AI system design case studies |
| `v0.9` | Coding, leadership, behavioural, and additional company playbooks |
| `v1.0` | Complete reviewed handbook and publishable build |

See the visual roadmap in [`roadmap.html`](roadmap.html).

## Local preview

The pages can be opened directly in a browser. For a local web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select the `main` branch and `/ (root)`, and save. The site will then be published from the HTML files in the repository root.

## Working model

- `main` contains reviewed, usable content.
- New chapters and substantial revisions should use feature branches.
- Prefer small, focused commits using Conventional Commit-style messages.
- Keep content semantic and readable without JavaScript.
- Add citations to primary documentation or research for technical claims.
- Test pages at mobile, tablet, desktop, and print widths.

## Author

**Vinod Pattar**  
Principal Engineer · AI Platform & Full-Stack Architecture

## Status

Work in progress — building `v0.1` and preparing the `v0.2` Production Python module.
