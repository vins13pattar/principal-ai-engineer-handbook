#!/usr/bin/env node
/**
 * Checks a *deployed* site for the things CI cannot see.
 *
 * `.github/workflows/site-ci.yml` proves the build and the internal links, but
 * it has no visibility into Cloudflare (ADR-0007). A misconfigured project —
 * wrong asset directory, missing SITE_URL, 404 handling not set — produces a
 * green build and a wrong site, so those checks have to run against the live
 * origin. This turns the manual checklist in docs/DEVELOPMENT.md into something
 * that exits non-zero.
 *
 *   pnpm verify:deployment https://handbook.vinodspattar.in
 *
 * Deliberately not part of `pnpm verify`: that runs in CI, which cannot reach a
 * deployment and should not fail because a site is briefly down.
 */

interface Check {
  name: string;
  /** Why this can break, so a failure is actionable rather than just red. */
  because: string;
  run: (origin: string) => Promise<string | null>;
}

const TIMEOUT_MS = 20_000;

/**
 * Refuses to run when a proxy is configured but Node's `fetch` will ignore it.
 *
 * Node 22's `fetch` does not read `HTTPS_PROXY`; it needs `NODE_USE_ENV_PROXY=1`.
 * In a proxied sandbox without it, every request is refused at the egress layer
 * and this script reports all seven checks as failures against a site that is
 * perfectly healthy — observed against the live handbook, which returned 200 to
 * `curl` while this reported 7/7 down. A checker that cries wolf gets ignored,
 * which is worse than one that declines to answer, so this exits instead of
 * printing a page of false failures.
 */
function refuseIfProxyIsInvisible(): string | null {
  const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!proxy || process.env.NODE_USE_ENV_PROXY) return null;
  return (
    `A proxy is configured (${proxy}) but Node's fetch will not use it, so every check\n` +
    `would fail against a site that may be fine. Re-run as:\n\n` +
    `  NODE_USE_ENV_PROXY=1 pnpm verify:deployment <origin>`
  );
}

async function get(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: response.status, body: await response.text() };
}

const CHECKS: Check[] = [
  {
    name: "Homepage responds and renders the sidebar",
    because: "A wrong asset directory serves an empty site or a bare 404",
    run: async (origin) => {
      const { status, body } = await get(`${origin}/`);
      if (status !== 200) return `expected 200, got ${status}`;
      if (!body.includes("Principal AI Engineer Handbook")) return "page title missing from HTML";
      if (!body.includes('href="/start-here/"')) return "Start here link missing — stale build?";
      return null;
    },
  },
  {
    name: "Deep link resolves on a direct request",
    because: "Confirms directory-style routing is served at the edge, not just client-side",
    run: async (origin) => {
      const { status, body } = await get(`${origin}/learn/modules/06-mcp/`);
      if (status !== 200) return `expected 200, got ${status}`;
      return body.includes("<h1") ? null : "no <h1> in the response";
    },
  },
  {
    name: "Unknown paths return the site's own 404",
    because: "`not_found_handling` in wrangler.toml; without it Cloudflare serves its own page",
    run: async (origin) => {
      const { status, body } = await get(`${origin}/no-such-page-${Date.now()}/`);
      if (status !== 404) return `expected 404, got ${status}`;
      // Astro's 404 carries the site chrome; Cloudflare's does not.
      return body.includes("Principal AI Engineer Handbook")
        ? null
        : "got a 404, but not the handbook's own page";
    },
  },
  {
    name: "Pagefind search index is served",
    because: "The index lives in dist/pagefind/; a partial upload breaks search silently",
    run: async (origin) => {
      const { status } = await get(`${origin}/pagefind/pagefind.js`);
      return status === 200 ? null : `expected 200, got ${status}`;
    },
  },
  {
    name: "Canonical URL points at this origin",
    because: "Proves SITE_URL reached the build instead of falling back to the hard-coded default",
    run: async (origin) => {
      const { body } = await get(`${origin}/`);
      const match = body.match(/<link rel="canonical" href="([^"]+)"/);
      if (!match) return "no canonical link found";
      return match[1].startsWith(origin) ? null : `canonical is ${match[1]}, expected ${origin}`;
    },
  },
  {
    name: "Social preview image resolves",
    because:
      "og:image is an absolute URL to a file in public/. A 404 there means every shared link — LinkedIn, X, Slack — renders with no card, and nothing about the site looks broken",
    run: async (origin) => {
      const { body } = await get(`${origin}/`);
      const match = body.match(/<meta property="og:image" content="([^"]+)"/);
      if (!match) return "no og:image meta tag found";
      const { status } = await get(match[1]);
      return status === 200 ? null : `og:image is ${match[1]}, which returned ${status}`;
    },
  },
  {
    name: "Sitemap is served and uses this origin",
    because: "Same failure as canonical, and the one search engines actually read",
    run: async (origin) => {
      const { status, body } = await get(`${origin}/sitemap-0.xml`);
      if (status !== 200) return `expected 200, got ${status}`;
      const first = body.match(/<loc>([^<]+)<\/loc>/);
      if (!first) return "sitemap contains no <loc> entries";
      return first[1].startsWith(origin) ? null : `first entry is ${first[1]}, expected ${origin}`;
    },
  },
];

async function main(): Promise<void> {
  const origin = process.argv[2]?.replace(/\/$/, "");
  if (!origin) {
    console.error(
      "Usage: pnpm verify:deployment <origin>\n  e.g. pnpm verify:deployment https://handbook.vinodspattar.in",
    );
    process.exitCode = 1;
    return;
  }

  const proxyProblem = refuseIfProxyIsInvisible();
  if (proxyProblem) {
    console.error(proxyProblem);
    process.exitCode = 1;
    return;
  }

  console.log(`Checking ${origin}\n`);
  let failed = 0;

  for (const check of CHECKS) {
    let problem: string | null;
    try {
      problem = await check.run(origin);
    } catch (error) {
      problem = error instanceof Error ? error.message : String(error);
    }

    if (problem === null) {
      console.log(`  PASS  ${check.name}`);
    } else {
      failed += 1;
      console.error(`  FAIL  ${check.name}`);
      console.error(`        ${problem}`);
      console.error(`        why it matters: ${check.because}`);
    }
  }

  console.log(
    "\n  NOTE  Diagrams are not checked here — they render client-side, so no fetch can see\n" +
      "        them. They are covered by tests/e2e/diagrams.spec.ts, which asserts\n" +
      "        `data-mermaid-rendered` on every page importing a .mmd and therefore\n" +
      "        distinguishes a real diagram from Mermaid's error graphic (also an <svg>).",
  );

  if (failed > 0) {
    console.error(`\n${failed} of ${CHECKS.length} checks failed.`);
    process.exitCode = 1;
    return;
  }
  console.log(`\nAll ${CHECKS.length} automated checks passed.`);
}

await main();
