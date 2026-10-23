/**
 * A guided journey's shared looks (RelayJourney, the stream relay's; the
 * cawco address's): how a step's mark reads, and the class strings every
 * journey card draws its notes, meta line and controls in.
 */

/** How a step's mark reads: its tick, its failure, work running, standing on the person, or its number while it waits. */
export type JourneyMark =
  "done" | "failed" | "working" | "standing" | "waiting";

/** A step's note: meta, muted. */
export const NOTE =
  "min-w-0 text-meta text-ink-muted text-pretty wrap-anywhere";
/** A failure's note, in the fail ink. */
export const FAIL =
  "min-w-0 text-meta text-status-fail-ink text-pretty wrap-anywhere";
/** Needs you's meta line (NeedsCard's `.meta`): meta, muted, one line, at every width. */
export const META = "min-w-0 max-w-full truncate text-meta text-ink-muted";
/** A step's controls: side by side, each the column's width in a narrow card (one grid column), `space-2` apart. */
export const CONTROLS =
  "flex min-w-0 flex-wrap items-center gap-space-2 @max-field-group:grid @max-field-group:grid-cols-1";
/** The words under the title: on the title's edge (the lead column and `space-3`), on the card's own edge in a narrow card. */
export const UNDER_TITLE =
  "flex min-w-0 flex-col ps-(--title-edge) @max-field-group:ps-0";
/** Where the title's words start: past the lead column and `space-3`. */
export const TITLE_EDGE = "calc(var(--c-row-lead) + var(--space-3))";
