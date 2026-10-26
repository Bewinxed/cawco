/**
 * Whether the person is here: the presence dot on the rail's avatar and its
 * menu (Appear away, the away clock, this device's report, the machines
 * that count), and the consent step in Needs you that lets this computer
 * say when the person is at it (its CawCo agent, or Chromium's Idle
 * Detection, "Your device use" in its site settings) and show what needs
 * them as a desktop notification. Nothing reports before the person's yes.
 * State words only: nothing says what the person did.
 */
/**
 * This device's report of whether the person is at this computer: on, off,
 * blocked in the browser's site settings, or unavailable (no agent here and
 * no Idle Detection).
 */
export type DeskState = "on" | "off" | "blocked" | "unavailable";

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
  /** The away clock's row: how long without input on any device before you're away. */
  awayAfter: (minutes: number) => `Away after ${minutes} min`,
  /** The away clock's choices' heading. */
  awayClock: "Away after no input for",
  /** One away clock choice. */
  minutes: (minutes: number) =>
    minutes >= 60 && minutes % 60 === 0
      ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}`
      : `${minutes} min`,
  /**
   * After the plan ring's name while its mark stands: the session's plan has
   * notes from while you were away (`## Since HH:MM`) you haven't opened.
   */
  awayNotesUnseen: (since: string) => `new notes since ${since}`,
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
  /** The menu's switch: this device says when you're at this computer (its CawCo agent, or this browser's Idle Detection). */
  atComputer: "Say when I'm at this computer",
  /** That switch's state word: on, off, blocked in the browser, or no Idle Detection here. */
  atComputerState: (state: DeskState) =>
    state === "unavailable" ? "not available here" : state,
  setUp: "Set up this browser",
  /** The trigger's name, with the dot's word after it. */
  you: (state: string) => `You · ${state}`,
  /** The onboarding row's title, a noun true before and after: your presence when it asks for it, else desk alerts alone. */
  title: (activity: boolean) =>
    activity ? "Your presence at this computer" : "Desk alerts in this browser",
  /**
   * Why CawCo asks to know you're at this computer, and what you get: the
   * consent step's first words, before anything is read.
   */
  why: "With your yes, CawCo knows when you're at this computer, even on another tab or app: agents stay quiet while you're away, what needs you goes to your phone once you leave, and while you're on another tab it comes here as a desktop notification.",
  /** What is read, and what never is. */
  reads:
    "CawCo reads only whether keys or the pointer moved and whether the screen is locked, never what you do.",
  /**
   * The consent step's notice, by what says it on this computer: its CawCo
   * agent (by the machine's name), or this browser's “Your device use”
   * (Chromium's name for Idle Detection); then notifications, when they are
   * still to ask. Nothing is on before Allow.
   */
  lead: (ask: { agent: string | null; idle: boolean; notify: boolean }) => {
    const notify = ask.notify
      ? " Allow also lets this site show notifications."
      : "";
    if (ask.agent) {
      return `${presenceWords.why} ${presenceWords.reads} The CawCo agent on ${ask.agent} reads it once you allow it, and you can turn it off in your presence menu.${notify}`;
    }
    if (ask.idle) {
      return `${presenceWords.why} ${presenceWords.reads} This browser reads it once you allow “Your device use”, and you can turn it off in your presence menu.${notify}`;
    }
    return "Allow notifications for this site, and what needs you shows here instead of on your phone while you're at this computer.";
  },
  /**
   * The step in a browser with no Idle Detection (Safari, Firefox, Brave)
   * on a computer with no CawCo agent: it says this browser can't, and that
   * only presses in the CawCo tab count here. Notifications still to ask
   * come after.
   */
  unavailable: (notify: boolean) =>
    `This browser can't tell CawCo whether you're at this computer, so here only your presses in the CawCo tab count. The CawCo agent on this computer could tell CawCo instead, once you allow it.${notify ? " Allow notifications for this site, and what needs you shows here instead of on your phone while you're at this computer." : ""}`,
  meta: "Onboarding · this browser",
  /** Its tick, once allowed. */
  done: (activity: boolean) =>
    activity
      ? "CawCo knows when you're at this computer now."
      : "What needs you shows here while you're at this computer.",
  allow: "Allow",
  allowing: "Allowing…",
  skip: "Skip",
  /** Chromium's site-settings name for Idle Detection. */
  deviceUse: "Your device use",
  /** Each browser's site-settings name for notifications. */
  notifications: (place: string) =>
    place === "firefox" ? "Send Notifications" : "Notifications",
  /** What the browser blocks for this site, by the names its site settings show. */
  blocked: (names: readonly string[]) =>
    `${names.map((name) => `“${name}”`).join(" and ")} ${names.length > 1 ? "are" : "is"} blocked for this site`,
  /** Where to turn a blocked one back on, in this browser. */
  unblock: (place: string, many: boolean) => {
    const them = many ? "them" : "it";
    switch (place) {
      case "chromium":
        return `Turn ${them} on from the icon left of the address, then reload.`;
      case "firefox":
        return "Clear the block from the icon left of the address, then reload.";
      case "safari":
        return "Allow notifications for this site in Safari › Settings › Websites › Notifications, then reload.";
      default:
        return `Allow ${them} in this browser's settings for this site, then reload.`;
    }
  },
  /** The browser threw instead of opening its prompt, over its own words. */
  notAsked: "This browser didn't open its prompt",
  /** The hub refused a switch. */
  refused: "The hub refused that change",
};
