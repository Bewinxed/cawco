/**
 * The room a block's sized piece draws in (core views-library.ts
 * `DIAGRAM_SIZES`: its agent's pick), on the reply's size container
 * (reply-frame.ts): `small` and `medium` their token (`c-diagram-small`,
 * `c-diagram-medium`) under the container's width, `full` that whole width
 * (`100cqi`: the turn's, once the reply holds a `full` one,
 * `data-block-wide`), and on a phone every size that whole width. A
 * Diagram, a picture, a clip and a page all take it.
 */
import { DIAGRAM_SIZES, type DiagramSize } from "@cawco/core/views-library";

export const BLOCK_ROOM: Record<DiagramSize, string> = {
  small: "w-c-diagram-small max-w-[100cqi] max-phone:w-[100cqi]",
  medium: "w-c-diagram-medium max-w-[100cqi]",
  full: "w-[100cqi]",
};

/** The reply's measure, never past its room: a slideshow's and a sound's width. */
export const MEASURE_ROOM = BLOCK_ROOM.medium;

/**
 * A picture given no size: its own size up to the reply's measure, and in
 * a Row a share of the row, never under `--c-picture-min` before the Row
 * wraps it.
 */
export const PICTURE_ROOM =
  "w-fit max-w-c-diagram-medium in-data-layout-row:w-auto in-data-layout-row:flex-1 in-data-layout-row:basis-c-picture-min";

/** The size a program gives, when it gives one the library has. */
export const blockSize = (size: unknown): DiagramSize | undefined =>
  DIAGRAM_SIZES.find((one) => one === size);
