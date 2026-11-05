/**
 * The words of a project's conversation in its panel on the project page:
 * its head's actions and why a new one can't start.
 */
export const conversationWords = {
  /** The panel head's action: a new session in the project, its words the first prompt. */
  newConversation: "New conversation",
  /**
   * His composer's hint, in the panel's hero and on his conversation: it
   * names him, never "the agent".
   */
  placeholder: {
    full: "Message Caw…  /  for commands, @ to mention",
    short: "Message Caw…",
  },
  /** The docked head's action on a desk: puts his panel away; the conversation goes on. The phone's sheet keeps its Close. */
  hidePanel: "Hide Caw",
  /** The panel head's action: the conversation on show, as a tab. */
  openAsTab: "Open as a tab",
  /** The conversation on show, as its More names it ("More for this conversation"). */
  conversation: "this conversation",
  /** A new conversation with nowhere to run: the project has no checkout on a machine yet. */
  noCheckout:
    "This project has no checkout on a machine yet, so a conversation can't start. Add one in Project details, then try again.",
  /**
   * A start of his conversation undone because its first message did not
   * go (hub caw.ts `startConversation`): the project's `problem`, on its
   * page and in his panel, `why` the hub's sentence.
   */
  firstSendRefused: (why: string) =>
    `The project's conversation didn't start: its first message didn't go. ${why}`,
  /**
   * His panel's start the page reloaded through, its session never listed
   * (spawn/parked `recover`): the words are back in his composer.
   */
  reloadedStart:
    "The page reloaded before the conversation started, so your message didn't go. It's back in the field: send it again.",
  /** Caw's sentence on the project head and in his panel: what the project's conversation is doing. */
  status: {
    /** Off, with what he started still finishing. */
    offFinishing: (count: number) => `Caw is off · ${count} still finishing`,
    /** Off, nothing running. */
    off: "Caw is off",
    /** It waits on an answer of yours. */
    waiting: "Waiting on you",
    /** A task just landed. */
    landed: (taskId: string) => `${taskId} landed`,
    /** Nothing to do, under way or waiting. */
    idle: "Nothing due",
    /** At rest, ready for words. */
    ready: "Ready",
    /** The board is still on its way. */
    reading: "Reading the board…",
    /** The hub is away. */
    reconnecting: "Reconnecting to the hub",
    /** At work, no tool of his under way: under him in his conversation, and on the project head. */
    working: "Working…",
  },
  /** His at-work element in his conversation, for a screen reader. */
  atWork: "Caw at work",
};

/**
 * Whether Caw acts on his own in a project (the project's switch, hub
 * caw.ts `configure`): said as Caw himself is, on or off, never as the
 * events that reach him (DESIGN.md, Voice: the person's words, not the
 * plumbing). His panel's bar says it, and the switch says what on does.
 */
export const cawSwitchWords = {
  /** The bar's item, and its tooltip: his state. */
  on: "Caw is on",
  off: "Caw is off",
  /** His settings, for a screen reader. */
  settings: "Caw's settings",
  /** The switch. */
  label: "Caw acts on his own",
  /** Under it: the one consequence a person needs before flipping it. */
  line: "He picks up what happens in the project without you writing: a task handed in, a routine's report, a pick you made. Off, he answers only when you write.",
};
