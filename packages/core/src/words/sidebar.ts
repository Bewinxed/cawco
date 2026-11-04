/**
 * The sidebar's words, for the dashboard and the native app alike.
 *
 * The dashboard imports this module; `bun run words` writes it into the app
 * as `Words.Sidebar` (CawCoCore/Words.generated.swift), and `words:check`
 * fails the typecheck chain when that file is stale. So a word is changed
 * here or nowhere.
 */
export const sidebarWords = {
  /** A session renamed, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  notRenamedThen: "so it was not renamed.",
  /** A scratch session kept, refused by the hub: what came of it (`hubRefusal`). */
  notKeptThen: "so it was not kept.",
  /** A session removed, refused by the hub: what came of it (`hubRefusal`). */
  sessionNotRemovedThen: "so the session was not removed. Try again.",
  /** A workspace's held files unread, the hub refusing: what came of it (`hubRefusal`). */
  heldUnreadThen: "so what the workspace holds is unread.",
  /** A workspace archived, refused by the hub: what came of it (`hubRefusal`). */
  notArchivedThen: "so the workspace was not archived. Try again.",
  /**
   * WORDS OWED (a placeholder): the archive confirm's line (dashboard
   * LiveSessionMenu) when what the workspace serves still waits on the
   * person, `names` each artifact's name: confirming archives it anyway.
   */
  archiveStillWaiting: (names: readonly string[]) =>
    `[words owed: archiveStillWaiting] ${names.join(", ")}`,
  /** The projects list is empty and no machine runs CawCo yet. */
  noProjectsNoMachines:
    "No projects yet — start one with New project. Once CawCo runs on a machine, its checkouts group here too.",
  /** The projects list is empty while machines are joined. */
  noProjects: "No projects yet — name a checkout to group its sessions.",
  /** The phone's and narrow window's burger, which opens the sidebar over the page. */
  openNavigation: "Open navigation",
  /** The sessions' sort: its button, named with the order it holds, and the order by last activity. */
  sortSessions: (order: string) => `Sort sessions — currently ${order}`,
  lastActivity: "Last activity",
};
