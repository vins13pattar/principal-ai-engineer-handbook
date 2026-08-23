### 1. The clash between static rendering and a live toggle

**Host:** Welcome back — today we're digging into ADR-0003, which is all about rendering Mermaid diagrams on a site that also has to support dark mode. The tricky part is that Mermaid only knows how to render one theme at a time, but our readers can flip that dark mode toggle whenever they feel like it, no page reload required.

**Guest:** Right, and that mismatch is really the whole story here. If you bake the diagrams into SVG at build time, you get a fast page with zero rendering JavaScript shipped to the browser, but you're locking in one theme forever. So the question the team had to answer was blunt: do we pre-render for speed, or render client-side so the diagrams can actually react live to that toggle?

### 2. Weighing the options, landing on mermaid.render()

**Host:** So walk me through the actual options on the table. Where did the team start looking?

**Guest:** First was build-time rendering with rehype-mermaid, which is great because it ships zero client JS and even works without JavaScript enabled. But rehype-mermaid drives a headless Chromium during astro build — so now every contributor and every CI run needs that dependency. Then there's client-side rendering with mermaid dot run, Mermaid's own DOM-scanning API, which is simple to wire up but replaces the diagram element's content in place — once it consumes the source text to draw the diagram, that text is gone, so re-rendering later for a theme change has nothing to work from.

**Host:** So neither of those actually solves the re-render problem. What was the third option?

**Guest:** mermaid dot render, called with an id and the source text, which lets you keep the original source in a data- attribute on the container so it survives the render instead of being consumed. Pair that with a MutationObserver watching html's data-theme attribute — the same attribute Starlight's toggle already sets — and a theme flip just triggers a re-render from that stored source. That's what got implemented in Mermaid.astro: render once on load, then re-render live on any theme change, no duplicate build artifacts.

### 3. Living with the trade-offs

**Host:** So what's the actual cost of living with this? I imagine there's a flash before the diagram renders, and presumably it just doesn't work without JavaScript at all.

**Guest:** Right on both counts — you get a brief flash of the raw pre fallback before Mermaid hydrates, and no JS means no diagram, full stop, so we added role=img plus that visible fallback text to keep it accessible rather than just broken. In exchange the build pipeline stays fast with no headless browser to flake in CI, and there's one sharp gotcha we documented right in the component: diagram source has to come in as a code prop from a .mmd file, not slot content, because MDX mangles whitespace-sensitive syntax. If analytics ever show a real chunk of no-JS readers, that's the trigger to revisit toward build-time SVG pairs, but for now this is accepted and shipped in Mermaid.astro.
