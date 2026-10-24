/**
 * The words for a thread with a project's Caw set aside and brought back
 * (WORDS.md, **archive**): the thread row's menu and the project's thread
 * list. The dashboard's alone for now; the app takes them into its
 * generated words (scripts/words-swift.ts) when it archives threads too.
 */
export const threadWords = {
  /** The thread row's menu item: off every rail, with what its turns started. */
  archive: "Archive",
  /** That item while the hub takes it. */
  archiving: "Archiving…",
  /** An archived thread's menu item: back on the rails. */
  unarchive: "Unarchive",
  /** That item while the hub takes it. */
  unarchiving: "Unarchiving…",
  /** The project's thread list: the threads past the one on show, newest first. */
  earlier: "Earlier",
  /** The project's thread list: the threads you archived. */
  archived: "Archived",
  /** The Archived list with none in it. */
  noneArchived: "Nothing archived",
  /** The control that picks between the two lists, for a screen reader. */
  listLabel: "Threads",
  /** Caw's panel's head: a thread not started yet; and a new thread's tab. */
  newThread: "New thread",
};
