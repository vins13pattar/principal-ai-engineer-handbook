/**
 * Extracts level-2 Markdown headings ("## Heading") from a page body, in
 * order. Used to verify a content page contains every section its type
 * requires (see REQUIRED_MODULE_SECTIONS etc. in schemas.ts) without needing
 * a full Markdown/MDX parser — a fenced code block containing a line that
 * starts with "## " is the one case this would misreport, which is rare
 * enough in practice (and cheap enough to spot in review) not to justify
 * pulling in a Markdown AST parser for a CI lint step.
 */
export function extractHeadings(body: string): string[] {
  const headingPattern = /^##\s+(.+?)\s*$/gm;
  const headings: string[] = [];
  for (const match of body.matchAll(headingPattern)) {
    headings.push(match[1]!.trim());
  }
  return headings;
}

/**
 * Returns the subset of `required` not present (case-sensitively) among
 * `headings`, preserving `required`'s order.
 */
export function findMissingSections(
  headings: readonly string[],
  required: readonly string[],
): string[] {
  const present = new Set(headings);
  return required.filter((section) => !present.has(section));
}
