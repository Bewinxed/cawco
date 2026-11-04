/**
 * The decision page's first option on the Curve chip (as built): its list
 * alone, the design system's curves, Spring and the agent's curve as
 * written, at the popover's own width.
 */

import CurveChoices from "./CurveChoices.svelte";
import { curveList } from "./curve-review";

export default {
  title: "Design graph/Animation/Curve, the list",
  component: CurveChoices,
  args: curveList,
  parameters: { viewport: 256 },
};

/** The Curve chip open on a clip running on the house ease-out. */
export const ListOnly = {};
