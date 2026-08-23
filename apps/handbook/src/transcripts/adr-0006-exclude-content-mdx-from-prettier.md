### 1. Six pages, silently corrupted

**Host:** So we're digging into ADR-0006 today, and the setup is almost comic if it weren't so nasty: six pages across your Learn module — Modules 1, 2, 4, 5, 6, and 7 — had Python code examples that just silently stopped being valid Python. Not a crash, not a warning, just quietly broken. Walk me through what actually happened.

**Guest:** Right, so these code examples weren't sitting at the top level of an MDX file — they were nested inside a custom JSX/MDX component we use for walkthroughs. Someone ran pnpm format, which runs Prettier across the repo, and Prettier rewrote several of these nested fences: it stripped indentation off lines that came after a blank line inside the fence, merged comments onto the previous line of code, and it backslash-escaped underscores and asterisks in identifiers like \_\_init\_\_ and self.\_admit because it treated them as Markdown emphasis syntax instead of code.

**Host:** And none of that got caught anywhere in CI, which is the part that really stings — pnpm format and pnpm build ran fine, right through it.

**Guest:** Exactly, neither of those checks the actual contents of a fenced block against its declared language, so mangled Python sailed straight through. The only content-specific check we had was a lint script validating required headings and frontmatter — nothing was ever looking inside the fences, so there was no seatbelt at any layer for this.

### 2. Three ways out, and why two don't hold

**Host:** So once you know nothing's watching inside those fences, you've got three ways to respond. Walk me through them, starting with the one that feels cheapest.

**Guest:** Cheapest is just declaring a rule: never put a blank line inside a nested fenced code block. But that's a landmine with no lint rule behind it — some future contributor who doesn't know the rule hits the trigger, and gets silently corrupted code instead of a formatting diff. A failure mode that severe can't rest on people remembering a rule nobody wrote down anywhere enforceable. The second option is ripping out CodeWalkthrough and similar components so every fence lives at the top level, which does dodge the bug, but it throws away the narrative framing those components give for every future example in the handbook, not just the six that got hit.

**Host:** So one option is unenforceable, and the other is a permanent tax on every doc author going forward. What made the third option — excluding content docs from Prettier entirely — the obvious landing spot?

**Guest:** Because it matches the actual severity: authors already hand-format code inside those fences since they're excerpts from real source, not generated output, so Prettier touching them was never adding value, just risk. Excluding the docs MDX means we only lose automatic formatting of prose and JSX outside the fences — purely cosmetic — while removing the one thing that could silently mangle real code. Once nothing inside those fences could be trusted anyway, the trade was easy.

### 3. The decision, the repair, and the cost that's left over

**Host:** So walk me through what actually landed in the repo. Not the philosophy anymore, the mechanics — what's the diff look like?

**Guest:** One line in .prettierignore, apps/handbook/src/content/docs plus the glob for MDX, so the whole docs tree is hands-off for Prettier going forward. The six corrupted pages got hand-repaired, and then verified by literally parsing every fenced Python block with Python's own ast.parse — not the linter, not Prettier, the actual language parser, which is strong enough to catch this exact failure mode, one that neither Prettier nor the existing content linter would. Module 5, Agent Engineering, and Module 7, LangGraph, are two of those six, and they're the ones I'd point anyone to if they want to see real corrupted-then-restored examples rather than a synthetic case. The catch is what we lose: pnpm format:check no longer touches prose or JSX in those files, so sloppy spacing or wrapping in docs just won't get flagged anymore, that's a permanent, accepted cost. And it means every future code example dropped into a CodeWalkthrough is on the author to verify by hand, because a clean pnpm verify literally does not mean the code inside those fences is valid — nothing in CI parses Markdown fences today. Even this ADR says so itself: if Prettier ever ships a fix and someone's tempted to re-enable it, the obligation is to re-run the same ast.parse check against real content first, not just trust a changelog entry.

**Host:** Which is really the whole shape of this decision in one sentence — trade a small, visible, cosmetic cost for removing a silent, invisible, correctness-breaking one. That's ADR-0006. Thanks for walking through it.

### Not covered

The planner wanted these and found nothing in the source to support them:

- What the corrupted Module 5 and Module 7 code examples actually taught about agent loops or LangGraph (the ADR only references these pages as evidence of the bug, not their content)
- Any detail of the agent loop, tool-calling, or LangGraph checkpointing material itself, since it's unrelated to the Prettier decision beyond being the corrupted content
