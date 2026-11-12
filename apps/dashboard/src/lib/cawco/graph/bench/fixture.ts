/**
 * The dials an agent puts on the routine form for its design run's pages:
 * one of each kind, each on a value the form reads (the controls' radius
 * and height, its fields' fill (every field reads it; no one ink token
 * carries all the form's text: labels read `--color-ink-row`, values `--color-ink-strong`), an arg that has every blank field show
 * its error).
 */
import type { GraphDial } from "../dials";

export const ROUTINE_DIALS: GraphDial[] = [
  {
    kind: "number",
    name: "radius",
    label: "Corner radius",
    min: 0,
    max: 20,
    step: 1,
    unit: "px",
    target: { cssVar: "--radius-md" },
  },
  {
    kind: "select",
    name: "height",
    label: "Field height",
    options: ["30px", "36px", "44px"],
    target: { cssVar: "--spacing-c-input-h" },
  },
  {
    kind: "color",
    name: "fill",
    label: "Field colour",
    target: { cssVar: "--color-surface-raised" },
  },
  {
    kind: "toggle",
    name: "attempted",
    label: "Show field errors",
    target: { arg: "attempted" },
  },
];

/** The same dials under the agent's headings (a panel's folders). */
export const ROUTINE_DIALS_GROUPED: GraphDial[] = ROUTINE_DIALS.map((dial) => ({
  ...dial,
  group: dial.kind === "color" || dial.kind === "toggle" ? "Look" : "Shape",
}));

/** Each one's value as the page reads it off the drawing. */
export const ROUTINE_WRITTEN = {
  radius: 10,
  height: "36px",
  fill: "oklch(0.995 0.004 85)",
  attempted: false,
};
