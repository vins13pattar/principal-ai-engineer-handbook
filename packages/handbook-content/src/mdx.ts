/**
 * Turning an `.mdx` page body into plain prose a generation agent can read.
 *
 * Every handbook page is MDX, not Markdown: the body carries `import`
 * statements and JSX components (`<Aside>`, `<Mermaid>`, `<TradeOff>`,
 * `<InterviewQuestion>`, `<CardGrid>`). A Markdown parser either chokes on
 * those or passes the raw tags through, and a tag that reaches a dialogue
 * agent reaches the listener.
 *
 * The rule here is **strip the tags, keep the text**. An `<Aside>` usually
 * carries the sharpest caveat on the page -- "production-shaped, not
 * production-ready" lives inside one -- so dropping component bodies would
 * discard exactly the material worth talking about.
 */

const FENCE = /^(\s*)(```+|~~~+)/;

/**
 * Splits source into alternating prose and fenced-code segments.
 *
 * Everything downstream must respect this split: inside a code fence, `<T>` is
 * a generic parameter and `{x}` is a dict literal, not JSX. Stripping tags
 * without checking would quietly corrupt the code examples, which for this
 * handbook are usually the point of the page.
 */
export function splitOnCodeFences(source: string): { text: string; isCode: boolean }[] {
  const segments: { text: string; isCode: boolean }[] = [];
  const lines = source.split("\n");

  let buffer: string[] = [];
  let closing: string | null = null;

  const flush = (isCode: boolean): void => {
    if (buffer.length > 0) segments.push({ text: buffer.join("\n"), isCode });
    buffer = [];
  };

  for (const line of lines) {
    const match = FENCE.exec(line);
    if (closing === null) {
      if (match) {
        flush(false);
        closing = match[2]!;
      }
      buffer.push(line);
      continue;
    }

    buffer.push(line);
    // A fence closes on a marker at least as long as the one that opened it.
    if (match && match[2]!.startsWith(closing)) {
      flush(true);
      closing = null;
    }
  }

  flush(closing !== null ? true : false);
  return segments;
}

const IMPORT_LINE = /^import\s.+?from\s+["'].+?["'];?\s*$/gm;
const JSX_TAG = /<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*?)?\/?>/g;
const JSX_EXPRESSION_LINE = /^\s*\{[^}]*\}\s*$/gm;

/**
 * Removes MDX machinery from a page body, leaving prose and code intact.
 *
 * Only capitalised tags are treated as components, which is MDX's own rule --
 * `<div>` and `<br />` are HTML and stay, `<Aside>` is a component and goes.
 * That also means a lowercase generic in prose survives untouched.
 */
export function stripMdxSyntax(source: string): string {
  const cleaned = splitOnCodeFences(source)
    .map(({ text, isCode }) => {
      if (isCode) return text;
      return text.replace(IMPORT_LINE, "").replace(JSX_EXPRESSION_LINE, "").replace(JSX_TAG, "");
    })
    .join("\n");

  // Collapse the blank-line runs the removals leave behind.
  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extracts the `title="..."` attributes off components before they are stripped.
 *
 * These carry real editorial content -- an `<Aside>`'s title is the warning
 * itself, and a `<Mermaid>`'s title is the only prose description of a diagram
 * that otherwise renders client-side and is invisible to any text pipeline.
 */
export function extractComponentTitles(source: string): string[] {
  const titles: string[] = [];
  for (const { text, isCode } of splitOnCodeFences(source)) {
    if (isCode) continue;
    for (const tag of text.match(JSX_TAG) ?? []) {
      const match = /\stitle=(?:"([^"]*)"|'([^']*)')/.exec(tag);
      const title = match?.[1] ?? match?.[2];
      if (title) titles.push(title);
    }
  }
  return titles;
}
