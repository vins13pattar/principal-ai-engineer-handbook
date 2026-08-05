# Development guide

## Layout

```text
apps/handbook/       Astro + Starlight site (the published documentation platform)
packages/ui/         Brand design tokens (Tailwind v4 theme + a small TS mirror)
packages/components/ Reusable MDX doc components (EngineeringNote, TradeOff, ADRSummary, ...)
packages/diagrams/   The client-side Mermaid.astro component
packages/shared/     Content-type Zod schemas, versioning types, the heading-lint used in CI
labs/                Production-quality labs (Python, independent of the pnpm workspace)
scripts/             Repo-level Node scripts (content structure lint)
docs/                This guide and the content authoring guide
legacy/               Retired static-HTML prototype, kept for content migration reference
```

`apps/*` and `packages/*` are a pnpm workspace (`pnpm-workspace.yaml`); `labs/*` is intentionally
outside it — each lab is its own Python project with its own `pyproject.toml` and CI job (see
[ADR-0002](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0002-pnpm-monorepo-layout/)).

## Setup

```bash
pnpm install
```

Requires Node 20+ and pnpm 9+ (see `.nvmrc` and the `packageManager` field in `package.json`).

## Deployment

The site deploys via [Cloudflare Pages](https://pages.cloudflare.com/) git integration — Cloudflare
builds and deploys directly from this repository; there is no deploy step in
`.github/workflows/`. See [ADR-0005](https://principal-ai-engineer-handbook.pages.dev/adr/decisions/0005-cloudflare-pages-deployment/)
for why.

To connect the repository in the Cloudflare dashboard (**Workers & Pages → Create → Pages →
Connect to Git**), use these build settings:

| Setting                | Value                                                                       |
| ---------------------- | --------------------------------------------------------------------------- |
| Framework preset       | `Astro` (or `None` — the settings below are explicit either way)            |
| Build command          | `pnpm build`                                                                |
| Build output directory | `apps/handbook/dist`                                                        |
| Root directory         | `/` (repository root — this is a pnpm workspace, not a single-package repo) |

Node version and package manager are picked up automatically from `.nvmrc` and
`pnpm-lock.yaml`; no `NODE_VERSION` environment variable is required. Every push to `main` deploys
to production; every pull request gets its own preview URL automatically — no additional
configuration needed for either.

`wrangler.toml` at the repository root pins `pages_build_output_dir` for parity with the dashboard
settings and enables local testing with `pnpm exec wrangler pages dev apps/handbook/dist` after a
build.

## Common commands

Run from the repo root unless noted:

| Command                             | What it does                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev`                          | Start the Astro dev server for `apps/handbook`                      |
| `pnpm build`                        | Production build of the site (fails on broken internal links)       |
| `pnpm preview`                      | Serve the production build locally                                  |
| `pnpm check`                        | Astro + TypeScript diagnostics, including content frontmatter       |
| `pnpm lint`                         | ESLint across the workspace                                         |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                              |
| `pnpm test`                         | Unit tests (Vitest) across every package                            |
| `pnpm test:e2e`                     | Playwright smoke tests (run `pnpm build` first — it serves `dist/`) |
| `pnpm lint:content`                 | Required-sections/frontmatter check (see `docs/CONTENT_GUIDE.md`)   |
| `pnpm verify`                       | Everything above, in the order CI runs it                           |

## Adding a package

1. `mkdir packages/your-package && cd packages/your-package`
2. Add a `package.json` with `"name": "@handbook/your-package"` and a `tsconfig.json` extending
   `../../tsconfig.base.json`.
3. Reference it from another workspace package with `"@handbook/your-package": "workspace:*"`.
4. Run `pnpm install` from the repo root to link it.

No publish step, no version bump — `workspace:*` resolves to the local package directly.

## Adding a lab

Labs are independent Python projects; there's no monorepo tooling to wire up. Add
`labs/your-lab/pyproject.toml`, its own tests, and a GitHub Actions workflow scoped to
`labs/your-lab/**` (copy `.github/workflows/lab-async-ai-gateway-ci.yml` as a starting point). Then
document it under `apps/handbook/src/content/docs/build/labs/your-lab.mdx` per
`docs/CONTENT_GUIDE.md`.
