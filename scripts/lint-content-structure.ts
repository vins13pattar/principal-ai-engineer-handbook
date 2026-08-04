#!/usr/bin/env node
/**
 * Fails if a published content page is missing a required frontmatter field
 * or a required level-2 section for its content type. Complements Astro's
 * build-time frontmatter schema (apps/handbook/src/content.config.ts), which
 * is deliberately permissive — see ADR-0004 for why the two are separate.
 */
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import {
  extractHeadings,
  findMissingSections,
  REQUIRED_ADR_SECTIONS,
  REQUIRED_ARCHITECTURE_SECTIONS,
  REQUIRED_MODULE_SECTIONS,
} from "@handbook/shared";

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
      if (missing.length > 0) {
        const relativePath = relative(process.cwd(), file);
        failures.push(`${relativePath}\n  missing: ${missing.join(", ")}`);
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
