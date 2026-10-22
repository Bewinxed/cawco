/**
 * Whether the person is here: the presence dot on the rail's avatar and its
 * menu (Appear away, the machines that count), and the onboarding row in
 * Needs you that lets this browser say when the person is at this computer
 * (Chromium's Idle Detection) and show what needs them as a desktop
 * notification. State words only: nothing says what the person did.
 */
export const presenceWords = {
  /** The dot's word and the menu's head while the person is here. */
  here: "Here",
  /** Here, with the chat in front, by its title. */
  hereOn: (chat: string) => `Here, on ${chat}`,
  /** Away, since when (HH:MM in this browser's zone); the bare word when no device ever said. */
  away: (since: string | null) => (since ? `Away since ${since}` : "Away"),
  /** Appear away is on, since when. */
  appearingAway: (since: string | null) =>
    since ? `Appearing away since ${since}` : "Appearing away",
  /** The menu's switch: agents go quiet and the phone gets pushes while it is on. */
  appearAway: "Appear away",
  /** The menu's group: the machines whose desktop can say you're here, each turned on by you. */
  machines: "Machines that count",
  /** A machine's state word, as its agent reads its desktop; null when it hasn't said lately. */
  machineState: (state: string | null) => {
    if (state === "active") {
      return "in use";
    }
    return state ?? "not reporting";
  },
  /** The menu's group for this browser, and its one item while something is still to allow. */
  thisBrowser: "This browser",
  setUp: "Set up this browser",
  /** The trigger's name, with the dot's word after it. */
  you: (state: string) => `You · ${state}`,
  /** The onboarding row: its title, by what this browser can do. */
  title: (idle: boolean) =>
    idle
      ? "Tell CawCo when you're at this computer"
      : "Show what needs you on this computer",
  /** The row's notice: what it shares, and what changes for the person. */
  lead: (idle: boolean) =>
    idle
      ? "Chrome tells CawCo whether this computer is in use, idle or locked, and nothing else. While you're at it, agents talk to you, and what needs you shows here as a notification instead of on your phone."
      : "While you're at this computer, what needs you shows here as a notification instead of on your phone.",
  meta: "Onboarding · this browser",
  /** Its tick, once the browser allowed it. */
  done: (idle: boolean) =>
    idle
      ? "This browser tells CawCo when you're here."
      : "What needs you shows here while you're at this computer.",
  allow: "Allow",
  allowing: "Allowing…",
  skip: "Skip",
  /** The title of what the browser refused, over its words. */
  blocked: "This browser blocked it",
  /** The hub refused a switch. */
  refused: "The hub refused that change",
};
