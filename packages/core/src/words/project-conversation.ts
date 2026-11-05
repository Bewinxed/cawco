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
  /**
   * The panel head's control: whether the project's events reach a
   * conversation, said as it stands; pressed, its switch unfolds under the
   * head.
   */
  events: { on: "Events on", off: "Events off" },
  /** The panel head's line, after the status word: the conversation on show is the one the project's events reach. */
  getsEvents: "gets the project's events",
  /** A new conversation with nowhere to run: the project has no checkout on a machine yet. */
  noCheckout:
    "This project has no checkout on a machine yet, so a conversation can't start. Add one in Project details, then try again.",
  /** Caw's sentence on the project head and in his panel: what the project's conversation is doing. */
  status: {
    /** Events off, with what the conversation started still finishing. */
    offFinishing: (count: number) => `Events off · ${count} still finishing`,
    /** Events off, nothing running: only the person's words reach it. */
    off: "Events off · answers when you write",
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
