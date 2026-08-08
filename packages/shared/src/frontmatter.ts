import type { FreshnessClassification, FreshnessDeclaration } from "./freshness.ts";
import { FRESHNESS_CLASSIFICATIONS } from "./freshness.ts";

/**
 * Extracts the raw YAML frontmatter block from a content page, or null when the
 * page has none.
 */
export function extractFrontmatter(source: string): string | null {
  if (!source.startsWith("---")) return null;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? null : source.slice(4, end);
}

/**
 * Reads the `freshness:` block out of a page's frontmatter.
 *
 * This deliberately parses one known, flat, two-level shape rather than pulling
 * in a YAML dependency for a single CI lint step — the same trade-off
 * `extractHeadings` makes for Markdown. It is intentionally strict: anything it
 * cannot confidently read is reported as absent, so a malformed block fails the
 * "fast-moving pages must declare freshness" check loudly rather than silently
 * parsing to something wrong. Astro's build-time Zod schema in
 * `apps/handbook/src/content.config.ts` is the authority on the field types;
 * this is only the CI pre-check.
 */
export function parseFreshnessDeclaration(source: string): FreshnessDeclaration | null {
  const frontmatter = extractFrontmatter(source);
  if (!frontmatter) return null;

  const lines = frontmatter.split("\n");
  const startIndex = lines.findIndex((line) => /^freshness:\s*$/.test(line));
  if (startIndex === -1) return null;

  const fields = new Map<string, string>();
  for (const line of lines.slice(startIndex + 1)) {
    // The block ends at the first line that is not indented (the next top-level key).
    if (!/^\s+\S/.test(line)) break;
    const match = /^\s+([A-Za-z]+):\s*(.+?)\s*$/.exec(line);
    if (match) fields.set(match[1]!, match[2]!.replace(/^["']|["']$/g, ""));
  }

  const classification = fields.get("classification");
  if (!isFreshnessClassification(classification)) return null;

  const declaration: FreshnessDeclaration = { classification };

  const verifiedAgainst = fields.get("verifiedAgainst");
  if (verifiedAgainst) declaration.verifiedAgainst = verifiedAgainst;

  const verifiedOn = fields.get("verifiedOn");
  if (verifiedOn) {
    const parsed = new Date(verifiedOn);
    if (!Number.isNaN(parsed.getTime())) declaration.verifiedOn = parsed;
  }

  const reviewAfterDays = fields.get("reviewAfterDays");
  if (reviewAfterDays) {
    const parsed = Number.parseInt(reviewAfterDays, 10);
    if (Number.isFinite(parsed) && parsed > 0) declaration.reviewAfterDays = parsed;
  }

  return declaration;
}

function isFreshnessClassification(value: unknown): value is FreshnessClassification {
  return (
    typeof value === "string" && (FRESHNESS_CLASSIFICATIONS as readonly string[]).includes(value)
  );
}
