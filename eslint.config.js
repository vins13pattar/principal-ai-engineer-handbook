// @ts-check
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import astro from "eslint-plugin-astro";
import globals from "globals";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/public/pagefind/**",
      "labs/**",
      // Agent worktrees are full checkouts of this repo living inside it, so
      // linting them reports every finding a second time against a path that
      // is not the working tree. Scoped to `worktrees/` rather than `.claude/`
      // so anything hand-written elsewhere under `.claude/` is still linted.
      ".claude/worktrees/**",
      // Python virtualenvs for the local synthesis runner. Already gitignored,
      // but eslint does not read .gitignore, so `site-packages` reaches the
      // linter: torch ships a bundled preact and a model viewer, urllib3 an
      // emscripten worker. Thirty errors, none of them ours, none fixable here.
      // No hand-written source lives under a `.venv`.
      "**/.venv/**",
    ],
  },
  js.configs.recommended,
  ...astro.configs["flat/recommended"],
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript itself catches genuine undefined-variable errors; the base rule
      // false-positives on ambient global types used only in type position (e.g. NodeJS.*).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["**/*.astro/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // CLI scripts are expected to print to stdout.
    //
    // Scoped to this one file rather than "**/src/cli.ts": the podcast-providers
    // and handbook-content packages each have their own src/cli.ts, and a
    // package-wide glob would silently exempt their existing console calls too,
    // which is not what this task's console usage in podcast-engine needs.
    files: ["scripts/**/*.ts", "packages/podcast-engine/src/cli.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
