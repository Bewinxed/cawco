/**
 * What the dashboard's frame says around every page: the theme switch, the
 * jump to a session, the error page, the empty fleet, a transcript catching
 * up, a fault's details. The dashboard renders them from here, and the
 * probe kit finds them by these same words (scripts/probe-words-check.ts
 * refuses a copy).
 */
export const shellWords = {
  /** The theme switch, named for the theme it stands in. */
  lightMode: "Light mode",
  darkMode: "Dark mode",
  /** The ⌘K search's button. */
  jumpToSession: "Jump to session",
  /** The error page's title, a missing page or any other failure. */
  pageNotFound: "Page not found",
  somethingWentWrong: "Something went wrong",
  /** The sessions page with no machine to run on. */
  noMachines: "Connect a machine to run sessions",
  noneOnline: "None of your machines are online",
  /** A transcript reading what it missed. */
  catchingUp: "Catching up…",
  /** A cut error's way to its whole text. */
  wholeError: "Show the whole error",
  /** A fault's folded words: what refused it, word for word. */
  showDetails: "Show details",
  hideDetails: "Hide details",
  /** Where a copy the browser refused can still be copied by hand. */
  fromShowDetails: "from Show details",
};
