/**
 * How the address card's controls stand, by the screen it is on rather
 * than the card's width: Caw's panel is 380px at the desk and on a phone
 * alike, and the design sets peers side by side at the desk and stacks them
 * the column's width on a phone (`max-phone`, under 640px).
 */

/** A step's controls: from the start edge, side by side; stacked on a phone. */
export const STEP_PEERS =
  "flex min-w-0 flex-wrap items-center gap-space-2 max-phone:grid max-phone:grid-cols-1";

/**
 * A row's closing controls, the one to press first given first: on the
 * desk they stand at the trailing edge with that one last, on the edge
 * (`flex-row-reverse` from the end); stacked on a phone, it comes first.
 */
export const END_PEERS =
  "flex min-w-0 flex-row-reverse flex-wrap items-center justify-start gap-space-2 max-phone:grid max-phone:grid-cols-1";

/** The failure form's way out: centred side by side; stacked on a phone. */
export const CENTRED_PEERS =
  "flex min-w-0 flex-wrap items-center justify-center gap-space-2 max-phone:grid max-phone:grid-cols-1 max-phone:self-stretch";
