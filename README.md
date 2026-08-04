# Principal AI Engineer Handbook

[![Site CI](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/site-ci.yml/badge.svg)](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/site-ci.yml)
[![Deploy site](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/deploy.yml/badge.svg)](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/deploy.yml)
[![Async AI Gateway CI](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/lab-async-ai-gateway-ci.yml/badge.svg)](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/actions/workflows/lab-async-ai-gateway-ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An open-source knowledge system for Principal AI Engineers: production architecture reference,
hands-on labs built to a production bar, and interview preparation grounded in that same material —
not interview notes with a coat of paint.

**[Read the handbook →](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/)**

## What's here

| Section                                                                                               | What it is                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Learn](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/learn/)               | Fifteen modules, Principal Engineer mindset through leadership      |
| [Build](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/build/)               | Production-quality labs in [`labs/`](labs/)                         |
| [Architecture](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/architecture/) | Reference architectures for recurring AI infrastructure problems    |
| [Interview](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/interview/)       | Interview questions embedded next to the material that answers them |
| [Reference](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/reference/)       | One-page lookups for tools and primitives                           |
| [ADR](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/adr/)                   | Why the platform and its labs are built the way they are            |
| [Cheat Sheets](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/cheatsheets/)  | Printable, one-page summaries                                       |
| [Roadmap](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/roadmap/)           | Current version and what ships next                                 |

## Status

**v0.1.0 — Platform foundation.** The documentation platform — this site, its component and design
token libraries, its CI/CD, and its content-structure linting — is complete. Module and
architecture content is being authored incrementally on top of it; see the
[Roadmap](https://vins13pattar.github.io/Principal-AI-Engineer-Interview-Handbook/roadmap/).

## Repository structure

```text
apps/handbook/       Astro + Starlight documentation site
packages/ui/         Brand design tokens (Tailwind v4 theme)
packages/components/ Reusable MDX doc components
packages/diagrams/   Client-side Mermaid diagram component
packages/shared/     Content schemas, versioning types, structural content linter
labs/                Production-quality labs (independent Python projects)
docs/                Contributor-facing guides (content authoring, local development)
legacy/              Retired static-HTML prototype, kept for migration reference
scripts/             Repo-level tooling (content structure lint)
.github/workflows/   CI and deployment
```

## Local development

```bash
pnpm install
pnpm dev      # http://localhost:4321
```

See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) for the full command reference and
[`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md) for how to write a new page.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)

## Author

**Vinod Pattar** — Principal Engineer, AI Platform & Full-Stack Architecture
