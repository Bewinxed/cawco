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
/** The house's own classes a kit component may carry: plan D10. */
const HOUSE = [
  "num",
  "touch-hit",
  "pointer-hit",
  "mark-line",
  "focus-inset",
  "press-tint",
];
const rules = {
  // Property lists only; durations and easings stay tokens.
  "shadcn/no-arbitrary-values": ["error", { allow: ["transition-*"] }],
  "shadcn/no-raw-colors": "error",
  // Custom properties pass by design; raw colours in them don't.
  "shadcn/no-inline-styles": "error",
  // Svelte Flow's interaction hooks, which @xyflow/svelte reads off the
  // element (`closest`), not styles: "Adding the class `nodrag` to an element
  // ensures that interacting with it doesn't trigger a drag" and "Adding the
  // `nopan` class prevents this behavior"
  // (https://svelteflow.dev/learn/customization/utility-classes). The rule's
  // own way to admit them: "Allow classes supplied by CSS outside the theme's
  // import graph" (https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-unknown-classes.md).
  "shadcn/no-unknown-classes": ["error", { allow: ["nodrag", "nopan"] }],
  "shadcn/require-static-classes": "error",
  "shadcn/no-restyle": [
    "error",
    {
      allow: ["layout", ...HOUSE],
      // A contract sets the policy for the components it matches
      // ("You can give components different rules",
      // https://github.com/shadcn-ui/lint/blob/main/docs/rules/no-restyle.md).
      contracts: [
        {
          // The kit's triggers and paneforge's Pane draw nothing of their
          // own: each renders the caller's element (bits-ui's trigger, the
          // pane's box) and adds only its data-slot (and `touch-hit`), so
          // the classes on it are that element's look, not a restyle of
          // the kit's. A class the grammar cannot classify is named.
          pattern:
            "^(CollapsibleTrigger|PopoverTrigger|DrawerTrigger|DropdownMenuTrigger|SheetTrigger|DialogTrigger|AlertDialogTrigger|Pane)$",
          allow: [
            "layout",
            "color",
            "typography",
            "spacing",
            "shape",
            "effects",
            "motion",
            ...HOUSE,
            "pressable",
            "rail-line",
            "transition-control",
            "type-*",
            "dur-*",
            "p-*",
            "px-*",
            "py-*",
            "gap-*",
            "h-*",
            "min-w-*",
            "min-h-*",
          ],
        },
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
  //
  // The kit's floating surfaces set `pointer-events` inline: bits-ui writes
  // `pointer-events: auto` into the floating wrapper's and the content's own
  // style at run time, and only an inline declaration the component owns
  // (Svelte's `style:pointer-events`) replaces it, so a closing surface lets
  // presses through to the page (floating-presence.ts `pressable`). For
  // no-inline-styles the policy's entries "apply to CSS property names"
  // (https://github.com/shadcn-ui/lint/blob/main/docs/rules.md, The policy).
  {
    files: ["src/lib/components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
      "shadcn/require-static-classes": "off",
      "shadcn/no-inline-styles": ["error", { allow: ["pointer-events"] }],
    },
  },
]);
