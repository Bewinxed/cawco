/**
 * Find in a conversation: Command-F grows the composer a find field on its
 * top, and the places the words are in stand beside the conversation (on a
 * desk, its side panel's Find; narrow, the composer's layer). The words the
 * dashboard shows for it.
 */
export const findInWords = {
  /** The find field, its name and its hint. */
  field: "Find in this conversation",
  /** Where find stands among the places: "3 of 9". */
  place: (at: number, of: number) => `${at} of ${of}`,
  /** The place, for a screen reader. */
  placeSpoken: (at: number, of: number) => `Place ${at} of ${of}`,
  /** No place holds the words. */
  none: "0",
  noneSpoken: "No places",
  previous: "Previous place",
  next: "Next place",
  close: "Close find",
  /** Narrow, the place count opens the places over the conversation. */
  showPlaces: "Show the places",
  /** Attach's menu item, the way in for a pointer and a finger. */
  menuItem: "Find",
  /** The places, as a list. */
  places: "Places",
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
  report: "Report",
  /** A live turn saying the words as it is written. */
  writing: "Writing",
  /** Nothing in the conversation holds the words. */
  nothingTitle: (words: string) => `Nothing here says “${words}”`,
  nothingLine: "Another session may have said it.",
  everywhere: "Find in every session",
  /** The machine holding the transcript did not answer: only the turns loaded were searched. */
  unreached: (machine: string) =>
    `${machine} didn't answer, so only the turns loaded here were searched.`,
  /** The hub refused the find: its own words. */
  refused: (detail: string) => `Find was refused: ${detail}`,
  retry: "Retry",
  /** Find closed at a place: the way back to where the conversation was being read. */
  back: "Back where you were",
};
