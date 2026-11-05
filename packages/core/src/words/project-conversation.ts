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
    /** At work, no tool of his under way: under him in his conversation, and on the project head. */
    working: "Working…",
  },
  /** His at-work element in his conversation, for a screen reader. */
  atWork: "Caw at work",
};
