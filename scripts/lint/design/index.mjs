// The design rules as Golar runs them (golar.config.ts), with the options
// the dashboard ran them under ESLint (apps/dashboard/eslint.config.mjs at the
// move): which rules a file gets, and each one's allow lists. A file is named
// by its path from apps/dashboard, as the ESLint config named it.
import path from "node:path";
import { defineRule } from "golar/unstable";
import { classJoins } from "./class-join.mjs";
import { clipWithMove } from "./clip-move.mjs";
import { groupNotNeedsAncestor } from "./group-not.mjs";
import { DASHBOARD, ignored, modelOf, reportAt } from "./model.mjs";
import { rawClassValues } from "./raw-values.mjs";
import {
  dimensionBindings,
  rawDurationReads,
  scrollIntoViews,
} from "./restricted.mjs";
import {
  arbitraryValues,
  inlineStyles,
  rawSvgColors,
  restyle,
  staticClasses,
  unknownClasses,
} from "./shadcn.mjs";
import { variantOrder } from "./variant-order.mjs";

const KIT = "src/lib/components/ui/";

/**
 * What a caller may write on a kit part: where it stands, never how it
 * looks. Every look (colour, type, padding, radius, border, shadow,
 * transition, a press) is a variant of the part itself
 * (src/lib/components/ui), so the same role draws the same everywhere
 * (DESIGN.md, Components). Entries are shadcn/lint class groups or class
 * names ("Class group … Values in that group", "Class or pattern … An exact
 * class or wildcard pattern",
 * https://github.com/shadcn-ui/lint/blob/main/docs/rules.md#contracts).
 * `layout` is not used: that category also holds display, overflow, cursor,
 * whitespace, transforms and text alignment, which change a part's look.
 */
const PLACEMENT = [
  // Its margin, from the parts beside it.
  ...["m", "mx", "my", "ms", "me", "mbs", "mbe", "mt", "mr", "mb", "ml"],
  // Its share of a flex row or a grid, and its place in the track.
  ...["basis", "grow", "shrink", "order", "flex-1", "flex-auto", "flex-none"],
  ...["flex-initial", "align-self", "justify-self", "place-self"],
  ...["self-box-*", "justify-self-box-*"],
  ...["col-start-end", "col-start", "col-end"],
  ...["row-start-end", "row-start", "row-end"],
  // Its position and inset in its container, and its stacking.
  ...["position", "inset", "inset-x", "inset-y", "start", "end"],
  ...["inset-bs", "inset-be", "top", "right", "bottom", "left", "z"],
  // Its width constraints.
  ...["w", "min-w", "max-w", "inline-size", "min-inline-size"],
  "max-inline-size",
  // Markers that style nothing themselves: a group or peer named for a
  // descendant or sibling to read (each entry matches the marker and its
  // `/<name>`, tailwind.mjs `isMarkerClass`), and the hit areas, a transparent box
  // round the part that draws nothing (DESIGN.md, The 44 Touch Rule, The 24
  // Pointer Rule).
  ...["group", "peer", "touch-hit", "touch-hit-always", "pointer-hit"],
];

// A value that changes while its element is mounted is written inline as
// the standard property main (282054d12) wrote it, in each file below: a
// custom property changing on an element restyles its whole subtree in
// Blink (it is inherited), a standard inline property restyles the element
// alone. So for these files the rule's own advice ("use CSS custom
// properties for dynamic values") is what it may not have; `allow`
// "Exempts CSS properties from inline-style checks"
// (https://raw.githubusercontent.com/shadcn-ui/lint/main/docs/rules/no-inline-styles.md),
// file by file, only the properties that file writes inline at main.
const INLINE_STYLES = {
  "src/lib/cawco/ContextMeter.svelte": ["background-color", "width"],
  "src/lib/cawco/HoverPanel.svelte": ["block-size", "inline-size"],
  "src/lib/cawco/MachinesEmpty.svelte": ["animation"],
  "src/lib/cawco/MachinesList.svelte": ["color"],
  // Add machine's window stands where its anchor and its height put it,
  // read every frame its height tweens and as the keyboard rises.
  "src/lib/cawco/connect/ConnectWindow.svelte": [
    "bottom",
    "left",
    "max-height",
    "top",
    "transform-origin",
  ],
  "src/lib/cawco/connect/InstallRow.svelte": ["color"],
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
    "height",
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
  "src/routes/(app)/project/[id]/+page.svelte": ["animation", "block-size"],
  "src/routes/(app)/project/new/+page.svelte": ["block-size"],
  // A decision page's media measure their own box while mounted: Preview's
  // frame takes the height its page or component canvas says it stands at,
  // and Canvas's frame the box its drawing's shape gives it in its well
  // (decisions/host Preview.svelte, Canvas.svelte), so each is written
  // inline as the standard property, as the files above.
  "src/lib/cawco/decisions/host/Canvas.svelte": ["block-size", "inline-size"],
  "src/lib/cawco/decisions/host/Preview.svelte": ["block-size", "inline-size"],
};

