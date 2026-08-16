/**
 * Stable, readable ids for the excerpts in one source pack.
 *
 * `SourceExcerpt` has no id, and `(documentId, heading)` is not a key: a
 * document may repeat a heading, and two distinct headings may normalise to
 * the same slug. The identity that actually exists is position — the excerpt's
 * ordered occurrence in the pack. These ids are a readable label for that
 * position, not a claim of natural uniqueness, and they mean nothing against a
 * different pack.
 *
 * One definition, used to render the prompt and to validate what comes back.
 * Two definitions would drift, and the drift would look like the model
 * inventing citations.
 */

import type { SourceExcerpt } from "@handbook/content";

/**
 * NFKC, lowercase, runs of non-letter/non-digit/non-mark to "-", trimmed.
 *
 * `\p{L}`, `\p{N}` and `\p{M}` are Unicode-aware on purpose. Stripping to
 * ASCII would empty every Devanagari and Tamil heading in the corpus and
 * route them all through the ordinal fallback, which reads as a bug in the
 * fallback rather than in the slug. `\p{M}` (combining marks) matters
 * because Devanagari and Tamil compose base letters with dependent vowel
 * signs and viramas that are their own Unicode category — without it, those
 * marks fall into the "non-letter" bucket and every combined syllable gets
 * torn apart.
 */
export function slugForHeading(heading: string): string {
  return heading
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Ids for every excerpt, positionally aligned with the input.
 *
 * Uniqueness is established against the set of ids already issued, not by
 * counting uses of a base. A generated suffix and a natural slug share one
 * namespace: headings `Foo`, `Foo`, `Foo 2` issue `foo-2` for the second
 * `Foo`, and `Foo 2` then slugs naturally to `foo-2`. Per-base counting
 * returns a duplicate for that pack and for its reordering.
 */
export function deriveExcerptIds(excerpts: readonly SourceExcerpt[]): string[] {
  const used = new Set<string>();
  const ordinals = new Map<string, number>();
  const ids: string[] = [];

  for (const excerpt of excerpts) {
    const ordinal = ordinals.get(excerpt.documentId) ?? 0;
    ordinals.set(excerpt.documentId, ordinal + 1);

    const slug = slugForHeading(excerpt.heading);
    const base = `${excerpt.documentId}#${slug === "" ? `section-${ordinal}` : slug}`;

    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }

    used.add(candidate);
    ids.push(candidate);
  }

  return ids;
}
