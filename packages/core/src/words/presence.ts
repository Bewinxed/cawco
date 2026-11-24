/**
 * Whether the person is here: the presence dot on the rail's avatar and its
 * menu (Appear away, the away clock, this device's report, the machines
 * that count), and the ask a browser shows as the dashboard loads, until
 * it is answered there: show what needs the person as a desktop
 * notification, and let this computer say when they are at it (its CawCo
 * agent, or Chromium's Idle Detection, "Your device use" in its site
 * settings); on a phone it asks for notifications alone. Nothing reports
 * before the person's yes.
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
   * The ask's title, a noun true before and after: notifications while
   * they are asked, else your presence at this computer.
   */
  title: (ask: { notify: boolean }, phone: boolean) => {
    if (!ask.notify) {
      return "Your presence at this computer";
    }
    return phone
      ? "Notifications on this phone"
      : "Notifications in this browser";
  },
  /** What the person gets from presence alone, its ask's first sentence. */
  gets: "Agents stay quiet while you're away, and what needs you goes to your phone.",
  /** What is read, by what reads it; "only" says what never is. */
  reads: (reader: "agent" | "computer") =>
    reader === "agent"
      ? "only whether its keys or pointer moved and whether its screen is locked"
      : "only whether keys or the pointer moved and whether the screen is locked",
  /** What notifications give, by the device they show on. */
  shows: (phone: boolean) =>
    phone
      ? "What needs you reaches you while CawCo isn't in front."
      : "What needs you shows here while you're in another tab or app, instead of on your phone.",
  /** Notifications: what Allow lets. */
  notifies: "this site show notifications",
  /**
   * The ask's words: notifications first, while they are still to ask, and
   * what Allow lets; then what Allow turns on for presence and what it
   * reads (this computer's CawCo agent by the machine's name, or this
   * browser's Idle Detection). A phone is asked for notifications alone.
   * Nothing is on before Allow.
   */
  lead: (
    ask: { agent: string | null; idle: boolean; notify: boolean },
    phone: boolean
  ) => {
    const reader = ask.agent
      ? `the agent on ${ask.agent} read ${presenceWords.reads("agent")}`
      : `this browser read ${presenceWords.reads("computer")}`;
    const presence = ask.agent !== null || ask.idle;
    if (!ask.notify) {
      return `${presenceWords.gets} Allow lets ${reader}.`;
    }
    if (!presence) {
      return `${presenceWords.shows(phone)} Allow lets ${presenceWords.notifies}.`;
    }
    return `${presenceWords.shows(phone)} Allow lets ${presenceWords.notifies}, and lets ${reader}, so agents stay quiet while you're away.`;
  },
  /** What counts as being here when nothing here can read it: the presence menu's line under "not available here". */
  countsHere: (phone: boolean) =>
    phone
      ? "Only taps in CawCo count here."
      : "Only presses in the CawCo tab count here.",
  /** Its tick, once allowed: what turned on, notifications first. */
  done: (
    ask: { agent: string | null; idle: boolean; notify: boolean },
    phone: boolean
  ) => {
    const device = phone ? "This phone" : "This browser";
    const presence = ask.agent !== null || ask.idle;
    if (!ask.notify) {
      return "CawCo knows when you're at this computer now.";
    }
    return presence
      ? `${device} shows notifications now, and CawCo knows when you're at this computer.`
      : `${device} shows notifications now.`;
  },
  allow: "Allow",
  allowing: "Allowing…",
  notNow: "Not now",
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
