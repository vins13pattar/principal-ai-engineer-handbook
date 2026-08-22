/**
 * Assembling the authoritative context an episode is generated from.
 *
 * A source pack is a closed set. Whatever is in it, a generation agent may
 * talk about; whatever is not, it may not. That only holds if the pack is
 * built from the real pages and every claim can be traced back to one, which
 * is why every excerpt here carries the document id and section heading it
 * came from.
 */

import { createHash } from "node:crypto";
import { documentIdForUrl } from "./collections.ts";
import type { HandbookDocument } from "./loader.ts";

export interface SourceExcerpt {
  documentId: string;
  /** Site path, so a citation in a transcript can be a working link. */
  url: string;
  title: string;
  heading: string;
  body: string;
}

export interface SourcePackDocument {
  documentId: string;
  url: string;
  sourcePath: string;
  title: string;
  version: string;
  lastUpdated: string;
  /** Set when the page declares one. Absent is meaningful: most pages have none. */
  verifiedAgainst?: string;
  verifiedOn?: string;
  classification?: string;
}

export interface SourcePack {
  topic: string;
  primary: SourcePackDocument;
  related: SourcePackDocument[];
  excerpts: SourceExcerpt[];
  /**
   * Hash over the raw source of every document in the pack, in id order.
   *
   * §30's freshness check compares this against the episode manifest. It is
   * taken over the file bytes rather than the parsed prose so that a change
   * the parser happens to discard still counts as a change -- the check should
   * be conservative about saying "nothing moved".
   */
  sourceHash: string;
  /** Rough token count, for the context budget. See `estimateTokens`. */
  estimatedTokens: number;
  /**
   * How long the primary page takes to read, in seconds.
   *
   * The number an episode aims at, because the episode exists so somebody can
   * hear the page instead of reading it. Measured from the prose rather than
   * taken from `estimatedMinutes`, which is study time: module 6 declares 50
   * minutes and is 17.8 minutes of reading, the difference being code, exercises
   * and the lab. It also works for the collections that declare no minutes at
   * all, which is most of them.
   */
  readingSeconds: number;
  /**
   * Documents dropped to stay inside the budget, in the order they were cut.
   *
   * Recorded rather than silently omitted: an episode generated from a
   * truncated pack should be able to say what it did not see.
   */
  droppedForBudget: string[];
}

export interface SourcePackOptions {
  /** Maximum estimated tokens. Related documents are dropped to fit; the primary never is. */
  maxTokens?: number;
  /** How many link hops out from the primary to follow. One by default. */
  depth?: number;
}

const DEFAULT_MAX_TOKENS = 25_000;

/**
 * Approximates token count at four characters per token.
 *
 * Deliberately crude and deliberately not a tokeniser: the budget exists to
 * stop a pack running away, and being wrong by 15% does not change that
 * decision. Anything relying on an exact count should count with the model's
 * own tokeniser at call time instead of trusting this.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Adult reading speed for technical prose, in words per minute.
 *
 * 220 is mid-range for careful reading of unfamiliar material; casual prose
 * runs faster and code slower. The episode target inherits whatever error is
 * here, so it is one number in one place rather than a constant per caller.
 */
const WORDS_PER_MINUTE = 220;

export function readingSeconds(document: HandbookDocument): number {
  const words = document.sections
    .map((section) => section.body)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.round((words / WORDS_PER_MINUTE) * 60);
}

function toPackDocument(document: HandbookDocument): SourcePackDocument {
  const packed: SourcePackDocument = {
    documentId: document.id,
    url: document.url,
    sourcePath: document.sourcePath,
    title: document.title,
    version: document.version,
    lastUpdated: document.lastUpdated,
  };
  if (document.freshness?.verifiedAgainst)
    packed.verifiedAgainst = document.freshness.verifiedAgainst;
  if (document.freshness?.verifiedOn) packed.verifiedOn = String(document.freshness.verifiedOn);
  if (document.freshness?.classification) packed.classification = document.freshness.classification;
  return packed;
}

function excerptsFor(document: HandbookDocument): SourceExcerpt[] {
  return document.sections
    .filter((section) => section.body.length > 0)
    .map((section) => ({
      documentId: document.id,
      url: document.url,
      title: document.title,
      heading: section.heading,
      body: section.body,
    }));
}

function documentCost(document: HandbookDocument): number {
  return excerptsFor(document).reduce((total, excerpt) => total + estimateTokens(excerpt.body), 0);
}

/**
 * Follows a page's internal links outward, breadth-first, to `depth` hops.
 *
 * Only links that resolve to a loaded document are followed, so a link to a
 * section overview or an anchor on the same page contributes nothing. The
 * primary is never included in its own related set.
 */
export function resolveRelated(
  documents: Map<string, HandbookDocument>,
  primary: HandbookDocument,
  depth: number,
): HandbookDocument[] {
  const seen = new Set<string>([primary.id]);
  const ordered: HandbookDocument[] = [];

  let frontier = [primary];
  for (let hop = 0; hop < depth; hop += 1) {
    const next: HandbookDocument[] = [];
    for (const document of frontier) {
      for (const link of document.outboundLinks) {
        const id = documentIdForUrl(link);
        if (!id || seen.has(id)) continue;
        const target = documents.get(id);
        if (!target) continue;
        seen.add(id);
        ordered.push(target);
        next.push(target);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }

  return ordered;
}

/**
 * Builds a source pack for one page and the pages it links to.
 *
 * Throws when the primary document does not exist, rather than returning an
 * empty pack -- a typo in a document id should stop the run, not produce an
 * episode generated from nothing.
 */
export function buildSourcePack(
  documents: Map<string, HandbookDocument>,
  primaryId: string,
  options: SourcePackOptions = {},
): SourcePack {
  const primary = documents.get(primaryId);
  if (!primary) {
    throw new Error(
      `unknown document id "${primaryId}" (loaded ${documents.size} documents; ids look like "module:06-mcp")`,
    );
  }

  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const related = resolveRelated(documents, primary, options.depth ?? 1);

  // The primary is always included whole, even if it alone exceeds the budget:
  // a pack without its own subject is worse than an oversized one, and the
  // caller can see the overrun in `estimatedTokens`.
  const included: HandbookDocument[] = [primary];
  const dropped: string[] = [];
  let total = documentCost(primary);

  for (const candidate of related) {
    const cost = documentCost(candidate);
    if (total + cost > maxTokens) {
      dropped.push(candidate.id);
      continue;
    }
    included.push(candidate);
    total += cost;
  }

  const hash = createHash("sha256");
  for (const document of [...included].sort((a, b) => a.id.localeCompare(b.id))) {
    hash.update(document.id);
    hash.update("\0");
    hash.update(document.raw);
    hash.update("\0");
  }

  return {
    topic: primary.title,
    primary: toPackDocument(primary),
    related: included.slice(1).map(toPackDocument),
    excerpts: included.flatMap(excerptsFor),
    sourceHash: hash.digest("hex"),
    estimatedTokens: total,
    readingSeconds: readingSeconds(primary),
    droppedForBudget: dropped,
  };
}
