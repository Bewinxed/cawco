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
  /** A delegate card on a Caw thread, as a screen reader names what Caw handed it after its brief. */
  delegateHandoffs: "Hand-offs",
};
