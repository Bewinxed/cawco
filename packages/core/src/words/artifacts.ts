/**
 * The artifact panel's words (Projects spec §5.10; live components spec §5):
 * its title menu and a sheet's inspector, for the dashboard and the native
 * app alike (a sheet's stage says its own, words/sheet.ts).
 *
 * `bun run words` writes these into the app as `Words.Artifacts`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const artifactWords = {
  // ── The title menu (preview/ArtifactMenu.svelte) ──
  /** A row's Remove, for a screen reader: its trailing glyph says it. */
  removeNamed: (name: string) => `Remove ${name}`,
  remove: "Remove",
  /** A promoted row's tag: its commit, short. */
  promoted: (commit: string) => `Promoted ${commit}`,
  promotedTitle: (name: string) =>
    `Promoted into the project's folder at artifacts/${name}/`,
  notRemoved: (name: string, why: string) => `${name} wasn't removed: ${why}`,
  /** The head's line under the name once the person's Send is in and the session has not changed it since. */
  sentTo: (session: string) => `Sent to ${session}`,
  /** A row's dot, for a screen reader: the person has something to do on it. */
  waitingOnYou: "Needs you",

  // ── Needs you: an artifact waiting on the person (home/NeedsCard.svelte, Files' cards) ──
  /** Shown and never opened: the row's line. */
  notOpened: "New · not opened",
  /** The same on a Files card's meta line. */
  notOpenedShort: "New",
  /** A decision page's picks. */
  picked: (made: number, asked: number) => `${made} of ${asked} picked`,
  /** The same on a Files card's meta line. */
  pickedShort: (made: number, asked: number) => `${made} of ${asked}`,
  /** Written and not sent: picks, notes, pins and ink. */
  unsent: (count: number) => `${count} unsent`,
  /** An agent's answers on open pins the person hasn't looked at. */
  newAnswers: (count: number) =>
    count === 1 ? "1 new answer" : `${count} new answers`,
  /** The one reason, an answer on one pin: where it is. */
  newAnswerOn: (pin: number) => `1 new answer on pin ${pin}`,
  /** The kind on the row's meta line, where an ask says "Question". */
  kindWord: {
    page: "Page",
    canvas: "Canvas",
    component: "Components",
    preview: "Preview",
    browser: "Browser",
  },
  /** The row's ✕: it leaves Needs you until it is raised again, and stays in Files. */
  notNow: "Not now",
  notNowNamed: (ask: string) => `Not now: ${ask}`,
  /** The row's Send, while something is written and not sent. */
  sendCount: (count: number) => `Send ${count}`,
  sendNamed: (count: number, ask: string) => `Send ${count} on ${ask}`,
  sending: "Sending…",
  /** A Send no one took: why, in the hub's words, its own sentence. */
  notSent: (why: string) => `Not sent. ${why}`,
  openNamed: (ask: string) => `Open ${ask}`,
  /** A notice: a revision with nothing asked. */
  changedSince: (name: string, count: number) =>
    `${name}: ${count} changed since you looked`,
  /** A notice: resolved pins whose closing answer is unread. */
  closedAnswers: (name: string, count: number, pin: number) =>
    count === 1
      ? `${name}: pin ${pin} resolved with an answer`
      : `${name}: ${count} pins resolved with answers`,
  /** A notice: its session ended with the ask unanswered. */
  ended: (who: string, what: string) => `${who} ended; ${what}`,
  /** Who ended, when the hub no longer holds the session. */
  itsSession: "Its session",
  neverOpened: (name: string) => `${name} never opened`,
  neverPicked: (count: number, name: string) =>
    count === 1
      ? `1 pick on ${name} never made`
      : `${count} picks on ${name} never made`,
  neverSent: (count: number, name: string) =>
    `${count} unsent on ${name} never sent`,
  neverRead: (count: number, name: string) =>
    count === 1
      ? `1 answer on ${name} never read`
      : `${count} answers on ${name} never read`,
  /** A notice's ✕, for a screen reader. */
  dismissNotice: (name: string) => `Dismiss the notice on ${name}`,
  open: "Open",

  // ── The Comments rail (preview/CommentRail.svelte; the app's PinListController) ──
  /** Its skeleton rows, for a screen reader, while the pins are read past the wait's grace. */
  readingComments: "Reading the comments",
  /** The pins couldn't be read; `why` is its own sentence (the hub's reason). */
  commentsNotRead: (why: string) => `The comments couldn't be read. ${why}`,
  /** A gone pin's notice, a sentence of its own: what it stood on is gone. */
  pinElementGone: "Its element is gone from the page.",
  /** No open pins yet, how to pin one, by the pointer that will: a mouse clicks… */
  pinsNoneOpenClick: "Choose Comment, then click the page to pin one.",
  /** …and a finger taps. */
  pinsNoneOpenTap: "Choose Comment, then tap the page to pin one.",

  // ── A sheet's inspector (preview/SheetInspector.svelte) ──
  inspect: "Inspect",
  inspectTitle:
    "Inspect: change the story's props, then Save them into its file",
  closeInspector: "Close the inspector",
  readingProps: "Reading the sheet's props",
  theStoryFile: "the story file",
  theStory: "the story",
  noStories: (file: string) => `${file} has no stories yet. Add one below.`,
  story: "Story",
  storyOption: (name: string, edited: boolean) =>
    edited ? `${name} · edited` : name,
  duplicateStory: "Duplicate the story",
  duplicate: "Duplicate",
  moveStoryUp: "Move the story up",
  moveUp: "Move up",
  moveStoryDown: "Move the story down",
  moveDown: "Move down",
  removeStory: "Remove the story",
  removeTitle: (name: string) => `Remove the story ${name}?`,
  removeBody: (file: string) =>
    `Its export goes from ${file}, and its frame from the sheet. The component stays as it is.`,
  removeConfirm: "Remove story",
  removing: "Removing…",
  storyNotRemoved: (name: string) => `${name} wasn't removed.`,
  nameRule:
    "A story's name starts with a capital: letters, digits and _ only, like Roomy.",
  nameTaken: (file: string, name: string) =>
    `${file} has a story ${name} already.`,
  required: "required",
  resetProp: (prop: string) => `Reset ${prop}`,
  resetTitle: (prop: string) =>
    `Reset ${prop} to the sheet's or the component's default`,
  slot: "Content is a pin: Comment on the page to change it.",
  setInFile: "Set it in the file.",
  codeInFile: "Code in the file: a pin changes it.",
  takesNoProps: (name: string) => `${name} takes no props.`,
  /** Before the meta field it names, which is set as code: `component`, then a full stop. */
  noComponent:
    "The sheet's meta names no component the stage could find, so it has no controls. Give its default export a",
  newStoryName: "New story's name",
  nameCopy: (story: string) => `Name the copy of ${story}`,
  namePlaceholder: "Roomy",
  cancel: "Cancel",
  addStory: "Add story",
  addStoryTitle: "A new story from the controls as they stand",
  adding: "Adding…",
  duplicating: "Duplicating…",
  discard: "Discard",
  save: "Save",
  saving: "Saving…",
  saveTitle: (story: string, file: string) =>
    `Write ${story}'s args into ${file}`,
};
