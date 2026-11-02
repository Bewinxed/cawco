/**
 * What the hub says when every preview port is taken (hub preview.ts
 * `everyPortTaken`): the refusal an agent's artifact_create and the
 * dashboard's preview read. The app draws none of it, so it is not written
 * into it (scripts/words-swift.ts).
 */

/** How many ports of the range each kind of holder keeps (hub preview.ts `portHolders`). */
export interface PortHolders {
  /** Ports nothing of the hub's keeps: another program on the hub's machine holds each. */
  others: number;
  /** An artifact's preview of a server in a workspace that is still active. */
  previews: number;
  /** A project's pages. */
  projects: number;
  /** A session that runs or is open on a screen, or an artifact such a session holds or shows. */
  sessions: number;
}

/** "a, b and c", or "a, b or c" with `or`. */
const listed = (items: string[], or = false): string =>
  new Intl.ListFormat("en", {
    type: or ? "disjunction" : "conjunction",
  }).format(items);

export const previewPortWords = {
  /**
   * Every port of `range` (like 3457–3556) is held: by whom, how many
   * each, and what frees one. A preview of a workspace keeps its port
   * while its workspace holds the work, so deleting a preview whose work
   * is done frees one.
   */
  everyPortTaken: (range: string, held: PortHolders): string => {
    const by = [
      held.previews
        ? `${held.previews} by previews of workspaces that are still active`
        : "",
      held.sessions
        ? `${held.sessions} by sessions that run or are open on a screen`
        : "",
      held.projects ? `${held.projects} by projects' pages` : "",
      held.others
        ? `${held.others} by other programs on the hub's machine`
        : "",
    ].filter(Boolean);
    const free = [
      held.previews ? "delete a preview whose work is done" : "",
      held.sessions ? "end a session that has a preview or a canvas" : "",
      held.others ? "stop one of those programs" : "",
      held.projects ? "delete a project you no longer need" : "",
    ].filter(Boolean);
    const action = listed(free, true);
    return `Every preview port (${range}) is taken: ${listed(by)}. ${action.charAt(0).toUpperCase()}${action.slice(1)}, then show this one again.`;
  },
};