/**
 * Each rule's options for a file, or null where the file does not get it.
 * The kit's own parts (src/lib/components/ui) get no restyle, arbitrary
 * value or static-class rule: "Turn `no-restyle` off inside your component
 * directory… When you enable `no-arbitrary-values` and
 * `require-static-classes`, turn them off there too"
 * (https://github.com/shadcn-ui/lint/blob/main/docs/rules.md). Their
 * floating surfaces set `pointer-events` inline: bits-ui writes
 * `pointer-events: auto` into the floating wrapper's and the content's own
 * style at run time, and only an inline declaration the component owns
 * (Svelte's `style:pointer-events`) replaces it (floating-presence.ts
 * `pressable`).
 */
function optionsFor(rule, file) {
  const inKit = file.startsWith(KIT);
  switch (rule) {
    case "design/no-restyle":
    case "design/require-static-classes":
      return inKit ? null : { allowClasses: PLACEMENT_CLASSES };
    case "design/no-arbitrary-values":
      // Property lists only; durations and easings stay tokens.
      return inKit ? null : { allow: ["transition-*"] };
    case "design/no-inline-styles":
      return {
        allow: INLINE_STYLES[file] ?? (inKit ? ["pointer-events"] : []),
      };
    case "design/no-unknown-classes":
      // Svelte Flow's interaction hooks, which @xyflow/svelte reads off the
      // element (`closest`), not styles: "Adding the class `nodrag` to an
      // element ensures that interacting with it doesn't trigger a drag" and
      // "Adding the `nopan` class prevents this behavior"
      // (https://svelteflow.dev/learn/customization/utility-classes).
      return { allow: ["nodrag", "nopan"] };
    case "house/no-raw-duration-read":
      return file === "src/lib/cawco/motion/curves.svelte.ts" ? null : {};
    default:
      return {};
  }
}

/**
 * The PLACEMENT entries that are classes, not class groups: the markers and
 * the hit areas, a transparent box round the part that draws nothing
 * (DESIGN.md, The 44 Touch Rule, The 24 Pointer Rule), and the box
 * self-alignments. The groups are the properties shadcn.mjs
 * PLACEMENT_PROPERTIES names.
 */
const PLACEMENT_CLASSES = PLACEMENT.filter(
  (entry) =>
    entry.includes("*") ||
    [
      "group",
      "peer",
      "touch-hit",
      "touch-hit-always",
      "pointer-hit",
      "flex-1",
      "flex-auto",
      "flex-none",
      "flex-initial",
    ].includes(entry)
);

const FIND = {
  "house/variant-order": variantOrder,
  "house/group-not-needs-ancestor": groupNotNeedsAncestor,
  "house/no-raw-duration-read": rawDurationReads,
  "house/no-dimension-binding": dimensionBindings,
  "house/no-scroll-into-view": scrollIntoViews,
  "house/no-clip-with-move": clipWithMove,
  "house/no-class-join": classJoins,
  "house/no-raw-class-values": rawClassValues,
  "design/no-unknown-classes": unknownClasses,
  "design/no-arbitrary-values": arbitraryValues,
  "design/no-restyle": restyle,
  "design/require-static-classes": staticClasses,
  "design/no-inline-styles": inlineStyles,
  "design/no-raw-svg-colors": rawSvgColors,
};

/** A file's path as the options name it: from apps/dashboard. */
const named = (fileName) => path.relative(DASHBOARD, fileName);

export const designRules = Object.entries(FIND).map(([name, find]) =>
  defineRule({
    name,
    setup(context) {
      const file = context.sourceFile.fileName;
      const options = optionsFor(name, named(file));
      if (!options) {
        return;
      }
      const model = modelOf(file);
      for (const finding of find(model, options)) {
        if (!ignored(model, name, finding.start)) {
          reportAt(context, finding.start, finding.end, finding.message);
        }
      }
    },
  })
);
