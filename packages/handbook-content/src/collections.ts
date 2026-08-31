/**
 * Where the handbook's content actually lives, and what each directory means.
 *
 * The podcast design originally assumed a top-level `content/` tree. There is
 * no such tree. Content lives inside the Astro app because Astro's content
 * collections are configured against that path in
 * `apps/handbook/src/content.config.ts`, and `scripts/lint-content-structure.ts`
 * walks the same tree to enforce each page's required-section contract. This
 * module is the single place that knows the layout, so nothing downstream
 * hardcodes a path.
 */

/**
 * The content categories the loader can read.
 *
 * `dir` is relative to CONTENT_ROOT and `urlPrefix` is the site path, and they
 * are not always the same shape -- architecture pages live under
 * `architecture/systems/` and cheat sheets under `cheatsheets/sheets/`, each
 * behind a section overview at the parent. Getting either wrong makes a whole
 * collection load as empty rather than error, which is why
 * `EXPECTED_MINIMUM_PAGES` below is asserted in the tests.
 */
export const COLLECTIONS = {
  module: { dir: "learn/modules", urlPrefix: "/learn/modules" },
  architecture: { dir: "architecture/systems", urlPrefix: "/architecture/systems" },
  lab: { dir: "build/labs", urlPrefix: "/build/labs" },
  interview: { dir: "interview/tracks", urlPrefix: "/interview/tracks" },
  reference: { dir: "reference/lookups", urlPrefix: "/reference/lookups" },
  adr: { dir: "adr/decisions", urlPrefix: "/adr/decisions" },
  cheatsheet: { dir: "cheatsheets/sheets", urlPrefix: "/cheatsheets/sheets" },
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

/**
 * A floor on how many pages each collection must yield.
 *
 * This exists because a wrong `dir` does not throw -- `readdir` on a directory
 * of subdirectories returns no `.mdx` files and the collection loads as empty.
 * The first version of this module had exactly that bug for two collections,
 * and a test asserting only "more than forty documents total" passed anyway
 * while a quarter of the handbook was missing. A per-collection floor is the
 * assertion that would have caught it.
 *
 * These are floors, not counts, so publishing a new page does not fail CI.
 */
export const EXPECTED_MINIMUM_PAGES: Record<CollectionName, number> = {
  module: 16,
  architecture: 11,
  lab: 12,
  interview: 3,
  reference: 13,
  adr: 7,
  cheatsheet: 5,
};

/** Path from the repository root to the directory holding every content page. */
export const CONTENT_ROOT = "apps/handbook/src/content/docs";

/**
 * Resolves a site URL path back to the collection it belongs to.
 *
 * Related-content links inside pages are written as site paths
 * (`/learn/modules/06-mcp/`), so following them means mapping a URL back to a
 * file. Returns null for anything outside a known collection -- the homepage,
 * section overviews, external links.
 */
export function collectionForUrl(url: string): CollectionName | null {
  for (const name of COLLECTION_NAMES) {
    if (url.startsWith(`${COLLECTIONS[name].urlPrefix}/`)) return name;
  }
  return null;
}

/**
 * The document id for a site URL, or null when the URL is not a content page.
 *
 * A document id is `<collection>:<slug>`, e.g. `module:06-mcp`. Ids are stable
 * across link-style differences (trailing slash, anchor) so a source pack
 * assembled twice from the same page references the same document both times.
 */
export function documentIdForUrl(url: string): string | null {
  const withoutAnchor = url.split("#")[0] ?? "";
  const collection = collectionForUrl(withoutAnchor);
  if (!collection) return null;

  const prefix = `${COLLECTIONS[collection].urlPrefix}/`;
  const slug = withoutAnchor.slice(prefix.length).replace(/\/$/, "");
  if (!slug || slug.includes("/")) return null;

  return `${collection}:${slug}`;
}
