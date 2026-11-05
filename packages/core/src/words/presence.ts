/**
 * Whether the person is here: the presence dot on the rail's avatar and its
 * menu (Appear away, the away clock, this device's report, the machines
 * that count), and the consent step in Needs you that lets this computer
 * say when the person is at it (its CawCo agent, or Chromium's Idle
 * Detection, "Your device use" in its site settings) and show what needs
 * them as a desktop notification; on a phone that step asks for
 * notifications alone. Nothing reports before the person's yes.
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
  /**
   * The onboarding row's title, a noun true before and after: your presence
   * while it is asked (never on a phone), else notifications alone.
   */
  title: (activity: boolean, phone: boolean) => {
    if (activity) {
      return "Your presence at this computer";
    }
    return phone
      ? "Notifications on this phone"
      : "Notifications in this browser";
  },
  /** What the person gets, the presence ask's first sentence. */
  gets: "Agents stay quiet while you're away, and what needs you goes to your phone.",
  /** What is read, by what reads it; "only" says what never is. */
  reads: (reader: "agent" | "computer") =>
    reader === "agent"
      ? "only whether its keys or pointer moved and whether its screen is locked"
      : "only whether keys or the pointer moved and whether the screen is locked",
  /** Notifications, while still to ask: the Allow sentence's last clause. */
  notifies: "this site show notifications",
  /**
   * The consent step's notice: what the person gets, then what Allow turns
   * on and what it reads (this computer's CawCo agent by the machine's
   * name, or this browser's Idle Detection), then notifications while they
   * are still to ask. A phone is asked for notifications alone. Nothing is
   * on before Allow.
   */
  lead: (
    ask: { agent: string | null; idle: boolean; notify: boolean },
    phone: boolean
  ) => {
    const notify = ask.notify ? `, and ${presenceWords.notifies}` : "";
    if (ask.agent) {
      return `${presenceWords.gets} Allow lets the agent on ${ask.agent} read ${presenceWords.reads("agent")}${notify}.`;
    }
    if (ask.idle) {
      return `${presenceWords.gets} Allow lets this browser read ${presenceWords.reads("computer")}${notify}.`;
    }
    return phone
      ? `What needs you reaches you while CawCo isn't in front. Allow lets ${presenceWords.notifies}.`
      : `What needs you shows here while you're in another tab or app, instead of on your phone. Allow lets ${presenceWords.notifies}.`;
  },
  /** What counts as being here when nothing here can read it: the presence menu's line under "not available here". */
  countsHere: (phone: boolean) =>
    phone
      ? "Only taps in CawCo count here."
      : "Only presses in the CawCo tab count here.",
  /**
   * A browser with no Idle Detection (Safari, Firefox, Brave) on a computer
   * with no CawCo agent, asked only while notifications are still to ask:
   * what counts here instead, then notifications.
   */
  unavailable:
    "This browser can't read whether you're at this computer, so only presses in the CawCo tab count here. Allow lets this site show notifications.",
  meta: "Onboarding · this browser",
  /** Its tick, once allowed: what turned on. */
  done: (activity: boolean, phone: boolean) => {
    if (activity) {
      return "CawCo knows when you're at this computer now.";
    }
    return phone
      ? "This phone shows notifications now."
      : "This browser shows notifications now.";
  },
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
