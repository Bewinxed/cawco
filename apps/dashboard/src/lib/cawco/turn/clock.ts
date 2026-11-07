/**
 * The turn's clock, one formatter for every row: `toLocaleTimeString`
 * builds the locale's formatter afresh on each call, and a row's speaker
 * line is drawn as the row mounts — a whole page of them as a pane is
 * shown or read back. Find's places read the same clock as the turns they
 * point at (find/conversation-find).
 */
export const TURN_CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
