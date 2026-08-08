#!/usr/bin/env node
/**
 * Fails if a published content page is missing a required frontmatter field
 * or a required level-2 section for its content type, or if a fast-moving page
 * has gone unverified past its review window. Complements Astro's build-time
 * frontmatter schema (apps/handbook/src/content.config.ts), which is
 * deliberately permissive — see ADR-0004 for why the two are separate.
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import {
  extractHeadings,
  findMissingSections,
  getReviewStatus,
  parseFreshnessDeclaration,
  REQUIRED_ADR_SECTIONS,
  REQUIRED_ARCHITECTURE_SECTIONS,
  REQUIRED_MODULE_SECTIONS,
} from "@handbook/shared";

/**
 * Topics whose underlying subject matter moves fast enough that a page about
 * them must carry a `freshness` block and be re-verified on a short cycle.
 * Matched against a page's path, so `learn/modules/06-mcp.mdx` and
 * `build/labs/multi-tenant-mcp-server.mdx` both qualify under "mcp".
 *
 * This list is the enforcement surface: adding a topic here makes CI start
 * demanding freshness metadata for every page matching it.
 */
const FAST_MOVING_TOPICS = [
  "mcp",
  "langgraph",
  "agent",
  "model-serving",
  "rag",
  "evaluation",
] as const;

function isFastMovingTopic(relativePath: string): boolean {
  const normalized = relativePath.toLowerCase();
  return FAST_MOVING_TOPICS.some((topic) => normalized.includes(topic));
}

const DOCS_ROOT = join(import.meta.dirname, "..", "apps", "handbook", "src", "content", "docs");

interface CheckedSection {
  /** Directory relative to the docs root, checked recursively. */
  directory: string;
  required: readonly string[];
}

const CHECKED_SECTIONS: CheckedSection[] = [
  { directory: "learn/modules", required: REQUIRED_MODULE_SECTIONS },
  { directory: "architecture/systems", required: REQUIRED_ARCHITECTURE_SECTIONS },
  { directory: "adr/decisions", required: REQUIRED_ADR_SECTIONS },
];

async function findMdxFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findMdxFiles(path);
      if (extname(entry.name) === ".mdx" && entry.name !== "index.mdx") return [path];
      return [];
    }),
  );
  return files.flat();
}

function stripFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? source : source.slice(end + 4);
}

/**
 * Returns every freshness problem on a page: a fast-moving topic with no
 * declaration, an incomplete declaration, or one that has passed its review
 * window. Pages on stable topics may omit the block entirely.
 */
function checkFreshness(source: string, relativePath: string): string[] {
  const declaration = parseFreshnessDeclaration(source);
  const fastMoving = isFastMovingTopic(relativePath);

  if (!declaration) {
    return fastMoving
      ? [
          "covers a fast-moving topic but declares no `freshness` block " +
            "(add classification, verifiedAgainst, verifiedOn)",
        ]
      : [];
  }

  const problems: string[] = [];
  if (declaration.classification === "fast-moving") {
    // "Reviewed recently" is not a useful claim without saying what it was
    // reviewed against, so both fields are required together.
    if (!declaration.verifiedAgainst) {
      problems.push("is fast-moving but does not say what it was `verifiedAgainst`");
    }
    if (!declaration.verifiedOn) {
      problems.push("is fast-moving but has no `verifiedOn` date");
    }
  }

  const review = getReviewStatus(declaration);
  if (review.overdue) {
    problems.push(
      `is ${Math.abs(review.daysRemaining)} day(s) past its ${review.reviewAfterDays}-day review ` +
        `window (verifiedAgainst: ${declaration.verifiedAgainst ?? "unspecified"}) — ` +
        "re-verify against the current release and bump `verifiedOn`",
    );
  }

  return problems;
}

async function main(): Promise<void> {
  const failures: string[] = [];
  let filesChecked = 0;

  for (const { directory, required } of CHECKED_SECTIONS) {
    const files = await findMdxFiles(join(DOCS_ROOT, directory));
    for (const file of files) {
      filesChecked += 1;
      const source = await readFile(file, "utf-8");
      const headings = extractHeadings(stripFrontmatter(source));
      const missing = findMissingSections(headings, required);
      const relativePath = relative(process.cwd(), file);
      if (missing.length > 0) {
        failures.push(`${relativePath}\n  missing sections: ${missing.join(", ")}`);
      }

      for (const problem of checkFreshness(source, relativePath)) {
        failures.push(`${relativePath}\n  ${problem}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`Content structure check failed (${failures.length} file(s)):\n`);
    for (const failure of failures) console.error(`  ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`Content structure check passed (${filesChecked} file(s) checked).`);
}

await main();
