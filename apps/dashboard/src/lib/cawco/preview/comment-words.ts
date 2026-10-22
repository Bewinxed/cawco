/**
 * The comments' words on the web (DESIGN.md, Placing a comment, The Comments
 * rail, A thread beside its pin, Sending comments; WORDS.md). The app keeps
 * its own until its parity with the rail (core words/artifacts.ts holds the
 * words both say).
 */
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
  copyLink: "Copy link",
  placeElsewhere: "Pin it somewhere else",
  placeHere: "Tap the page where it goes.",
  deleteComment: "Delete comment",
  deleteTitle: (n: number) => `Delete comment ${n}?`,
  deleting: "Deleting…",
  working: "Working on it…",
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
  unsent: "Unsent",
  noneOpen: "No open comments",
  noneOpenClick: "Choose Comment, then click something on the page.",
  noneOpenTap: "Choose Comment, then tap something on the page.",
  noneResolved: "Nothing resolved yet",
  noMatch: (query: string) => `Nothing matches “${query}”`,
  attached: (n: number) => `${n} attached`,
  // Sending.
  note: "Add a note for the agent",
  send: "Send",
  sendCount: (n: number) => `Send ${n}`,
  // Changed since you looked: the tag over the page, and what a screen reader hears.
  changedSince: (n: number) => `${n} changed since you looked`,
  changeOf: (k: number, n: number) => `${k} of ${n}`,
  previousChange: "Previous change",
  nextChange: "Next change",
  newAnswer: "New answer",
  pinNewAnswer: (n: number) => `Pin ${n}, new answer`,
} as const;
