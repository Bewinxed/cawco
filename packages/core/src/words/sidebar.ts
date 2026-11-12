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
   * The archive confirm's line (dashboard LiveSessionMenu) when what the
   * workspace serves still waits on the person, `names` each artifact's
   * name: confirming archives it anyway. The one name is read as the list
   * of one (`join`), the subset the Swift words take (scripts/words-swift.ts).
   */
  archiveStillWaiting: (names: readonly string[]) =>
    names.length === 1
      ? `${names.join(", ")} still waits on you and goes with it.`
      : `${names.join(", ")} still wait on you and go with it.`,
  /** A session row's menu item for its workspace of its own, and its confirm's button (dashboard LiveSessionMenu). */
  archiveWorkspace: "Archive workspace",
  /** The archive confirm's button while it runs. */
  archiveWorkspacePending: "Archiving…",
  /** The archive confirm's title, when the workspace holds nothing that is nowhere else. */
  archiveWorkspaceTitle: "Archive this workspace?",
  /** The archive confirm's first line for a workspace whose record `file` is damaged. */
  archiveWorkspaceDamaged: (file: string) =>
    `Its record ${file} is damaged, so it cannot run.`,
  /** The archive confirm's line naming what goes, on the machine `where`. */
  archiveWorkspaceGoes: (where: string) =>
    `Archiving deletes its private copy, its boundary and its records on ${where}, for good. Your folder stays as it is, and every other workspace runs as before.`,
  /** The archive confirm's title, when the workspace holds work that is nowhere else. */
  archiveHeldTitle: "This workspace holds work that is nowhere else",
  /** What the workspace's private copy of `path` on `machine` holds, `holds` and `size` its machine's words. */
  archiveHeldWhat: (
    path: string,
    machine: string,
    holds: string,
    size: string
  ) =>
    `Its private copy of ${path} on ${machine} holds ${holds}, ${size} in all.`,
  /** What Save and archive does, the carry written on `machine`. */
  archiveHeldSave: (machine: string) =>
    `Save and archive writes its unlanded commits and changes to a carry on ${machine} (in ~/.cawco/carries), then deletes its private copy, its boundary and its records. Your folder stays as it is. Keep leaves it all where it is.`,
  /** The held confirm's two buttons and the one running. */
  archiveHeldKeep: "Keep",
  archiveHeldConfirm: "Save and archive",
  archiveHeldPending: "Saving…",
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
  /** A project's count in Projects, as the switch that unfolds its running sessions under its row. */
  showRunning: (project: string) => `Show ${project}'s running sessions`,
  hideRunning: (project: string) => `Hide ${project}'s running sessions`,
  /** A project group's mark in Recent: the switch that unfolds the sessions listed under it. */
  showSessions: (project: string) => `Show ${project}'s sessions`,
  hideSessions: (project: string) => `Hide ${project}'s sessions`,
  /** The sidebar's one list of the sessions the person started or wrote in. */
  recent: "Recent",
  /** Recent with nothing in it. */
  recentNone: "Sessions you start or write to land here.",
  /** The groupings menu on Recent and on Projects: its button's name. */
  groupSessions: "Group sessions",
  groupProjects: "Group projects",
  /** The groupings menu's columns: the first level, then each one under it. */
  groupBy: "Group by",
  thenBy: "Then by",
  /** What a level groups by. */
  byDay: "Day",
  byProject: "Project",
  byArea: "Area",
  byMachine: "Machine",
  /** The day groups: a session falls in the day the person last wrote to it or started it. */
  today: "Today",
  yesterday: "Yesterday",
  older: "Older",
  /** The group of sessions in no project, and of projects in no area. */
  noProject: "No project",
  noArea: "No area",
  /** A session whose turn ended with nothing left to start it again: the person's move. */
  yourTurn: "Your turn",
  /** The top bar's button that puts the sidebar away on a desk, and brings it back. */
  hideSidebar: "Hide sidebar",
  showSidebar: "Show sidebar",
};
