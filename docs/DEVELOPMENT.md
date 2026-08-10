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
[ADR-0002](https://handbook.vinodspattar.in/adr/decisions/0002-pnpm-monorepo-layout/)).

## Setup

```bash
pnpm install
```

Requires Node 22.12+ and pnpm 9+ (see `.nvmrc` and the `engines` / `packageManager` fields in
`package.json`). The Node floor is Astro's, not ours — `astro check` refuses to run below 22.12.

## Deployment

The site deploys to Cloudflare as a **Worker with static assets** — no server code, no `main` entry
point, just `apps/handbook/dist` served from Cloudflare's edge. Cloudflare builds directly from this
repository; there is no deploy step in `.github/workflows/`. See
[ADR-0007](https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook/blob/main/apps/handbook/src/content/docs/adr/decisions/0007-workers-static-assets-deployment.mdx)
for why this is a Worker and not a Pages project.

Connect the repository in the Cloudflare dashboard (**Workers & Pages → Create → Import a
repository**) with these settings:

| Setting              | Value                                      |
| -------------------- | ------------------------------------------ |
| Project name         | `principal-ai-engineer-interview-handbook` |
| Build command        | `pnpm run build`                           |
| Deploy command       | `npx wrangler deploy -c wrangler.toml`     |
| Path                 | `/` (repository root)                      |
| Environment variable | `SITE_URL` = the deployment's own URL      |

Node and the package manager come from `.nvmrc` (`22`) and `pnpm-lock.yaml`.

### Four things that fail quietly

Every one of these produces a green build and a wrong result, so none of them will announce itself:

- **`-c wrangler.toml` on the deploy command is load bearing.** Bare `npx wrangler deploy` fails at
  the root of a pnpm workspace with _"The Cloudflare application detection logic has been run in the
  root of a workspace instead of targeting a specific project"_ — wrangler tries to infer which
  workspace package to deploy and refuses to guess. Naming the config skips detection. The flag
  looks removable and is not.
- **`SITE_URL` must be set.** Workers Builds does not provide `CF_PAGES_URL` — that is a Pages
  variable. Without `SITE_URL`, `astro.config.mjs` falls through to its hard-coded fallback and
  stamps a wrong canonical URL onto all 50 pages and the whole sitemap, while everything looks fine
  to a human reading the site.
- **The project name in the dashboard should match `name` in `wrangler.toml`.** `wrangler deploy`
  takes the Worker name from the config, so a mismatch deploys to a differently-named Worker than
  the build project implies, and the live URL is not the one the dashboard suggests.
- **Node must be 22.12 or newer.** `astro check` refuses to run below it. This is the failure that
  kept Site CI red for a full day.

`wrangler.toml` at the repository root is the source of truth for the asset directory and the 404
behavior. Test a build locally the way Cloudflare serves it:

```bash
pnpm build
pnpm exec wrangler deploy --dry-run -c wrangler.toml   # validates without deploying
pnpm exec wrangler dev -c wrangler.toml                # serves it locally
```

### After the first deploy

`.github/workflows/site-ci.yml` verifies the build but has no visibility into Cloudflare, so a
misconfigured project fails silently from GitHub's side. Check these once on the live URL:

| Check                                                              | Why it can break                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| The homepage loads and the sidebar renders                         | A wrong asset directory serves an empty site                                    |
| A deep link works on a hard refresh, e.g. `/learn/modules/06-mcp/` | Confirms directory-style routing is being served, not just client-side          |
| An unknown path shows the site's own 404, not Cloudflare's         | `not_found_handling` in `wrangler.toml`                                         |
| Search opens and returns a result                                  | Pagefind's index lives in `dist/pagefind/`; a partial upload breaks it silently |
| A Mermaid diagram renders                                          | Diagrams render client-side, so the build cannot catch a broken one             |
| `view-source:` shows a canonical URL on the real domain            | Confirms `SITE_URL` reached the build                                           |

Once the production URL is final, update the fallback in `apps/handbook/astro.config.mjs` — it is
what canonical URLs and `sitemap-0.xml` use for any build where `SITE_URL` is absent, including
local ones.

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
