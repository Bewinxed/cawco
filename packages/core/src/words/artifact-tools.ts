import type { PageFault } from "../page-faults";
import { cutShort } from "./helpers";

/**
 * What the hub's artifact tools answer a session (artifact_create,
 * artifact_update, artifact_show, artifact_delete, comment_read): a hand-off
 * to the parent, a change held as the next version, an artifact or a pin the
 * session doesn't hold, a preview whose server isn't there. The hub says
 * them from here.
 */
export const artifactToolWords = {
  /** The head of `artifact_read`'s faults: what a browser met as it drew the page at this revision (core page-faults.ts). */
  faultsHead: (revision: number) =>
    `What a browser met drawing revision ${revision} (each once, the first 20):`,
  /** The line after the faults when more came than are kept. */
  faultsDropped: (count: number) =>
    `${count} more ${count === 1 ? "fault" : "faults"} came after these and ${count === 1 ? "was" : "were"} not kept.`,
  /** One fault a page met, in words. */
  pageFault: (fault: PageFault): string => {
    if (fault.kind === "dial") {
      return `- Dial ${fault.path} of cawcoDials("${fault.panel}") is ${fault.control}, a control the panel doesn't draw: it is not drawn.`;
    }
    if (fault.kind === "asset") {
      return `- A ${fault.element} failed to load ${fault.url}.`;
    }
    let place = "";
    if (fault.line !== null) {
      place = ` at line ${fault.line}${fault.column === null ? "" : `, column ${fault.column}`} of ${fault.file ?? "the page as served"}`;
    } else if (fault.file) {
      place = ` in ${fault.file}`;
    }
    return `- Uncaught error${place}: ${fault.message}${fault.source ? `\n  The line: ${fault.source}` : ""}`;
  },
  /** A session's read of an artifact asked by the person, a machine or anyone but that session (hub hub-auth.ts `sessionReadOf`), at `path`. */
  sessionReadRefused: (path: string, session: string) =>
    `GET ${path} is session ${session}'s own read of its artifact (artifact_read): it counts as that session hearing the person's answers, so only that session makes it. The person's view of the artifact is GET ${path}/view.`,
  /** The same asked by another session, with its own credential. */
  sessionReadOthers: (path: string, session: string) =>
    `GET ${path} is session ${session}'s own read of its artifact (artifact_read): a session reads its own artifacts, as itself.`,
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
  /** A setup page shown or made while its project is not set up (hub artifacts/service.ts `landingOf`): the project's board draws it, and no panel opens it. */
  onBoard:
    "Drawn as the project's board, on its page, where the person reads and changes it as you write it; a setup page never opens in a panel.",
  /** A setup page shown or made once its project is set up (hub artifacts/service.ts `landingOf`): its Decisions tab draws it, and no panel opens it. */
  onDecisions:
    "Drawn in the project's Decisions tab, where the person reads and answers it, and a card you name as a chip opens at that card; a setup page never opens in a panel.",
  /** A maker's change while the parent has it open. */
  heldAsNext:
    "Your parent opened it, so this change waits as its next version: their panel keeps the version they opened until they call artifact_show, and decision pages, artifact_read and artifact_browse have this one now.",
  /** A revision that went to an artifact's next version its panel hasn't opened, `next` that version's id. */
  revisedNext: (next: string) =>
    `This change is in its next version, artifact ${next}: decision pages draw it now, and the panel keeps the version it opened until artifact_show opens this one.`,
  /** An `artifact_read` of an artifact with a next version its panel hasn't opened, `next` that version's id. */
  readsNext: (next: string) =>
    `This read shows its next version, artifact ${next}: decision pages draw it, and the panel keeps the opened version, where the person's picks are, until artifact_show opens it.`,
  /** A preview that never loaded, so nothing went to the parent. */
  notHanded: "It wasn't handed to your parent.",
  /**
   * A hand-up's check loaded `subject`'s page and it answered an error
   * status (core `PreviewDown` `error`, hub preview.ts `loadedOnce`): the
   * refusal goes on with the status and the error's first line in brackets,
   * then {@link artifactToolWords.notHanded}.
   */
  pageErrored: (subject: string) =>
    `${subject} answered its page with an error.`,
  /** A view loaded `subject`'s page, and a script of it threw before its load and it showed nothing (core `PreviewDown` `crashed`). */
  pageCrashed: (subject: string) =>
    `${subject} answered a page that threw before it loaded and showed nothing.`,
  /** A view couldn't load `subject` as its workspace is gone (core `PreviewDown` `gone`): a show's or a hand-up check's refusal. */
  workspaceGone: (subject: string) =>
    `${subject} is gone with its workspace, so this version can't be shown again. Make it again from a workspace that runs and hand that up; showing this one again changes nothing.`,
  /** An artifact another session in the tree made: `what` ("The page …"), `session` its short id. */
  othersArtifact: (what: string, session: string) =>
    `${what} is session ${session}'s: your delegation tree reads it, and only that session changes it.`,
  noArtifact: (id: string) => `This session has no artifact ${id}.`,
  /** The person's show of `name` from a session that doesn't hold it (hub artifacts/service.ts `show`): the answer's address takes them to the session that does. */
  inItsSession: (name: string) =>
    `${name} is in its own session's panel, which opens beside this one.`,
  /** A preview of a port CawCo itself serves (the dashboard's, the hub's): the dashboard would act on a preview's calls as the owner. */
  previewOfOwnPort:
    'That port is CawCo\'s own dashboard. A preview carries no CawCo sign-in, so the dashboard has no access through it. To look at a CawCo screen, draw its component: kind "component" with its states file (component-canvas skill).',
  /** An `artifact_list` cursor that no page of it gave. */
  notListCursor: (cursor: string) =>
    `"${cursor}" is not a cursor artifact_list gave. Pass a page's next_cursor for the page after it, or none for the newest page.`,
  /** Where a stage or a served preview runs, `dir` from its clone's root ("." the root itself): "Its server at the repo's root: live." */
  stageAt: (runs: "serve" | "sheet", dir: string, status: string) =>
    `Its ${runs === "serve" ? "server" : "stage"} ${dir === "." ? "at the repo's root" : `in ${dir}`}: ${status}`,
  /** A page's picture, cut at the picture's height limit: the agent saw its top only. */
  pictureCut: (drawn: number, of: number) =>
    `Its picture is drawn to ${drawn.toLocaleString("en-US")} of ${of.toLocaleString("en-US")} px, from the page's top; what lies below is not in it.`,
  /** Where `artifact_read`'s `save` kept the picture, as the session named it. */
  pictureSaved: (path: string) => `Its picture is saved at ${path}.`,
  /** A decision page's Canvas or Preview (`component`) naming `id`, which is neither its panel's, its delegation tree's nor a page of its project. */
  noMediaArtifact: (component: string, id: string) =>
    `${component}("${id}"): no artifact ${id} is this page's session's, its delegation tree's or a page of its project.`,
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
  /** A create with no title, or an empty one: the tool's refusal and the hub's. */
  titleMissing:
    'title is required: a few plain words, sentence case, that name it to the person, like "Title bars close". The panel head, the artifacts menu, Needs you and every chip show it.',
  /** A title written as a slug, `name` the artifact's own slug. */
  titleSlug: (name: string) =>
    `The title is the person's name for it: plain words with spaces, sentence case, like "Title bars close". "${name}" is its name, which stays for tools and URLs.`,
  /** A title with a file, a path or a word the person never uses. */
  titleInTheirWords:
    "The title is in the person's words: no file, path or id in it, and none of tap or poke. Name the thing as they call it.",
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
  /** artifact_read: a page not sent yet. */
  readNotSent: "The person has not pressed Send yet.",
  /** artifact_read: the person's own Send, `ago` before the read, with the words the page sent with it. */
  readSentByPerson: (ago: string, text: string | null) =>
    `The person pressed Send ${ago}${text ? `, the page sending ${text}` : ""}.`,
  /** artifact_read: the hub's send once every question had his answer, `ago` before the read; no act of his, who may be nowhere near the page. */
  readSentByHub: (ago: string) =>
    `Every question had his answer, so the hub sent the page ${ago}; he did not press Send.`,
  /** artifact_read: when his newest pick, note or value came. */
  readLastAnswer: (ago: string) => `His last answer came ${ago}.`,
  /** artifact_list: sent since the session's last change, by him or by the hub. */
  listSentByPerson: "Send pressed since your last change",
  listSentByHub:
    "sent by the hub since your last change, every question answered (he did not press Send)",
  /** The hub's own Send of a page whose answers its writer had all read: settled, and nothing told to the session. */
  sendSettled:
    "settled without telling its session, which had read every answer",
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
  /**
   * One answer of the person's as an agent's refused change names it: its
   * choice id and what he left there (his picks, his note, his value).
   */
  answerSaid: (
    id: string,
    entry: { note: string | null; options: string[]; value: unknown }
  ) => {
    const parts = [
      entry.options.length > 0 && `picked ${entry.options.join(", ")}`,
      entry.note?.trim() &&
        `noted ${JSON.stringify(cutShort(entry.note.trim(), 200))}`,
      entry.value !== null &&
        entry.value !== undefined &&
        `set to ${cutShort(JSON.stringify(entry.value), 200)}`,
    ].filter(Boolean);
    return `${id} (${parts.length > 0 ? parts.join("; ") : "cleared"})`;
  },
  /**
   * An agent's change refused for replacing answers of the person's it had
   * not had (hub artifacts/overwrite.ts `answersReplaced`), `answers` each
   * {@link artifactToolWords.answerSaid}. `how` the agent may still replace
   * them: `read`, its owner, whose read counts; `test`, a session whose read
   * the page doesn't keep, by a test op on the entry; `held`, a next version
   * held for its parent, where his answer is on the version they opened.
   */
  answersStand: (answers: readonly string[], how: "held" | "read" | "test") => {
    const named = `The person answered ${answers.join(" and ")}`;
    const then = {
      held: "on the version your parent opened, after this version was made, so nothing was changed: his answer stands.",
      read: "since you last had this page, so nothing was changed. Read it with artifact_read and decide; to replace his answer, send the patch again.",
      test: "which you haven't had, so nothing was changed. Read it with artifact_read and decide; to replace his answer, start the patch with a test op on its entry holding his answer as it stands.",
    }[how];
    return how === "test" ? `${named}, ${then}` : `${named} ${then}`;
  },
  /** The hub's log: a held next version's merge left the person's answers since its fork as he wrote them. */
  answersKeptAtMerge: (id: string, keys: readonly string[]) =>
    `[artifacts] ${id}: its next version's merge kept the person's answers on ${keys.join(", ")}, written after the version was made`,
  /** The hub's log: the person's marks woke the project's Caw, their writer taking no input. */
  marksWokeCaw: (session: string, project: string, why: string) =>
    `[artifacts] the person's marks on session ${session}'s artifact woke project ${project}'s Caw: the session takes no input now (${why})`,
};
