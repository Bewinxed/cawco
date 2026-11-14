/**
 * Find in a conversation: Command-F grows the composer a find field on its
 * top, and the places the words are in stand beside the conversation (on a
 * desk, its side panel's Find; narrow, the composer's layer). The words the
 * dashboard shows for it.
 */
/** A sentence's closing stop and the space after it. */
const CLOSE = /[.\s]+$/u;

export const findInWords = {
  /** The find field, its name and its hint. */
  field: "Find in this conversation",
  /** Where find stands among the places: "3 of 9". */
  place: (at: number, of: number) => `${at} of ${of}`,
  /** The place, for a screen reader. */
  placeSpoken: (at: number, of: number) => `Match ${at} of ${of}`,
  /** No place holds the words. */
  none: "0",
  noneSpoken: "No matches",
  previous: "Previous match",
  next: "Next match",
  /** Narrow, the place count opens and folds the places over the conversation. */
  showPlaces: "Show matches",
  hidePlaces: "Hide matches",
  /** Attach's menu item, the way in for a pointer and a finger. */
  menuItem: "Find",
  /** The places, as a list. */
  places: "Matches",
  /** The whose-words filters. */
  whose: "Whose words",
  all: "All",
  me: "You",
  tools: "Tools",
  delegates: "Delegates",
  /** A place's title by whose words it is. */
  toolOutput: (tool: string) => `${tool} output`,
  /** A tool whose name was not kept. */
  tool: "Tool",
  /** A delegate's report whose delegate has no name. */
  report: "Delegate",
  /** A report's place, as the transcript's report line names it (Peer). */
  reportFrom: (delegate: string) => `Report from ${delegate}`,
  /** A place in the agent's reasoning, as the transcript's fold names it (Thinking). */
  reasoning: "Reasoning",
  /** A live turn saying the words as it is written. */
  writing: "Writing…",
  /** Nothing in the conversation holds the words (DESIGN.md Voice, no results). */
  nothingTitle: (words: string) => `No matches for “${words}”`,
  everywhere: "Find in every session",
  /** The machine holding the transcript did not answer: only the messages loaded were searched. */
  /** The machine's agent is older than the conversation's whole search: only the messages loaded were searched. */
  outdated: (machine: string) =>
    `${machine} needs an update to search this whole conversation, so only the messages already here were searched.`,
  unreached: (machine: string) =>
    `${machine} didn't answer, so only the messages already here were searched.`,
  /** The hub refused the find: its own sentence, then what came of it. */
  refused: (detail: string) =>
    `${detail.replace(CLOSE, "")}, so only the messages already here were searched.`,
  retry: "Retry",
  /** The Waiting for you list's window: reports and tasks reach back this far; artifacts wait whatever their age. */
  waitingWindow: (days: number) =>
    `Reports and tasks from the last ${days} days. Artifacts stay until you open them.`,
  /** The conversation holds more places than the list lists. */
  more: (listed: number) =>
    `This conversation holds more matches than the ${listed} listed, the oldest first. Search for more of the words to narrow them.`,
  /** Find closed at a place: the way back to where the conversation was being read. */
  back: "Back to where you were",
};
