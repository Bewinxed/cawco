/**
 * What the hub's artifact tools answer a session (artifact_create,
 * artifact_update, artifact_show, artifact_delete, comment_read): a hand-off
 * to the parent, a change held as the next version, an artifact or a pin the
 * session doesn't hold, a preview whose server isn't there. The hub says
 * them from here, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const artifactToolWords = {
  /** The person's Ask again, its section's last line: an update changed what the comment stands on and it got no answer. */
  askedAgain:
    "- The person asks again: your update changed what this comment stands on, and you didn't answer it. Answer it with comment_reply.",
  /** An Ask again on an artifact no session holds. */
  askAgainNoSession:
    "No session holds this page now, so the comment wasn't asked again.",
  /** An Ask again on a comment gone from the page. */
  askAgainGone: "This comment is gone from the page, so it wasn't asked again.",
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
  /** Where a stage or a served preview runs, `dir` from its clone's root ("." the root itself): "Its server at the repo's root: live." */
  stageAt: (runs: "serve" | "sheet", dir: string, status: string) =>
    `Its ${runs === "serve" ? "server" : "stage"} ${dir === "." ? "at the repo's root" : `in ${dir}`}: ${status}`,
  /** Where `artifact_read`'s `save` kept the picture, as the session named it. */
  pictureSaved: (path: string) => `Its picture is saved at ${path}.`,
  /** A decision page's Canvas or Preview (`component`) naming `id`, which is neither the session's nor its delegation tree's. */
  noMediaArtifact: (component: string, id: string) =>
    `${component}("${id}"): this session's panel has no artifact ${id}.`,
  /** A pin on no artifact the session reads: its own, its delegation tree's, its project's pages, what its project's cold sessions left. */
  noPin: (pin: string) =>
    `No artifact this session reads holds pin ${pin}: not its own, its delegation tree's, its project's pages or what its project's cold sessions left. comment_read with the artifact lists its pins with their ids.`,
  /** A delete asked up the tree of an artifact whose maker's work item is still live: `whose` names it and its maker. */
  makerDeletes: (whose: string) =>
    `${whose}, and its work item is still live: that session deletes it now (a handoff asks it to). Once its item ends (done, failed or cancelled), you, up its delegation tree, can delete it.`,
  /** A delete asked by a session outside the maker's delegation tree while its holder, its maker or a session up their tree is warm: `whose` names it and its holder. */
  notInTree: (whose: string) =>
    `${whose}, and a session that made it, or one up its delegation tree, is warm, so it is still theirs. Once its item ends, the sessions up its delegation tree can delete it; once that whole line is cold, any session of its project can, its pins resolved first. The person can from the dashboard.`,
  /** A delete, by a session of its project, of what a cold session left, its pins not all resolved: `whose` names it and its maker. */
  pinsOpenFirst: (whose: string, open: number) =>
    `${whose}, which is cold, and ${open === 1 ? "1 of its pins is" : `${open} of its pins are`} still open. Answer each and resolve it (comment_read with the artifact lists them, comment_resolve resolves one), then delete it.`,
  /** `discard_workspace`'s answer on what its delegates left, their work items all ended. */
  leftoverEnded:
    "Their work items ended, so artifact_delete removes them from here.",
  /** The same, while one's item is still live. */
  leftoverLive:
    "Their work items are still live: a handoff to each asks it to delete what it left.",
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
  /** The hub's log: a delivery of the person's marks someone took, what it carried and for which session. */
  marksDelivered: (
    id: string,
    carried: string,
    session: string,
    retry: boolean
  ) =>
    `[artifacts] ${id}: ${carried} delivered${retry ? " on the person's Try again" : ""}, for session ${session}`,
  /**
   * The hub's log: one page Send, the control its sender named and the
   * route that took it, then what it carried or why it was refused (the
   * owner: "make every page send log one line naming its route and
   * control").
   */
  pageSent: (id: string, control: string, route: string, outcome: string) =>
    `[artifacts] ${id}: Send by ${control} through ${route}: ${outcome}`,
  /** A page Send's control, when its sender named none. */
  sendUnnamed: "a control it didn't name",
  /** What a page Send carried, in its log line. */
  sendCarried: (changes: number, note: boolean) =>
    `${changes} choice change(s) since the last Send${note ? ", with a note" : ""}`,
  /** A page Send refused, in its log line. */
  sendRefused: (why: string) => `refused, ${why}`,
  /** The hub's log: one step of a show (open, reach, publish, shown wait) that took longer than it should, for which panel. */
  showStepSlow: (id: string, step: string, ms: number, panel: string | null) =>
    `[artifacts] ${id}: its show's ${step} took ${ms} ms, ${panel ? `for session ${panel}'s panel` : "with no session holding it"}`,
  /** The hub's log: the person's marks on an artifact no session holds. */
  marksUnheld: (id: string) =>
    `[artifacts] ${id}: the person's marks found no session holding it, and stay owed`,
  /** The hub's log: the send that carried the person's marks to a session, as which message and where it stands. */
  marksWent: (id: string, session: string, message: string, state: string) =>
    `[artifacts] ${id}: the person's marks went to session ${session} as message ${message} (${state})`,
  /** The hub's log: the person's marks woke the project's Caw, their writer taking no input. */
  marksWokeCaw: (session: string, project: string, why: string) =>
    `[artifacts] the person's marks on session ${session}'s artifact woke project ${project}'s Caw: the session takes no input now (${why})`,
};
