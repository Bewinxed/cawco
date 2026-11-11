/**
 * What a session's transcript and its composer say: a message's actions,
 * an edit's controls, the send. The dashboard renders them from here, and
 * the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 */
export const transcriptWords = {
  /** A tab's details card, and the tabs of a pane's group. */
  sessionDetails: "Session details",
  /**
   * A transcript started outside CawCo (in a terminal, the desktop app, an
   * IDE), open on its page and not yet written to: the line over its
   * composer.
   */
  startedOutside: "Started outside CawCo. A message resumes it here.",
  /** The transcript's line while its first message resumes it as a session of CawCo's. */
  resuming: "Resuming in CawCo…",
  /** Its details card, under the settings it resumes with: what they are. */
  resumesWith: "A message resumes it with these.",
  /** The same line while its machine reads what it ran with. */
  readingRun: "Reading what it ran with…",
  /** A model or effort chip for a value nothing it stored names: its harness takes its own. */
  ownDefault: "Default",
  ownDefaultWhy: (harness: string) =>
    `Nothing it stored names one, so ${harness} uses its own.`,
  /**
   * The account chip for a transcript kept under the machine's own sign-in
   * when that sign-in is no account of CawCo's: it names no account until
   * one is picked.
   */
  machineSignIn: "No account",
  /**
   * A first message refused before anything ran: the transcript's sign-in
   * is no account of CawCo's on its machine, and nothing picks one for it.
   * The card's title, then its line with the two ways on, `email` the
   * sign-in; and the line when its machine keeps no sign-in for it.
   */
  notResumed: "Not resumed",
  noAccount: (machine: string, email: string) =>
    `It ran as ${email}, which is no account of CawCo's on ${machine}. Move ${machine}'s sign-in into CawCo in Configure, or pick an account in this session's details.`,
  noSignIn: (machine: string) =>
    `${machine} keeps no sign-in for it. Pick an account in this session's details.`,
  /** A resume or a reading the machine did not answer in time ({@link didntAnswer}'s outcome). */
  resumeUnknown: "whether the session was resumed is not known",
  ranWithUnknown: "what it ran with is not known",
  /** A resume refused here: its harness has permission modes and its machine read none to resume it in. */
  noModeRead: (machine: string) =>
    `${machine} read no permission mode to resume it in. Try again.`,
  /**
   * The tab strip's name: its tabs are chats and projects alike. In a split
   * each strip says its group's number, the one Move to group names.
   */
  openTabs: (group: number, groups: number): string =>
    groups > 1 ? `Open tabs, group ${group}` : "Open tabs",
  /** A tab's menu: its place in the workspace's groups, for a chat's tab and a project's alike. */
  splitRight: "Split right",
  splitDown: "Split down",
  moveToGroup: (group: number): string => `Move to group ${group}`,
  closeTab: "Close",
  closeOthers: "Close others",
  /** The transcript's landmark, as a screen reader names it. */
  transcript: "Session transcript",
  /** The composer's send. */
  sendMessage: "Send message",
  /** A message's actions, on its speaker line. */
  copyMessage: "Copy message",
  editMessage: "Edit message",
  forkFromHere: "Fork from here",
  /** A touch screen's handle to them, and the sheet it opens with its rows. */
  messageActions: "Message actions",
  messageSheet: "Message",
  copyRow: "Copy",
  editRow: "Edit",
  /** A queued message's way back, at rest in its well. */
  editInPlace: "Edit in place",
  removeFromQueue: "Remove from queue",
  /** A failed send's way back, at rest in its well. */
  retrySend: "Retry",
  editFailed: "Edit",
  removeFailed: "Remove",
  /** An edit's controls. */
  cancelEdit: "Cancel edit",
  sendEdited: "Send edited message",
  /** A send the hub refused, with what it said. */
  notSent: "Couldn't send that message.",
  /** A stored session's menu: its words carried into a new session. */
  continueInNew: "Continue in new session…",
  /** An agent's block in its reply (InlineBlock, tsk-330): its act, floating over it. */
  keepAsArtifact: "Keep as artifact",
  /** On a block a later version under its name replaced: the way to that version. */
  jumpToLatestVersion: "Jump to latest version",
  /** On a block moved into an artifact: the way to it, by its title. */
  openArtifact: (title: string): string => `Open ${title}`,
  /** Under a block naming components the block library lacks: what was left out. */
  blockDropped: (names: readonly string[]): string =>
    `This block uses ${names.join(", ")}, which CawCo's blocks don't have, so ${names.length > 1 ? "they're" : "it's"} left out.`,
  /** A block kept as an artifact: what the panel's head asks of the person. */
  keptBlockAsk: (title: string): string =>
    `Pin anything in ${title} that reads wrong`,
  /** A kept block refused for its size, in KiB, and the most a block holds. */
  blockTooLarge: (kib: number, most: number): string =>
    `The block is ${kib} KiB; a block holds ${most} KiB at most. Split it.`,
  /** A kept block refused for OpenUI Cloud markers in its program. */
  blockCloudMarkers:
    "The block carries OpenUI Cloud markers: a block is a program alone, and runs no scripts.",
  /** A kept block refused for an action in its program, by the action's name. */
  blockAction: (action: string): string =>
    `@${action} is an action: a block runs none.`,
  /** A kept block refused for a URL in its words (hub decision-program.ts), the URL's start quoted. */
  blockUrlRefused: (url: string): string =>
    `“${url}” is a URL: a block reaches no network. Show a file with Image, Video or Audio, or write what it shows into the block.`,
  /** A kept block refused for a file its Image, Video or Audio can't name (core `blockFile`): empty, a web address, or climbing out with `..`. */
  blockFileRefused: (file: string): string =>
    `“${file}” names no file a block can show: give an absolute path on your machine, or a path in the project's folder.`,
  /** A kept block refused for a path in the project's folder, written by a session in no project. */
  blockFileNoProject: (file: string): string =>
    `“${file}” is a path in a project's folder, and this session is in no project: give its absolute path on your machine.`,
  /** Where a block's picture, clip or sound would stand when it names no file a block can show. */
  blockFileUnshown: (file: string): string =>
    `“${file}” isn't a file this block can show.`,
  /** Where a block's picture would stand when it didn't load. */
  blockPictureFailed: (alt: string): string => `${alt} didn't load.`,
  /** A block's picture, pressed: it opens full size. */
  blockPictureOpen: (alt: string): string => `Open ${alt} full size`,
  /** A replaced block's clip, still: what it was. */
  blockVideoStill: "Video",
  /** A replaced block's sound, still: what it was. */
  blockAudioStill: "Sound",
  /** A block's slideshow: the slide it shows, of how many. */
  blockSlideCount: (at: number, of: number): string => `${at} of ${of}`,
  blockSlidePrevious: "Previous slide",
  blockSlideNext: "Next slide",
  /** A block's slideshow, as a reader is told it. */
  blockSlides: (of: number): string => `Slideshow, ${of} slides`,
  /** A block's Preview naming no page artifact of its conversation. */
  blockPageMissing: (name: string): string =>
    `No page named “${name}” in this conversation.`,
  /** A block's Preview whose page didn't open, the hub's words after. */
  blockPageFailed: (name: string, why: string): string =>
    `${name} didn't open: ${why}`,
  /** A block's Preview's frame, as a reader is told it. */
  blockPageFrame: (title: string): string => `Page: ${title}`,
  /** A kept block refused for markup in its words, the markup's start quoted. */
  blockMarkupRefused: (markup: string): string =>
    `“${markup}” holds markup: a block's words are plain.`,
};
