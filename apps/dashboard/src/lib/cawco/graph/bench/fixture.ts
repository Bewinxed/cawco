/**
 * The dials an agent puts on the routine form for its design run's pages:
 * one of each kind, each on a value the form reads (the controls' radius
 * and height, the action's colour, an arg that has every blank field say
 * what it needs).
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
    target: { cssVar: "--c-input-h" },
  },
  {
    kind: "color",
    name: "action",
    label: "Action colour",
    target: { cssVar: "--action-solid" },
  },
  {
    kind: "toggle",
    name: "attempted",
    label: "Show what each blank field needs",
    target: { arg: "attempted" },
  },
];

/** The same dials under the agent's headings (DialKit's folders). */
export const ROUTINE_DIALS_GROUPED: GraphDial[] = ROUTINE_DIALS.map((dial) => ({
  ...dial,
  group: dial.kind === "color" || dial.kind === "toggle" ? "Look" : "Shape",
}));

/** Each one's value as the page reads it off the drawing. */
export const ROUTINE_WRITTEN = {
  radius: 10,
  height: "36px",
  action: "oklch(0.555 0.17 33)",
  attempted: false,
};
