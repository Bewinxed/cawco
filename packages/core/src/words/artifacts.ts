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
  waitingOnYou: "Waiting on you",

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
