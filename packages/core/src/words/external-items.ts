/**
 * What a task's external items say, on the board and to an agent (hub
 * presenters/tasks.ts; the dashboard's TaskPane, TaskCard, TaskActivity):
 * the source a link-out names, the kind and state of an item, and a
 * comment's mark that its words were changed on the source. A source's name
 * here is the service's ("GitHub"); a tracker's ("GitHub Issues",
 * trackers.ts `TRACKER_NAMES`) names a binding, a different thing.
 */
export const externalItemWords = {
  /** Each source by its name. */
  source: { github: "GitHub", linear: "Linear" },
  /** Each kind as a sentence names it. */
  kind: { issue: "issue", pr: "pull request", discussion: "discussion" },
  /** Each state as a row says it, when the source gave none of its own. */
  state: {
    open: "Open",
    draft: "Draft",
    merged: "Merged",
    closed: "Closed",
    canceled: "Canceled",
  },
  /** A link the hub has not read from its source yet, in place of its state. */
  unread: "Not read yet",
  /** The head of a task's links in its pane. */
  linksHead: "Links",
  /** Each relation's group head in a task's links, the record's first. */
  relation: {
    record: "Main record",
    closes: "Closes",
    refs: "Refers to",
    related: "Related",
  },
  /** A link whose last read stopped short, in place of its state: the source's words follow it. */
  readFailed: "Can't read",
  /** Reads a link again from its source, and its wait. */
  readAgain: "Retry",
  readingAgain: "Retrying…",
  /** The carried comments past the newest few on an item, folded: opens them in place. */
  moreComments: (count: number): string => `${count} more`,
  /** Folds them away again. */
  fewerComments: "Show fewer",
  /** A link row's whole name for a screen reader: its ref, its title when known, its state and kind, and where it opens. */
  linkName: (
    ref: string,
    title: string,
    state: string,
    kind: string,
    source: string
  ): string =>
    `${title ? `${ref}: ${title}` : ref}. ${state}, ${kind}. Open on ${source}`,
  /** A carried comment's citation for a screen reader: who wrote it, on what, when, and where it opens. */
  commentName: (
    who: string,
    ref: string,
    when: string,
    source: string
  ): string => `${who} on ${ref}, ${when}. Open on ${source}`,
  /** A link-out's label: the page it opens. */
  openOn: (source: string): string => `Open on ${source}`,
  /** A comment whose words were changed on its source since. */
  edited: "edited",
  /** The head of a task's links in an agent's read of it. */
  links: "Links:",
};
