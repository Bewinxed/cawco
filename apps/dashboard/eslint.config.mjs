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
import { house } from "./eslint-plugin-house.mjs";

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
  // Two states that can hold together never leave their winner to Tailwind's
  // variant sort (eslint-plugin-house.mjs).
  "house/variant-order": "error",
  // A group-not-/peer-not- variant with no group/peer in the file never
  // matches on its own (eslint-plugin-house.mjs).
  "house/group-not-needs-ancestor": "error",
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
    plugins: { shadcn, house },
    settings,
    rules,
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: { parser: tsParser },
    plugins: { shadcn, house },
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
  // A value that changes while its element is mounted is written inline as
  // the standard property main (282054d12) wrote it, in each file below: a
  // custom property changing on an element restyles its whole subtree in
  // Blink (it is inherited), a standard inline property restyles the element
  // alone. So for these files the rule's own advice ("use CSS custom
  // properties for dynamic values") is what it may not have; `allow`
  // "Exempts CSS properties from inline-style checks"
  // (https://raw.githubusercontent.com/shadcn-ui/lint/main/docs/rules/no-inline-styles.md),
  // file by file, only the properties that file writes inline at main.
  ...Object.entries({
    "src/lib/cawco/ContextMeter.svelte": ["background-color", "width"],
    "src/lib/cawco/HoverPanel.svelte": ["block-size", "inline-size"],
    "src/lib/cawco/MachinesEmpty.svelte": ["animation"],
    "src/lib/cawco/MachinesList.svelte": ["color"],
    "src/lib/cawco/OlderRows.svelte": ["animation", "inline-size"],
    "src/lib/cawco/Shell.svelte": ["height"],
    "src/lib/cawco/UnlockKeychain.svelte": ["min-height"],
    "src/lib/cawco/UsageMeter.svelte": ["flex-basis", "inset-inline-start"],
    "src/lib/cawco/accounts/OrderList.svelte": ["transform"],
    "src/lib/cawco/accounts/StrategyFigure.svelte": ["height"],
    "src/lib/cawco/blocks/Block.svelte": ["grid-column"],
    "src/lib/cawco/config/ConfigRail.svelte": ["color"],
    "src/lib/cawco/config/EditorFrame.svelte": ["color", "min-height"],
    "src/lib/cawco/config/SectionFrame.svelte": ["min-height"],
    "src/lib/cawco/config/SectionRow.svelte": ["color"],
    "src/lib/cawco/decisions/DecisionsView.svelte": ["animation"],
    "src/lib/cawco/decisions/graph/DecisionGroup.svelte": [
      "block-size",
      "inline-size",
    ],
    "src/lib/cawco/find/MentionField.svelte": ["left", "top"],
    "src/lib/cawco/home/HomeRecent.svelte": ["inline-size"],
    "src/lib/cawco/home/NeedsCard.svelte": ["color"],
    "src/lib/cawco/home/SessionTree.svelte": ["animation"],
    "src/lib/cawco/home/WorkTabs.svelte": ["animation", "opacity"],
    "src/lib/cawco/lightbox/Lightbox.svelte": ["pointer-events"],
    "src/lib/cawco/motion/Rail.svelte": [
      "height",
      "opacity",
      "transform",
      "width",
    ],
    "src/lib/cawco/preview/PinCard.svelte": ["left", "max-width", "top"],
    "src/lib/cawco/project/CardFace.svelte": ["color"],
    "src/lib/cawco/project/TemplateCards.svelte": ["translate"],
    "src/lib/cawco/side/SideSheet.svelte": ["height"],
    "src/lib/cawco/spawn/EffortPips.svelte": [
      "left",
      "opacity",
      "pointer-events",
      "width",
    ],
    "src/lib/cawco/spawn/LifetimeChip.svelte": ["color"],
    "src/lib/cawco/spawn/LocationSection.svelte": [
      "color",
      "opacity",
      "pointer-events",
      "transform",
    ],
    "src/lib/cawco/spawn/MachinesChip.svelte": [
      "border-radius",
      "opacity",
      "transform",
    ],
    "src/lib/cawco/spawn/ModelSection.svelte": [
      "animation",
      "height",
      "opacity",
      "transform",
    ],
    "src/lib/cawco/spawn/NewSessionDialog.svelte": ["pointer-events"],
    "src/lib/cawco/spawn/NsPopover.svelte": ["pointer-events"],
    "src/lib/cawco/spawn/NsPopoverGroup.svelte": ["height", "pointer-events"],
    "src/lib/cawco/spawn/PermissionSection.svelte": [
      "color",
      "opacity",
      "transform",
    ],
    "src/lib/cawco/spawn/ProjectChip.svelte": ["color"],
    "src/lib/cawco/spawn/Segmented.svelte": ["transform"],
    "src/lib/cawco/spawn/ToolChips.svelte": ["color"],
    "src/lib/cawco/spawn/TriggerMenu.svelte": ["color", "opacity", "transform"],
    "src/lib/cawco/tasks/TaskActivity.svelte": ["block-size"],
    "src/lib/cawco/transcript/Composer.svelte": [
      "block-size",
      "bottom",
      // main's `height` on the edit row, as a floor: its words may wrap (8b).
      "min-height",
      "inline-size",
      "opacity",
      "transform",
      "translate",
    ],
    "src/lib/cawco/transcript/DelegateTail.svelte": ["inline-size"],
    "src/lib/cawco/transcript/DelegateTray.svelte": [
      "animation-delay",
      "min-inline-size",
    ],
    // `-webkit-backdrop-filter`, in the spelling the rule takes an entry in.
    "src/lib/cawco/transcript/HeadFade.svelte": [
      "WebkitBackdropFilter",
      "backdrop-filter",
      "mask-image",
    ],
    "src/lib/cawco/transcript/Prompt.svelte": ["block-size", "translate"],
    "src/lib/cawco/transcript/RecallWheel.svelte": [
      "bottom",
      "height",
      "left",
      "perspective",
      "width",
    ],
    "src/lib/cawco/transcript/Transcript.svelte": ["padding-top"],
    "src/lib/cawco/transcript/TranscriptSkeleton.svelte": ["width"],
    "src/lib/cawco/updates/ChannelCards.svelte": [
      "inset-inline-end",
      "inset-inline-start",
      "left",
      "transform",
    ],
    "src/lib/cawco/usage/History.svelte": ["animation"],
    "src/lib/cawco/usage/Relay.svelte": ["flex-grow", "inset-inline-start"],
    "src/lib/cawco/usage/Rings.svelte": ["stroke-dashoffset"],
    "src/lib/cawco/usage/SessionsChip.svelte": ["min-block-size"],
    "src/lib/cawco/usage/WeekMark.svelte": ["stroke-dashoffset"],
    "src/lib/cawco/usage/WhereItGoes.svelte": ["animation", "opacity"],
    "src/lib/cawco/views/ViewPipeline.svelte": ["inline-size"],
    "src/lib/cawco/views/canvas/TaskEdgeLine.svelte": [
      "stroke",
      "stroke-dasharray",
      "stroke-linecap",
      "stroke-width",
    ],
    "src/lib/cawco/views/ViewRoutines.svelte": ["block-size"],
    "src/lib/cawco/workspace/PaneLeaf.svelte": ["inset", "width"],
    "src/lib/cawco/workspace/PaneTabs.svelte": ["height"],
    "src/lib/components/features/DiffView.svelte": ["height", "max-block-size"],
    "src/lib/components/features/tool-cards/OutputBlock.svelte": ["color"],
    "src/lib/components/features/workflows/TemplateInput.svelte": [
      "transform-origin",
    ],
    "src/lib/components/features/workflows/WorkflowEdge.svelte": [
      "stroke",
      "stroke-width",
    ],
    "src/lib/components/ui/fluid-tabs/TabsList.svelte": [
      "height",
      "transform",
      "width",
    ],
    "src/lib/components/ui/machine-row/machine-row.svelte": ["color"],
    "src/lib/components/ui/progress/progress.svelte": ["transform"],
    "src/lib/components/ui/section-header/section-header.svelte": ["color"],
    "src/routes/(app)/config/models/+page.svelte": ["block-size"],
    "src/routes/(app)/motion/delegate-tray/+page.svelte": ["width"],
    "src/routes/(app)/project/\\[id\\]/+page.svelte": [
      "animation",
      "block-size",
    ],
    "src/routes/(app)/project/new/+page.svelte": ["block-size"],
  }).map(([file, allow]) => ({
    files: [file],
    rules: { "shadcn/no-inline-styles": ["error", { allow }] },
  })),
]);
