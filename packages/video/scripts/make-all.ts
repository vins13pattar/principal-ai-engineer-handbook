/**
 * Runs the whole pipeline for one or every video, in order: narrate, transcribe, captions,
 * youtube metadata, then the narrated render. Safe to re-run; narrate and transcribe skip scenes
 * whose text has not changed. Run it on a machine with Kokoro and whisper.cpp set up.
 *
 *   node --experimental-strip-types scripts/make-all.ts [slug ...] [--voice am_michael] [--skip-render]
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { scripts } from "../src/videos/registry.ts";

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { voice: { type: "string", default: "am_michael" }, "skip-render": { type: "boolean" } },
});

const slugs = positionals.length > 0 ? positionals : Object.keys(scripts).sort();
const unknown = slugs.filter((slug) => !scripts[slug]);
if (unknown.length > 0) {
  process.stderr.write(`Unknown videos: ${unknown.join(", ")}\n`);
  process.exit(2);
}

const run = (script: string, args: string[]): boolean => {
  const result = spawnSync(
    process.execPath,
    ["--experimental-strip-types", resolve(pkg, "scripts", `${script}.ts`), ...args],
    { cwd: pkg, stdio: "inherit" },
  );
  return result.status === 0;
};

const failed: string[] = [];
let lastStep = "";
let streak = 0;
for (const slug of slugs) {
  process.stdout.write(`\n=== ${slug} ===\n`);
  const steps: [string, string[]][] = [
    ["narrate", [slug, "--voice", values.voice!]],
    ["transcribe", [slug]],
    ["captions", [slug]],
    ["youtube", [slug]],
    ...(values["skip-render"]
      ? []
      : ([["render-module", [slug, "--narrated"]]] as [string, string[]][])),
  ];
  let ok = true;
  for (const [script, args] of steps) {
    if (!run(script, args)) {
      failed.push(`${slug}: ${script}`);
      // The same step failing on consecutive videos is a setup problem, not a script problem.
      streak = script === lastStep ? streak + 1 : 1;
      lastStep = script;
      ok = false;
      break;
    }
  }
  if (ok) streak = 0;
  if (streak >= 2) {
    process.stderr.write(
      `\n"${lastStep}" failed on ${streak} videos in a row; stopping. Fix the setup and re-run.\n`,
    );
    break;
  }
}
process.stdout.write(
  failed.length === 0 ? "\nAll done.\n" : `\nFailed:\n${failed.map((f) => `  ${f}`).join("\n")}\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
