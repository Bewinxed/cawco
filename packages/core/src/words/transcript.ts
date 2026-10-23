/**
 * What a session's transcript and its composer say: a message's actions,
 * an edit's controls, the send. The dashboard renders them from here, and
 * the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const transcriptWords = {
  /** A tab's details card, and the tabs of a pane's group. */
  sessionDetails: "Session details",
  openSessions: "Open sessions in this group",
  /** The transcript's landmark, as a screen reader names it. */
  transcript: "Session transcript",
  /** The composer's send. */
  sendMessage: "Send message",
  /** A message's actions, under it. */
  copyMessage: "Copy message",
  editMessage: "Edit message",
  forkFromHere: "Fork from here",
  /** An edit's controls. */
  cancelEdit: "Cancel edit",
  sendEdited: "Send edited message",
  /** A send the hub refused, with what it said. */
  notSent: "Couldn't send that message.",
  /** A stored session's menu: its words carried into a new session. */
  continueInNew: "Continue in new session…",
};
