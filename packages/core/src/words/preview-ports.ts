/**
 * What the hub says when every preview port is in use (hub preview.ts
 * `everyPortTaken`): the refusal an agent's artifact_create and the
 * dashboard's preview read. The app draws none of it, so it is not written
 * into it (scripts/words-swift.ts).
 */

/**
 * What keeps each port of the range (hub preview.ts `portHolders`). Any
 * port none of these keeps is taken back from the preview used least
 * recently, so this is said only when all of them are in use.
 */
export interface PortHolders {
  /** Ports another program on the hub's machine holds. */
  others: number;
  /** A preview, a page or a canvas open on a screen. */
  screens: number;
  /** A session that is running, or a preview such a session holds or shows. */
  sessions: number;
}

/** "a, b and c", or "a, b or c" with `or`. */
const listed = (items: string[], or = false): string =>
  new Intl.ListFormat("en", {
    type: or ? "disjunction" : "conjunction",
  }).format(items);

export const previewPortWords = {
  /** Every port of `range` (like 3457–3556) is in use: by what, how many each, and what frees one. */
  everyPortTaken: (range: string, held: PortHolders): string => {
    const by = [
      held.screens ? `${held.screens} by previews open on a screen` : "",
      held.sessions ? `${held.sessions} by sessions that are running` : "",
      held.others
        ? `${held.others} by other programs on the hub's machine`
        : "",
    ].filter(Boolean);
    const free = [
      held.screens ? "close a preview you aren't using" : "",
      held.sessions ? "end a session that has a preview or a canvas" : "",
      held.others ? "stop one of those programs" : "",
    ].filter(Boolean);
    const action = listed(free, true);
    return `Every preview port (${range}) is in use: ${listed(by)}. ${action.charAt(0).toUpperCase()}${action.slice(1)}, then show this one again.`;
  },
};
