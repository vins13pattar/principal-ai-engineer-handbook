/**
 * Inspect what the loader sees, without generating anything.
 *
 * Run from the repository root:
 *
 *   node --experimental-strip-types packages/handbook-content/src/cli.ts
 *   node --experimental-strip-types packages/handbook-content/src/cli.ts module:06-mcp
 *
 * Deliberately runs under Node's type stripping rather than through a bundler,
 * matching how `scripts/lint-content-structure.ts` runs. That keeps the package
 * honest about which TypeScript syntax it may use.
 */

import { COLLECTION_NAMES } from "./collections.ts";
import { loadAllDocuments } from "./loader.ts";
import { buildSourcePack } from "./source-pack.ts";

const repoRoot = process.cwd();
const documents = await loadAllDocuments(repoRoot);
const requested = process.argv[2];

if (!requested) {
  const counts = new Map<string, number>();
  for (const document of documents.values()) {
    counts.set(document.collection, (counts.get(document.collection) ?? 0) + 1);
  }

  console.log(`${documents.size} documents\n`);
  for (const name of COLLECTION_NAMES) {
    console.log(`  ${name.padEnd(14)} ${counts.get(name) ?? 0}`);
  }
  console.log(`\nPass a document id to build a source pack, e.g. module:06-mcp`);
} else {
  const pack = buildSourcePack(documents, requested);

  console.log(`${pack.topic}\n`);
  console.log(`  primary       ${pack.primary.documentId}  (v${pack.primary.version})`);
  if (pack.primary.verifiedAgainst) {
    console.log(`  verified      ${pack.primary.verifiedAgainst}`);
  }
  console.log(`  related       ${pack.related.map((d) => d.documentId).join(", ") || "none"}`);
  console.log(`  excerpts      ${pack.excerpts.length}`);
  console.log(`  est. tokens   ${pack.estimatedTokens.toLocaleString()}`);
  console.log(`  source hash   ${pack.sourceHash.slice(0, 16)}`);
  if (pack.droppedForBudget.length > 0) {
    console.log(`  dropped       ${pack.droppedForBudget.join(", ")}`);
  }
}
