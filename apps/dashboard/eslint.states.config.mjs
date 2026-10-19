// "Every state is handled": typescript-eslint's switch-exhaustiveness-check
// over the dashboard and every package. A switch over a union or an enum
// names each member or has a default. The rule reads types ("This rule
// requires type information to run", typescript-eslint.io), so each file is
// read through TypeScript's project service (`projectService`), the nearest
// tsconfig deciding; a Svelte file's `<script lang="ts">` too, with
// `.svelte` as an extra extension (svelte-eslint-parser's README).
//
// Its own config, apart from eslint.config.mjs (the design system's rules,
// which every lane runs on its files), run from the repository's root by
// scripts/states-lint.ts (`bun run lint`), which reads the files in batches.
import { plugin as shadcn } from "@shadcn/lint";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import svelteParser from "svelte-eslint-parser";
import { house } from "./eslint-plugin-house.mjs";

// The design system's plugins are registered and none of their rules run:
// a file's `eslint-disable` naming one of their rules (eslint.config.mjs
// runs them) then names a rule this config knows, not an undefined one.
const plugins = { "@typescript-eslint": tsPlugin, shadcn, house };
const rules = { "@typescript-eslint/switch-exhaustiveness-check": "error" };
const typed = {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,
};

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/.svelte-kit/**",
      "**/dist/**",
      "**/build/**",
      "**/.build-next/**",
    ],
  },
  // A directive for the design system's rules is eslint.config.mjs's to
  // judge (it runs them); here it is neither used nor unused.
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
  {
    files: ["apps/dashboard/src/**/*.ts", "packages/*/src/**/*.{ts,tsx}"],
    languageOptions: { parser: tsParser, parserOptions: typed },
    plugins,
    rules,
  },
  // The agent's browser code (the canvas host, the preview overlay, the
  // stage host's canvas) is its own project, tsconfig.browser.json (the
  // DOM's lib, React's JSX), which the project service, finding only
  // tsconfig.json, never reads.
  {
    files: [
      "packages/agent/src/canvas-host/**/*.{ts,tsx}",
      "packages/agent/src/preview-overlay/**/*.{ts,tsx}",
      "packages/agent/src/stage-host/canvas/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: false,
        project: ["../../packages/agent/tsconfig.browser.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/dashboard/src/**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        ...typed,
        parser: tsParser,
        extraFileExtensions: [".svelte"],
      },
    },
    plugins,
    rules,
  },
]);
