/**
 * The three ways side by side: One list, Lanes and Crew first, each its
 * whole plan as the reader's own screen draws it, under one line saying how
 * many there are. The decision page's first drawing, so every way stands in
 * its first view (Ways.svelte).
 * Component Story Format 3, live components.
 */
import Ways from "./Ways.svelte";

export default {
  title: "Plan/Three ways",
  component: Ways,
  args: { tileSize: 18, lineWeight: 4, sweepSeconds: 1.2 },
};

/**
 * On your screen · the three ways side by side, each its whole plan, the
 * next one at the edge where the row runs past the frame. Its width: three
 * 390px columns and their two 18px gaps.
 */
export const Side = {
  parameters: { viewport: 1206 },
};
