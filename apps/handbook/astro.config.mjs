// @ts-check
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

const REPO = "https://github.com/vins13pattar/principal-ai-engineer-handbook";

// Cloudflare serves every deployment from a domain root, so this site has no `base` path.
//
// `SITE_URL` is set explicitly in the Cloudflare build settings and is the only one of these that
// works on Workers Builds — `CF_PAGES_URL` is a Cloudflare *Pages* variable and is simply absent
// there, which would silently stamp the fallback onto every canonical URL and the whole sitemap.
// It is kept as the second choice so a Pages deployment still works unchanged. See ADR-0007.
const site = process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? "https://handbook.vinodspattar.in";

export default defineConfig({
  site,
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    starlight({
      title: "Principal AI Engineer Handbook",
      description:
        "An open-source knowledge system for Principal AI Engineers: production architecture, hands-on labs, and interview preparation.",
      social: [{ icon: "github", label: "GitHub", href: REPO }],
      editLink: {
        baseUrl: `${REPO}/edit/main/apps/handbook/`,
      },
      lastUpdated: true,
      pagination: true,
      customCss: ["./src/styles/global.css"],
      plugins: [starlightLinksValidator()],
      // Navigation rules, so this stays legible as sections grow:
      //
      // 1. Two levels, never three. The old shape nested every page under a
      //    redundant middle group ("Learn > Modules > Module 4"), which cost a
      //    click and told the reader nothing they could not infer.
      // 2. Every group is `collapsed`. Starlight auto-expands the group holding
      //    the current page, so exactly one section is ever open — that open
      //    section is what tells the reader where they are.
      // 3. Each section opens with an "Overview" that explains the section and
      //    indexes it, so the group label is always a place you can go.
      // 4. Group labels say what the section contains ("Decision Records", not
      //    "ADR"). The sidebar is the first thing a new reader parses.
      sidebar: [
        { label: "Start here", link: "/start-here/" },
        {
          collapsed: true,
          label: "Learn — the concepts",
          items: [
            { label: "Overview", link: "/learn/" },
            { autogenerate: { directory: "learn/modules" } },
          ],
        },
        {
          collapsed: true,
          label: "Build — running labs",
          items: [
            { label: "Overview", link: "/build/" },
            { autogenerate: { directory: "build/labs" } },
          ],
        },
        {
          collapsed: true,
          label: "Architecture — design reviews",
          items: [
            { label: "Overview", link: "/architecture/" },
            { autogenerate: { directory: "architecture/systems" } },
          ],
        },
        {
          collapsed: true,
          label: "Interview — by round",
          items: [
            { label: "Overview", link: "/interview/" },
            { autogenerate: { directory: "interview/tracks" } },
          ],
        },
        {
          collapsed: true,
          label: "Reference — quick lookups",
          items: [
            { label: "Overview", link: "/reference/" },
            { autogenerate: { directory: "reference/lookups" } },
          ],
        },
        {
          collapsed: true,
          label: "Cheat Sheets",
          items: [
            { label: "Overview", link: "/cheatsheets/" },
            { autogenerate: { directory: "cheatsheets/sheets" } },
          ],
        },
        {
          collapsed: true,
          label: "Decision Records — why it is built this way",
          items: [
            { label: "Overview", link: "/adr/" },
            { autogenerate: { directory: "adr/decisions" } },
          ],
        },
        { label: "Roadmap", link: "/roadmap/" },
      ],
    }),
  ],
});
