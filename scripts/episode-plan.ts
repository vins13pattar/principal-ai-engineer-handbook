/**
 * What generating every remaining episode would cost and take.
 *
 * Read-only. Spends nothing, and exists so the decision to run the series is
 * made against numbers rather than a guess.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { buildSourcePack, loadAllDocuments } from "@handbook/content";
import { estimateCreateCost } from "@handbook/podcast-engine";
import { beatsForSeconds, buildPlanRequest } from "@handbook/podcast-engine";
import { parseConfig } from "@handbook/podcast-engine";
import { readFile } from "node:fs/promises";

const root = process.cwd();
const config = parseConfig(JSON.parse(await readFile(join(root, "podcast.config.json"), "utf8")));
const documents = await loadAllDocuments(root);

const published = new Set(
  (await readdir(join(root, "apps/handbook/src/transcripts")).catch(() => [])).map((name) =>
    name.replace(/\.md$/, ""),
  ),
);

export function slugFor(documentId: string): string {
  return documentId.replace(/[:/]/g, "-");
}

const rows = [...documents.values()]
  .map((doc) => {
    let pack;
    try {
      pack = buildSourcePack(documents, doc.id);
    } catch {
      return null;
    }
    const duration = pack.readingSeconds;
    const { request } = buildPlanRequest(pack, {
      maxOutputTokens: config.llm.maxOutputTokens,
      requestedSeconds: duration,
    });
    const cost = estimateCreateCost(request, config.prices, {
      beats: beatsForSeconds(duration),
      characterBudget: Math.round(duration * config.tts.charsPerSecond),
      review: true,
    });
    return {
      id: doc.id,
      slug: slugFor(doc.id),
      minutes: duration / 60,
      calls: cost.calls,
      expected: cost.expected,
      done: published.has(slugFor(doc.id)),
    };
  })
  .filter((row) => row !== null)
  // Learn modules first: they are the longest, the most listened to, and the
  // ones an episode most obviously serves. Then everything else by id, so a
  // resumed run is deterministic.
  .sort((a, b) => {
    const rank = (id: string) => (id.startsWith("module:") ? 0 : 1);
    return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
  });

const remaining = rows.filter((row) => !row.done);
const money = remaining.reduce((sum, row) => sum + row.expected, 0);
const minutes = remaining.reduce((sum, row) => sum + row.minutes, 0);
const calls = remaining.reduce((sum, row) => sum + row.calls, 0);

// `--ids` is the machine-readable form the series runner consumes, so the
// runner and this projection can never disagree about what is left or in what
// order.
if (process.argv.includes("--ids")) {
  for (const row of remaining) console.log(`${row.id} ${row.slug}`);
  process.exit(0);
}

console.log(`${rows.length} documents, ${rows.length - remaining.length} already published\n`);
console.log("remaining:");
for (const row of remaining) {
  console.log(
    `  ${row.minutes.toFixed(1).padStart(5)} min  $${row.expected.toFixed(2)}  ${String(row.calls).padStart(3)} calls  ${row.id}`,
  );
}
console.log(
  `\n${remaining.length} episodes · ${minutes.toFixed(0)} min of audio · ${calls} model calls · $${money.toFixed(2)}`,
);
// Render is local and free, but it is not instant, and it is the reason a
// series takes an evening rather than an hour.
const renderMinutes = remaining.reduce(
  (sum, row) => sum + (row.calls * 0 + (row.minutes * 60 * 0.073 + 3.16 * row.minutes * 3.5)) / 60,
  0,
);
console.log(`roughly ${renderMinutes.toFixed(0)} min of local synthesis on top`);
