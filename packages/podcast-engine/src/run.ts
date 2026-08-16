/**
 * Where a run's artifacts live, and when the directory comes into existence.
 *
 * Creation has exactly one defined point -- after pre-call validation and
 * before the model call -- because both alternatives are wrong. Reserving after
 * the model returns leaves nowhere to write diagnostics when it returns
 * unusable output, which is the most likely first-contact failure. Reserving at
 * process start creates directories for invocations that never had a chance of
 * running.
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * A path segment safe on every platform, or an error.
 *
 * Rejects rather than repairs the traversing names: `.` and `..` (and any
 * other all-dot name, which is exactly as ambiguous) survive the replacement
 * below unchanged, and quietly rewriting them would invent a directory the
 * operator never named.
 */
export function sanitiseSegment(value: string): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (cleaned === "" || /^\.+$/.test(cleaned)) {
    throw new Error(`"${value}" cannot be used as a directory name`);
  }
  return cleaned;
}

/**
 * A run id that sorts chronologically and cannot collide within a second.
 *
 * The suffix is not decoration. Second-resolution timestamps collide, and with
 * the never-overwrite rule a collision would surface as a spurious refusal --
 * the safety rule appearing to misfire. The clock and the suffix are arguments
 * so tests can force both outcomes without sleeping.
 */
export function makeRunId(now: Date, suffix: string): string {
  return `${now
    .toISOString()
    .replace(/\.\d+Z$/, "Z")
    .replace(/:/g, "-")}-${suffix}`;
}

/**
 * Reserves the run directory, atomically.
 *
 * The leaf is created with `recursive: false` so an existing path fails rather
 * than succeeding silently. That is what makes the collision check a check and
 * not a race.
 */
export async function reserveRunDirectory(
  root: string,
  documentSegment: string,
  runId: string,
): Promise<string> {
  const parent = join(root, documentSegment);
  await mkdir(parent, { recursive: true });

  const path = join(parent, runId);
  try {
    await mkdir(path, { recursive: false });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      throw new Error(`run directory already exists, refusing to overwrite: ${path}`);
    }
    throw error;
  }
  return path;
}
