/**
 * The words of a project's conversation in its panel on the project page:
 * its head's actions and why a new one can't start.
 */
export const conversationWords = {
  /** The panel head's action: a new session in the project, its words the first prompt. */
  newConversation: "New conversation",
  /** The panel head's action: the conversation on show, as a tab. */
  openAsTab: "Open as a tab",
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
  },
};
