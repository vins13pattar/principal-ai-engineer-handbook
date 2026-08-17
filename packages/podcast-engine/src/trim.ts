/**
 * Cutting a script back to the length that was actually asked for.
 *
 * This exists because instructions do not work. Three runs were asked for a
 * length three different ways -- a character budget, a character budget with an
 * explicit ten-percent tolerance, and a turn count -- and overran by 48%, 57%
 * and 96%. The overrun got worse as the instruction got more precise. The model
 * can count turns; it does not stop at the number.
 *
 * So length stops being a request and becomes arithmetic. The model still
 * decides what the episode says and in what order; code decides how much of it
 * is rendered.
 *
 * Beat by beat rather than over the flat list, because a flat trim takes the
 * whole ending off -- the close is the last thing written and the first thing a
 * length cut would drop. Every beat keeps at least its first turn, so no beat
 * the planner asked for vanishes silently.
 */

import type { DialogueScript, DialogueTurn } from "./dialogue.ts";
import type { EpisodePlan } from "./schema.ts";

export interface TrimResult {
  script: DialogueScript;
  /** Indices into the original `turns`, in order. Empty when nothing was cut. */
  dropped: number[];
  charactersBefore: number;
  charactersAfter: number;
}

interface Indexed {
  index: number;
  turn: DialogueTurn;
}

/**
 * Clamps a turn's beat tag into the range the plan actually has.
 *
 * A model that tags a turn `beat: 9` on a five-beat plan has made a labelling
 * mistake, not a structural one -- the turn is still dialogue that belongs
 * somewhere. Dropping it would lose content over a number; clamping keeps it
 * and costs the trim a little accuracy at the edge.
 */
function beatOf(turn: DialogueTurn, beatCount: number): number {
  return Math.min(Math.max(turn.beat, 1), beatCount);
}

export function trimToBudget(
  script: DialogueScript,
  plan: EpisodePlan,
  charsPerSecond: number,
): TrimResult {
  const beatCount = plan.beats.length;
  const charactersBefore = script.turns.reduce((total, turn) => total + turn.text.length, 0);

  const byBeat = new Map<number, Indexed[]>();
  script.turns.forEach((turn, index) => {
    const beat = beatOf(turn, beatCount);
    const bucket = byBeat.get(beat);
    if (bucket) bucket.push({ index, turn });
    else byBeat.set(beat, [{ index, turn }]);
  });

  const keep = new Set<number>();

  // The episode's whole budget is shared out across the beats that actually
  // received turns, in proportion to the seconds they were planned for.
  //
  // Without this, tagging decides length. A model that puts every turn in beat
  // 1 -- a labelling mistake, and a plausible one -- would have the episode cut
  // to one beat's worth of characters, turning a five-minute request into
  // sixty seconds. Redistribution makes the trim depend on the tags for
  // *where* it cuts and never for *how much*.
  const totalBudget = plan.plannedSeconds * charsPerSecond;
  const activeSeconds = plan.beats.reduce(
    (total, beat, position) =>
      (byBeat.get(position + 1)?.length ?? 0) > 0 ? total + beat.targetSeconds : total,
    0,
  );

  // Whatever a beat does not spend passes to the next one.
  //
  // Cuts can only fall on turn boundaries, so a beat that stops just short of
  // its budget leaves most of a turn unspent. Without a carry those gaps
  // accumulate: a real five-beat run came out at 207 seconds against a
  // 300-second budget, having thrown away roughly a turn per beat. The carry
  // makes the shortfalls cancel instead of compound.
  let carry = 0;

  plan.beats.forEach((beat, position) => {
    const turns = byBeat.get(position + 1) ?? [];
    if (turns.length === 0) return;

    // A plan whose active beats all have zero target seconds cannot be shared
    // out proportionally; split the budget evenly rather than dividing by zero.
    const share =
      activeSeconds > 0
        ? beat.targetSeconds / activeSeconds
        : 1 / plan.beats.filter((_, index) => (byBeat.get(index + 1)?.length ?? 0) > 0).length;
    const budget = totalBudget * share + carry;
    let spent = 0;

    for (const [order, { index, turn }] of turns.entries()) {
      // The first turn of a beat is kept whatever it costs. A beat trimmed to
      // nothing is a beat the planner asked for and the episode never covers,
      // which is worse than a beat that runs slightly long.
      if (order === 0 || spent + turn.text.length <= budget) {
        keep.add(index);
        spent += turn.text.length;
      }
    }

    carry = budget - spent;
  });

  // Second pass: spend whatever the beats left over.
  //
  // The carry moves a beat's remainder forward, but the last beat's remainder
  // has nowhere to go, and a beat whose next turn is much larger than its
  // share leaves a gap the carry cannot fill either. A real run came out 9%
  // under budget this way. Re-offering the dropped turns in their original
  // order takes that back without ever exceeding the total.
  let total = script.turns.reduce(
    (sum, turn, index) => (keep.has(index) ? sum + turn.text.length : sum),
    0,
  );

  script.turns.forEach((turn, index) => {
    if (keep.has(index)) return;
    if (total + turn.text.length > totalBudget) return;
    keep.add(index);
    total += turn.text.length;
  });

  const kept = script.turns.filter((_, index) => keep.has(index));
  const dropped = script.turns.map((_, index) => index).filter((index) => !keep.has(index));

  return {
    script: { turns: kept },
    dropped,
    charactersBefore,
    charactersAfter: kept.reduce((total, turn) => total + turn.text.length, 0),
  };
}
