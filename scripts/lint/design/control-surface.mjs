// house/control-owns-surface: a control draws its fill, edge, lift and
// states only through the control surface (theme.css `control` and its
// looks), never with classes of its own (owner's pick, 2026-11-23: one
// surface, no control writes its own edge, fill or states).
//
// Where a class site holds `control`, every class that can stand beside it
// (on no branch apart from it, classes.mjs `separated`) is refused when it
// writes what the surface owns:
//
// - an edge or a lift: `box-shadow`, a ring or shadow variable
//   (`--tw-ring-*`, `--tw-inset-ring-*`, `--tw-shadow*`,
//   `--tw-inset-shadow*`), or a border's width or colour;
// - a state's fill: `background-color` or `background-image` under a
//   hover, focus, press, open, chosen or current variant;
// - a press that moves it: `scale`, `translate` or `transform` under a
//   press variant.
//
// A class that styles another element (a `file:` button, a `before:`, a
// descendant's `[&_x]:`) is that element's, and stands.
//
// The surface's looks set its variables (`control-quiet`, `control-danger`,
// …); a caller that needs a look the surface lacks adds one there.
import { separated, sitesOf } from "./classes.mjs";
import { declarationsOf, splitVariants } from "./tailwind.mjs";

const MESSAGE =
  "A control's fill, edge, lift and states are the control surface's (theme.css `control`): take a look that sets them (control-quiet, control-soft, control-danger, …), or add one there, rather than writing this class on the control (scripts/lint/design/control-surface.mjs).";

const EDGE_PROPERTIES =
  /^(?:box-shadow|border(?:-(?:width|color|style))?|--tw-(?:inset-)?(?:ring|shadow)[\w-]*)$/u;
const FILL_PROPERTIES = /^background-(?:color|image)$/u;
const MOVE_PROPERTIES = /^(?:scale|translate|transform|--tw-scale-[xyz])$/u;
const STATE =
  /(?:^|-)(?:hover|focus|focus-visible|focus-within|active|pressed|aria-pressed|aria-checked|aria-expanded|aria-current|aria-current-page|data-chosen|data-on|data-state|expanded)(?:$|-|\/)/u;
const PRESS = /(?:^|-)(?:active|pressed)(?:$|-)/u;

/** A variant that styles another element: a pseudo-element or a descendant. */
const ELSEWHERE = new Set([
  "file",
  "before",
  "after",
  "placeholder",
  "marker",
  "selection",
  "first-letter",
  "first-line",
  "backdrop",
  "*",
  "**",
]);
const DESCENDANT = /^\[&[^\]]*[_>~+]/u;

const judged = new Map();
/** Why a class may not stand on a control, or null when it may. */
function owned(name) {
  if (!judged.has(name)) {
    const { variants } = splitVariants(name);
    if (variants.some((v) => ELSEWHERE.has(v) || DESCENDANT.test(v))) {
      judged.set(name, false);
      return false;
    }
    const props = declarationsOf(name).map((d) => d.property);
    const inState = variants.some((v) => STATE.test(v));
    const pressed = variants.some((v) => PRESS.test(v));
    const verdict =
      props.some((p) => EDGE_PROPERTIES.test(p)) ||
      (inState && props.some((p) => FILL_PROPERTIES.test(p))) ||
      (pressed && props.some((p) => MOVE_PROPERTIES.test(p)));
    judged.set(name, verdict);
  }
  return judged.get(name);
}

/** The findings of house/control-owns-surface in a file. */
export function controlSurface(model) {
  const findings = [];
  const at = new Set();
  for (const site of sitesOf(model)) {
    const entries = site.entries ?? [];
    const controls = entries.filter((e) => e.name === "control");
    if (controls.length === 0) {
      continue;
    }
    for (const entry of entries) {
      if (
        at.has(entry.start) ||
        entry.name === "control" ||
        entry.name.startsWith("control-") ||
        !controls.some((c) => !separated(c, entry)) ||
        !owned(entry.name)
      ) {
        continue;
      }
      at.add(entry.start);
      findings.push({ start: entry.start, end: entry.end, message: MESSAGE });
    }
  }
  return findings;
}
