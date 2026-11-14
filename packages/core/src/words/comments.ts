/**
 * The comments' words on the web (the artifact panel's surface brief, Placing a comment, The Comments
 * rail, A thread beside its pin, How comments reach the session).
 * The app keeps its own until its parity with the rail (words/artifacts.ts
 * holds the words both say). The dashboard renders them from here.
 */
import { commonWords } from "./common";

/** A reason's own full stop, which the line that quotes it puts back. */
const FINAL_STOP = /\.$/u;
/** A delivery no one took, before its reason. */
const NOT_SENT = "Not sent:";

export const commentWords = {
  /** A comment sent, refused by the hub: what came of it, said after the hub's sentence (`hubRefusal`). */
  notSentThen: "so nothing was sent. Send again.",
  /** A comment's Try again, refused by the hub (`hubRefusal`). */
  notGoneThen: "so the comment didn't go. Try again.",
  // The composer at the element.
  composeHint: { full: "What should change?", short: "What should change?" },
  comment: "Comment",
  wholePage: "Whole page",
  elementGone: "Element gone",
  // The thread beside its pin.
  replyHint: { full: "Reply", short: "Reply" },
  reopenHint: { full: "Reply to reopen", short: "Reply to reopen" },
  reply: "Reply",
  resolve: "Resolve",
  reopen: "Reopen",
  copyLink: commonWords.copyLink,
  placeElsewhere: "Pin it somewhere else",
  placeHere: "Tap the page where it goes.",
  deleteComment: "Delete comment",
  deleteTitle: (n: number) => `Delete comment ${n}?`,
  deleting: "Deleting…",
  /** The agent at work on a comment: its mark's live dot, said to a screen reader. */
  working: "The agent is working on it",
  // A thread's status line: who has the comment, never a speaker line.
  sentTo: "Sent to",
  workingOnIt: "working on it",
  resolvedAgo: (age: string) =>
    age === "now" ? "Resolved just now" : `Resolved ${age} ago`,
  close: "Close",
  /** A pin's peek pressed: its whole thread opens. */
  openThread: (n: number) => `Open comment ${n}`,
  // The rail.
  comments: "Comments",
  searchComments: "Search comments",
  /** The search field's Clear: its words go, the field stays. */
  clearSearch: "Clear the search",
  /** The search's way out: the field folds back into its symbol. */
  /** Puts the rail's search away (its field back into Search), beside the field: never the field's own Clear. */
  cancelSearch: "Cancel",
  /** The rail's segments under its bar, read out: which comments it lists. */
  whichComments: "Which comments",
  /** The rail's Sort menu, read out: the order the rows come in. */
  order: "Order",
  /** The head's Comments, read out: the answers he hasn't read. */
  answersWaiting: (n: number) => `${n} new ${n === 1 ? "answer" : "answers"}`,
  sort: "Sort",
  newestFirst: "Newest first",
  topOfPageFirst: "Top of page first",
  onWholePage: "Comment on the whole page",
  closeComments: "Close comments",
  open: "Open",
  resolved: "Resolved",
  noneOpen: "No open comments",
  noneOpenClick: "Choose Comment, then click something on the page.",
  noneOpenTap: "Choose Comment, then tap something on the page.",
  noneResolved: "Nothing resolved yet",
  noMatch: (query: string) => `Nothing matches “${query}”`,
  attached: (n: number) => `${n} attached`,
  // Held comments (the owner, 2026-11-05): Hold beside the composer's send, Send all in the rail's bar.
  hold: "Hold",
  holdTitle: "Hold it, to send later with the others (⌥↩)",
  /** A held comment's row, and its pill's name: the agent hasn't heard it. */
  unsent: "Unsent",
  /** The rail's list of what he holds to send together. */
  held: "Held",
  /** Send all, read out. */
  sendHeldLabel: (n: number) =>
    `Send ${n} held ${n === 1 ? "comment" : "comments"}`,
  sendHeldCount: (n: number) => `Send ${n} ${n === 1 ? "comment" : "comments"}`,
  /** Send all's note field. */
  heldNote: "Add a note for the agent",
  /** The head's Comments button, read out: what waits to be sent. */
  heldWaiting: (n: number) => `${n} unsent`,
  // The page's Send: its picks.
  send: "Send",
  sendCount: (n: number) => `Send ${n}`,
  // A comment whose delivery reached no one, and its way back.
  tryAgain: commonWords.tryAgain,
  retryComment: (n: number) => `Try comment ${n} again`,
  notSentHead: NOT_SENT,
  notSent: (why: string) => `${NOT_SENT} ${why.replace(FINAL_STOP, "")}.`,
  /** Why a mark only the page holds isn't sent, once its link has stood down past its grace: the hub can't be reached, never what closed the socket. */
  hubUnreached:
    "the hub can't be reached. It's kept on this device and goes once the hub is back",
  /** A comment's Try again that didn't reach the hub within its bound. */
  notReachedHub:
    "This comment hasn't reached the hub, which can't be reached. It's kept on this device and goes once the hub is back.",
  /** A Send the dashboard makes whose open page didn't hand over its picks within `seconds`. */
  sendPageSilent: (seconds: number) =>
    `${NOT_SENT} the page open here didn't hand over its picks within ${seconds} seconds (timeout). Your picks are kept on the page. Press Send again.`,
  /** The page's Send, held while the hub couldn't be reached for `seconds`: the picks stay on the page and reach the hub once it is back. */
  sendHeld: (seconds: number) =>
    `${NOT_SENT} the hub couldn't be reached for ${seconds} seconds. Your picks are kept on this page and reach the hub once it's back; press Send again then.`,
  // Changed since you looked: the tag over the page, and what a screen reader hears.
  changedSince: (n: number) => `${n} changed since you looked`,
  /** The changes tag on its tour: where it stands, with its noun kept. */
  changeOf: (k: number, n: number) => `Change ${k} of ${n}`,
  previousChange: "Previous change",
  nextChange: "Next change",
  newAnswer: "New answer",
  // What changed for a comment: its thread's change lines, the rail's To check, the turn's chips.
  changed: "Changed",
  /** A change chip, read out: what changed, and that it opens there. */
  changeChip: (what: string) => `Changed: ${what}`,
  toCheck: "To check",
  /** A comment whose element an update changed and the agent never answered. */
  changedNoAnswer: "changed, no answer",
  answered: "answered",
  askAgain: "Ask again",
  askingAgain: "Asking again…",
  /** A change line's revision. */
  revision: (n: number) => `rev ${n}`,
  /** A change line's count of revisions that changed it since he looked. */
  times: (n: number) => `${n} times`,
  /** A change line's move: what it came after, then and now. */
  moved: (before: string, after: string) =>
    `moved from after ${before || "the start"} to after ${after || "the start"}`,
  /** A change line whose words run past its lines: opened in place, and folded again. */
  more: "More",
  less: "Less",
  /** The note over a pin's change lines when the oldest were let go past the most a thread keeps. */
  earlierLines: (count: number) =>
    `${count} earlier change ${count === 1 ? "line was" : "lines were"} let go; the oldest shown is not the first.`,
  /** A change line's thing put in: no before. */
  added: "added",
  noneToCheck: "All looked at",
  noneToCheckHint: "What an update changes shows here until you look at it.",
} as const;
