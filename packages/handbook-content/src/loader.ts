/**
 * Reads handbook pages off disk into typed documents.
 *
 * This is the only module that touches the filesystem. Everything above it
 * works on `HandbookDocument`, so a future source (a database, a fetched
 * bundle) replaces this file rather than rippling outward.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { extractFrontmatter, type FreshnessDeclaration } from "@handbook/shared";
import { COLLECTIONS, CONTENT_ROOT, type CollectionName } from "./collections.ts";
import { extractComponentTitles, splitOnCodeFences, stripMdxSyntax } from "./mdx.ts";

/** One `##` section of a page, which is the unit the content contract enforces. */
export interface DocumentSection {
  heading: string;
  /** Prose with MDX components stripped. */
  body: string;
}

export interface HandbookDocument {
  /** `<collection>:<slug>`, e.g. `module:06-mcp`. Stable across link styles. */
  id: string;
  collection: CollectionName;
  slug: string;
  /** Site path, e.g. `/learn/modules/06-mcp/`. */
  url: string;
  /** Path from the repository root, for citation and for hashing. */
  sourcePath: string;
  title: string;
  description: string;
  version: string;
  lastUpdated: string;
  /**
   * Present only on pages that declare one. Fast-moving pages carry the
   * release they were checked against and the date; the podcast's own
   * freshness tracking is an extension of this, not a parallel mechanism.
   */
  freshness?: FreshnessDeclaration;
  sections: DocumentSection[];
  /** Titles lifted off components before stripping -- asides, diagrams. */
  componentTitles: string[];
  /** Internal site links found in the body, in order of appearance. */
  outboundLinks: string[];
  /** The raw file, kept so the source hash covers what was actually on disk. */
  raw: string;
}

/**
 * Raised when a page cannot be parsed, rather than returning a half-built document.
 *
 * Written without a TypeScript parameter property on purpose: this repo runs
 * its TS directly under `node --experimental-strip-types`, which erases types
 * without transforming syntax and rejects parameter properties outright. A
 * bundler-only idiom here would work under Vitest and fail the moment the
 * package is used from a script.
 */
export class DocumentParseError extends Error {
  readonly sourcePath: string;

  constructor(sourcePath: string, message: string) {
    super(`${sourcePath}: ${message}`);
    this.name = "DocumentParseError";
    this.sourcePath = sourcePath;
  }
}

const INTERNAL_LINK = /\]\((\/[^)\s]*)\)/g;

function bodyAfterFrontmatter(source: string): string {
  if (!source.startsWith("---")) return source;
  const end = source.indexOf("\n---", 3);
  return end === -1 ? source : source.slice(end + 4);
}

/**
 * Splits a body into its `##` sections.
 *
 * Fence-aware, because a `##` inside a code block is a comment, not a heading --
 * shell examples in this repo are full of them.
 */
export function splitIntoSections(body: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;

  for (const segment of splitOnCodeFences(body)) {
    if (segment.isCode) {
      if (current) current.body += `\n${segment.text}`;
      continue;
    }
    for (const line of segment.text.split("\n")) {
      const heading = /^##\s+(.+?)\s*$/.exec(line);
      if (heading) {
        if (current) sections.push(current);
        current = { heading: heading[1]!, body: "" };
      } else if (current) {
        current.body += `${line}\n`;
      }
    }
  }
  if (current) sections.push(current);

  return sections.map((section) => ({ heading: section.heading, body: section.body.trim() }));
}

function readString(data: Record<string, unknown>, key: string, sourcePath: string): string {
  const value = data[key];
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  throw new DocumentParseError(sourcePath, `frontmatter is missing a string \`${key}\``);
}

/** Parses one page's source into a document. Pure, so it is testable without a filesystem. */
export function parseDocument(
  collection: CollectionName,
  slug: string,
  sourcePath: string,
  raw: string,
): HandbookDocument {
  const frontmatter = extractFrontmatter(raw);
  if (!frontmatter) throw new DocumentParseError(sourcePath, "no YAML frontmatter");

  let data: Record<string, unknown>;
  try {
    data = (parseYaml(frontmatter) ?? {}) as Record<string, unknown>;
  } catch (cause) {
    throw new DocumentParseError(sourcePath, `frontmatter is not valid YAML: ${String(cause)}`);
  }

  const body = bodyAfterFrontmatter(raw);
  const stripped = stripMdxSyntax(body);

  const outboundLinks: string[] = [];
  for (const match of stripped.matchAll(INTERNAL_LINK)) outboundLinks.push(match[1]!);

  const document: HandbookDocument = {
    id: `${collection}:${slug}`,
    collection,
    slug,
    url: `${COLLECTIONS[collection].urlPrefix}/${slug}/`,
    sourcePath,
    title: readString(data, "title", sourcePath),
    description: readString(data, "description", sourcePath),
    version: readString(data, "version", sourcePath),
    lastUpdated: readString(data, "lastUpdated", sourcePath),
    sections: splitIntoSections(stripped),
    componentTitles: extractComponentTitles(body),
    outboundLinks,
    raw,
  };

  const freshness = data["freshness"];
  if (freshness && typeof freshness === "object") {
    document.freshness = freshness as FreshnessDeclaration;
  }

  return document;
}

/**
 * Loads every page in one collection.
 *
 * `repoRoot` is explicit rather than derived from `import.meta.url` so tests
 * can point it at a fixture directory, and so a caller running from anywhere
 * in the workspace gets the same answer.
 */
export async function loadCollection(
  repoRoot: string,
  collection: CollectionName,
): Promise<HandbookDocument[]> {
  const dir = join(repoRoot, CONTENT_ROOT, COLLECTIONS[collection].dir);
  const entries = await readdir(dir, { withFileTypes: true });

  const documents: HandbookDocument[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".mdx")) continue;
    // Section overview pages (`index.mdx`) are navigation, not content.
    if (entry.name === "index.mdx") continue;

    const slug = entry.name.slice(0, -".mdx".length);
    const absolute = join(dir, entry.name);
    const relative = `${CONTENT_ROOT}/${COLLECTIONS[collection].dir}/${entry.name}`;
    documents.push(parseDocument(collection, slug, relative, await readFile(absolute, "utf8")));
  }

  return documents.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Loads every collection into a map keyed by document id. */
export async function loadAllDocuments(repoRoot: string): Promise<Map<string, HandbookDocument>> {
  const collections = Object.keys(COLLECTIONS) as CollectionName[];
  const loaded = await Promise.all(collections.map((name) => loadCollection(repoRoot, name)));

  const byId = new Map<string, HandbookDocument>();
  for (const document of loaded.flat()) byId.set(document.id, document);
  return byId;
}
