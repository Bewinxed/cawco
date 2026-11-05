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
  /** The panel head's action: the conversation on show, as a tab. */
  openAsTab: "Open as a tab",
  /** The conversation on show, as its More names it ("More for this conversation"). */
  conversation: "this conversation",
  /** A new conversation with nowhere to run: the project has no checkout on a machine yet. */
  noCheckout:
    "This project has no checkout on a machine yet, so a conversation can't start. Add one in Project details, then try again.",
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
    /** His conversation is starting: the words that start it are not taken yet. */
    starting: "Starting…",
  },
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
