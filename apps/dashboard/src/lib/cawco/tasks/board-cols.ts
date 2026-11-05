/**
 * A board column's width under 640px of page (a split's pane or a phone):
 * the board's width less space-8, so the next column peeks, never narrower
 * than a desk's column (c-board-col-min) or the board itself. The board
 * (TaskBoard) and its skeleton (ProjectPage) stand on it alike.
 */
export const COL_PHONE =
  "max(calc(100% - var(--space-8)), min(100%, var(--c-board-col-min)))";
