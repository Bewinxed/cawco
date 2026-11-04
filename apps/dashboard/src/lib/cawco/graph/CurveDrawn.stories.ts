/**
 * The decision page's second option on the Curve chip: the chosen curve
 * drawn over the same list, its two control points dragged (or moved with
 * the arrow keys) to bend a curve of his own, as Jitter's easing popover
 * draws its preset over its intensity.
 */

import CurveChoices from "./CurveChoices.svelte";
import { curveList, EASE_OUT_POINTS } from "./curve-review";

export default {
  title: "Design graph/Animation/Curve, drawn",
  component: CurveChoices,
  args: {
    ...curveList,
    bend: { at: EASE_OUT_POINTS, onbend: () => undefined },
  },
  parameters: { viewport: 256 },
};

/** The Curve chip open on the house ease-out, drawn with its two points to drag. */
export const Drawn = {};
