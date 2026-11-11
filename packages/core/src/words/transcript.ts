/**
 * What a session's transcript and its composer say: a message's actions,
 * an edit's controls, the send. The dashboard renders them from here, and
 * the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const transcriptWords = {
  /** A tab's details card, and the tabs of a pane's group. */
  sessionDetails: "Session details",
  /**
   * A transcript started outside CawCo (in a terminal, the desktop app, an
   * IDE), open on its page and not yet written to: the line over its
   * composer.
   */
  startedOutside: "Started outside CawCo. A message resumes it here.",
  /** The transcript's line while its first message resumes it as a session of CawCo's. */
  resuming: "Resuming in CawCo…",
  /** Its details card, under the settings it resumes with: what they are. */
  resumesWith: "A message resumes it with these.",
  /** The same line while its machine reads what it ran with. */
  readingRun: "Reading what it ran with…",
  /** A model or effort chip for a value nothing it stored names: its harness takes its own. */
  ownDefault: "Default",
  ownDefaultWhy: (harness: string) =>
    `Nothing it stored names one, so ${harness} uses its own.`,
  /** The account chip for a transcript kept under the machine's own sign-in, in no account's folder. */
  machineSignIn: "This machine's sign-in",
  /** A resume or a reading the machine did not answer in time ({@link didntAnswer}'s outcome). */
  resumeUnknown: "whether the session was resumed is not known",
  ranWithUnknown: "what it ran with is not known",
  /** A resume refused here: its harness has permission modes and its machine read none to resume it in. */
  noModeRead: (machine: string) =>
    `${machine} read no permission mode to resume it in. Try again.`,
  /**
   * The tab strip's name: its tabs are chats and projects alike. In a split
   * each strip says its group's number, the one Move to group names.
   */
  openTabs: (group: number, groups: number): string =>
    groups > 1 ? `Open tabs, group ${group}` : "Open tabs",
  /** A tab's menu: its place in the workspace's groups, for a chat's tab and a project's alike. */
  splitRight: "Split right",
  splitDown: "Split down",
  moveToGroup: (group: number): string => `Move to group ${group}`,
  closeTab: "Close",
  closeOthers: "Close others",
  /** The transcript's landmark, as a screen reader names it. */
  transcript: "Session transcript",
  /** The composer's send. */
  sendMessage: "Send message",
  /** A message's actions, on its speaker line. */
  copyMessage: "Copy message",
  editMessage: "Edit message",
  forkFromHere: "Fork from here",
  /** A touch screen's handle to them, and the sheet it opens with its rows. */
  messageActions: "Message actions",
  messageSheet: "Message",
  copyRow: "Copy",
  editRow: "Edit",
  /** A queued message's way back, at rest in its well. */
  editInPlace: "Edit in place",
  removeFromQueue: "Remove from queue",
  /** A failed send's way back, at rest in its well. */
  retrySend: "Retry",
  editFailed: "Edit",
  removeFailed: "Remove",
  /** An edit's controls. */
  cancelEdit: "Cancel edit",
  sendEdited: "Send edited message",
  /** A send the hub refused, with what it said. */
  notSent: "Couldn't send that message.",
  /** A stored session's menu: its words carried into a new session. */
  continueInNew: "Continue in new session…",
};
