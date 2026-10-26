/**
 * The comments' words on the web (DESIGN.md, Placing a comment, The Comments
 * rail, A thread beside its pin, How comments reach the session; WORDS.md).
 * The app keeps its own until its parity with the rail (words/artifacts.ts
 * holds the words both say). The dashboard renders them from here, and the probe kit
 * finds them by these same words (scripts/probe-words-check.ts refuses a
 * copy).
 */
import { commonWords } from "./common";

/** A reason's own full stop, which the line that quotes it puts back. */
const FINAL_STOP = /\.$/u;
/** A delivery no one took, before its reason. */
const NOT_SENT = "Not sent:";

export const commentWords = {
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
  // The rail.
  comments: "Comments",
  searchComments: "Search comments",
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
  // The page's Send: its picks.
  send: "Send",
  sendCount: (n: number) => `Send ${n}`,
  // A comment whose delivery reached no one, and its way back.
  tryAgain: commonWords.tryAgain,
  retryComment: (n: number) => `Try comment ${n} again`,
  notSentHead: NOT_SENT,
  notSent: (why: string) => `${NOT_SENT} ${why.replace(FINAL_STOP, "")}.`,
  notOnHub: "it hasn't reached the hub yet, and is kept on this device",
  // Changed since you looked: the tag over the page, and what a screen reader hears.
  changedSince: (n: number) => `${n} changed since you looked`,
  changeOf: (k: number, n: number) => `${k} of ${n}`,
  previousChange: "Previous change",
  nextChange: "Next change",
  newAnswer: "New answer",
  pinNewAnswer: (n: number) => `Pin ${n}, new answer`,
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
  /** The To check row of changes no comment asked for. */
  unasked: "Changed, no comment asked",
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
  /** A change line's thing put in: no before. */
  added: "added",
  noneToCheck: "All looked at",
  noneToCheckHint: "What an update changes shows here until you look at it.",
} as const;
