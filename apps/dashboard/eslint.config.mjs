// The shadcn design-system rules over the dashboard's markup and scripts.
// ESLint runs them because Oxlint cannot read Svelte markup ("Oxlint lints the
// `<script>` blocks of `.svelte` files. It does not parse the markup",
// shadcn-ui/lint docs/svelte.md); Biome keeps every other rule. The theme the
// rules read is the stylesheet components.json names, src/app.css ("The theme
// CSS comes from `components.json`", docs/how-it-works.md).
import { plugin as shadcn } from "@shadcn/lint";
import tsParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import svelteParser from "svelte-eslint-parser";

const settings = {
  shadcn: {
    componentImports: ["^#lib/components/"],
    note: "DESIGN.md is law; theme keys are src/lib/tokens/theme.css.",
  },
};
const rules = {
  // Property lists only; durations and easings stay tokens.
  "shadcn/no-arbitrary-values": ["error", { allow: ["transition-*"] }],
  "shadcn/no-raw-colors": "error",
  // Custom properties pass by design; raw colours in them don't.
  "shadcn/no-inline-styles": "error",
  "shadcn/no-unknown-classes": "error",
  "shadcn/require-static-classes": "error",
  "shadcn/no-restyle": [
    "error",
    {
      allow: [
        "layout",
        "num",
        "touch-hit",
        "pointer-hit",
        "mark-line",
        "focus-inset",
        "press-tint",
      ],
    },
  ],
};
export default defineConfig([
  {
    files: ["src/**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: { parser: tsParser },
    },
    plugins: { shadcn },
    settings,
    rules,
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { shadcn },
    settings,
    rules,
  },
  // "Turn `no-restyle` off inside your component directory… When you enable
  // `no-arbitrary-values` and `require-static-classes`, turn them off there
  // too." (https://github.com/shadcn-ui/lint/blob/main/docs/rules.md)
  {
    files: ["src/lib/components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
      "shadcn/require-static-classes": "off",
    },
  },
]);
