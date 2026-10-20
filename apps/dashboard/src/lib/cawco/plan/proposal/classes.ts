/**
 * The class strings every plan row draws with (a step's, a delegate's, a
 * sub-step's), each written once. A row is a grid: the tile's column, the
 * words, the trail; what it waits on stands under the words. Its columns
 * and lengths are PlanFrame's (`--pv-cols`, `--pv-lead-h`, `--words-in`),
 * a step row's its own item's (StepRow `--step-cols`, `--words-in`) where
 * Lanes' gutter holds two lanes. A frame drawn for a finger
 * (`data-coarse`, PhonePlan) gives every row the 44px floor.
 *
 * A row in a narrow column (Lanes' steps side by side) is laid out by its
 * own width, not the window's: its item is the container (`@container/
 * step-row` or `/delegate-row`), and the narrow layout stands its trail
 * under the words (theme containers `plan-step`, `plan-delegate`:
 * build-tokens.ts CONTAINERS).
 */

/** A row's height, gaps and words' role; its columns are its own. */
export const ROW =
  "grid items-start gap-x-space-2 min-h-c-row-lead py-c-plan-row-pad type-label text-ink-strong in-data-coarse:min-h-c-touch-floor in-data-coarse:py-c-plan-row-pad-coarse";

/** The tile's cell, one line box tall or the tile's, whichever is more. */
export const LEAD =
  "col-start-1 row-start-1 grid h-(--pv-lead-h) place-items-center";

/**
 * The words, the row's switch: the house press tint, the hover ghost, the
 * focus ring inside the box. Their tint bleeds past the words by the
 * radius's room on every side but the row's end in a narrow column, where
 * they are the row's last column.
 */
export const WORDS =
  "col-start-2 row-start-1 min-w-0 -mx-space-1 -my-space-row px-space-1 py-space-row rounded-xs text-start font-normal wrap-anywhere text-pretty press-tint focus-inset transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover";

/** The trail: what is on it, the fold's chevron, the time (the markup adds `mark-line`, which mark-line-check reads there). */
export const TRAIL =
  "col-start-3 row-start-1 flex h-(--pv-lead-h) items-center gap-space-2";

/** The fold's chevron, a quarter turn open. */
export const CHEVRON =
  "grid place-items-center text-ink-subtle [&_svg]:size-icon-sm motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out data-open:rotate-90";

/** The time, in a tabular column of a ticking clock's room, so every time ends on one x. */
export const TIME =
  "num w-c-elapsed-w text-end type-meta whitespace-nowrap text-ink-muted";

/** A list of rows. */
export const ROWS = "m-0 flex min-w-0 list-none flex-col p-0";

/** What stands on a step's words' column under its row: its tile's column (or its two lanes') and the gap. */
export const ON_WORDS = "ps-(--words-in)";

/** What stands on the words' column of a row with one tile (a delegate's, a pushed page's). */
export const ON_TILE = "ps-(--pv-tile-in)";

/** A link-ink action in meta (Open its session), its hit area the pointer's floor, a finger's under a coarse frame (the markup adds `mark-line`). */
export const OPEN_SESSION =
  "pressable inline-flex min-h-c-pointer-floor items-center gap-space-1 self-start rounded-xs type-meta text-link-ink [&_svg]:size-icon-sm in-data-coarse:min-h-c-touch-floor";

/** A delegate's report: the subagent's raised card with the tile shadow. */
export const REPORT =
  "m-0 rounded-xs bg-surface-raised px-space-3 py-space-2 type-meta text-ink-strong shadow-tile text-pretty";

/** A step's state, said in its words' ink and weight. */
export const STATE_WORDS =
  "group-state-doing/row:font-medium group-state-you/row:font-medium group-state-done/row:text-ink-muted group-state-failed/row:text-status-fail-ink";
