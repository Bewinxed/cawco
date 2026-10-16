// "Every state is handled": typescript-eslint's switch-exhaustiveness-check
// over the dashboard and every package. A switch over a union or an enum
// names each member or has a default. The rule reads types ("This rule
// requires type information to run", typescript-eslint.io), so each file is
// read through TypeScript's project service (`projectService`), the nearest
// tsconfig deciding; a Svelte file's `<script lang="ts">` too, with
// `.svelte` as an extra extension (svelte-eslint-parser's README).
//
// Its own config, apart from eslint.config.mjs (the design system's rules,
// which every lane runs on its files): run from the repository's root as
//   apps/dashboard/node_modules/.bin/eslint -c apps/dashboard/eslint.states.config.mjs apps/dashboard/src packages
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import svelteParser from "svelte-eslint-parser";

const plugins = { "@typescript-eslint": tsPlugin };
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
  {
    files: ["apps/dashboard/src/**/*.ts", "packages/*/src/**/*.ts"],
    languageOptions: { parser: tsParser, parserOptions: typed },
    plugins,
    rules,
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
