// @ts-check
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

const REPO = "https://github.com/vins13pattar/Principal-AI-Engineer-Interview-Handbook";

export default defineConfig({
  site: "https://vins13pattar.github.io",
  base: "/Principal-AI-Engineer-Interview-Handbook",
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
      sidebar: [
        {
          label: "Learn",
          items: [
            { label: "Overview", link: "/learn/" },
            { items: [{ autogenerate: { directory: "learn/modules" } }], label: "Modules" },
          ],
        },
        {
          label: "Build",
          items: [
            { label: "Overview", link: "/build/" },
            { items: [{ autogenerate: { directory: "build/labs" } }], label: "Labs" },
          ],
        },
        {
          label: "Architecture",
          items: [
            { label: "Overview", link: "/architecture/" },
            { items: [{ autogenerate: { directory: "architecture/systems" } }], label: "Systems" },
          ],
        },
        {
          label: "Interview",
          items: [
            { label: "Overview", link: "/interview/" },
            { items: [{ autogenerate: { directory: "interview/tracks" } }], label: "Tracks" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Overview", link: "/reference/" },
            { items: [{ autogenerate: { directory: "reference/lookups" } }], label: "Lookups" },
          ],
        },
        {
          label: "ADR",
          items: [
            { label: "Overview", link: "/adr/" },
            { items: [{ autogenerate: { directory: "adr/decisions" } }], label: "Decisions" },
          ],
        },
        {
          label: "Cheat Sheets",
          items: [
            { label: "Overview", link: "/cheatsheets/" },
            { items: [{ autogenerate: { directory: "cheatsheets/sheets" } }], label: "Sheets" },
          ],
        },
        { label: "Roadmap", link: "/roadmap/" },
      ],
    }),
  ],
});
