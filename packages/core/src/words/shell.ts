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
  /*
   * The connection band on a page built for an older wire than the hub's,
   * which reads nothing more until it reloads (reload.svelte.ts): the lead,
   * then what the reload waits on, then the band's Reload.
   */
  /** The lead: the page stopped reading the hub. */
  staleLead: "CawCo updated — this page has stopped updating.",
  /** A field has the keyboard and was typed in within `seconds`. */
  staleTyping: (seconds: number) =>
    `It reloads ${seconds} seconds after you stop typing.`,
  /** Pointer or key input within `seconds`, no field typed in. */
  staleRecent: (seconds: number) =>
    `It reloads once the page has been still for ${seconds} seconds.`,
  /** Words in a field nothing keeps across a reload: the focused one, or one in an open dialog. */
  staleUnsaved: "It reloads once you save or close what you're editing.",
  /** The dashboard's server doesn't run the new build yet: a reload would load this one. */
  staleBuild: "It reloads when the dashboard serves the new build.",
  /** The browser keeps no session storage, so the page never reloads itself. */
  staleUnkept: "Reload it to catch up.",
  /** The band's button, and its words while the drafts are written down first. */
  reload: "Reload",
  reloading: "Reloading…",
};
