/**
 * What the hub's artifact tools answer a session (artifact_create,
 * artifact_update, artifact_show, artifact_delete, comment_read): a hand-off
 * to the parent, a change held as the next version, an artifact or a pin the
 * session doesn't hold, a preview whose server isn't there. The hub says
 * them from here, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const artifactToolWords = {
  /** A `to: "parent"` create opened nothing: the parent opens it. */
  handedToParent:
    "Handed to your parent, not opened: it opens in their panel when they call artifact_show.",
  /** A maker's change while the parent has it open. */
  heldAsNext:
    "Your parent opened it, so this change waits as its next version: their panel keeps the version they opened until they call artifact_show.",
  /** A preview that never loaded, so nothing went to the parent. */
  notHanded: "It wasn't handed to your parent.",
  /** An artifact another session in the tree made: `what` ("The page …"), `session` its short id. */
  othersArtifact: (what: string, session: string) =>
    `${what} is session ${session}'s: your delegation tree reads it, and only that session changes it.`,
  noArtifact: (id: string) => `This session has no artifact ${id}.`,
  noPin: (pin: string) =>
    `No artifact of this session holds pin ${pin}. comment_read lists its pins with their ids.`,
  /** A delete asked of an artifact whose maker can still act: `whose` names it and its maker. */
  makerDeletes: (whose: string) =>
    `${whose}, and that session can still act: it deletes it now (a handoff asks it to). Once it can't (its item ended and its workspace was discarded or archived, or the session ended for good), you, up its delegation tree, can delete it.`,
  /** A preview of a workspace the session may not preview. */
  notYourDelegate: (workspace: string) =>
    `"${workspace}" is not your delegate's workspace — you can only preview your own workspace or your delegates'.`,
  /** A preview's server, and the port nothing listens on. */
  serverOnPort: (port: number | string, where: string) =>
    `The server on port ${port} ${where}`,
  notListening: (subject: string) =>
    `${subject} did not answer: nothing is listening on that port.`,
  /** The ask a decision page or a canvas carries is the person's. */
  askInTheirWords:
    "The ask is in the person's words: no file, path or id in it. Name the thing as they call it.",
  /** A canvas read with nothing drawn on it. */
  canvasEmpty:
    "The canvas is empty. Draw on it with artifact_update (elements or mermaid), or wait for the person to draw.",
  /** The hub's log: marks the person made that no session took. */
  marksOwed: (id: string, reason: string) =>
    `[artifacts] ${id}: the person's marks reached no one, and stay owed: ${reason}`,
};
