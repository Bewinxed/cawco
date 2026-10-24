/**
 * Whether the person is here: the presence dot on the rail's avatar and its
 * menu (Appear away, the away clock, the machines that count), and the onboarding row in
 * Needs you that lets this browser say when the person is at this computer
 * (Chromium's Idle Detection, "Your device use" in its site settings) and
 * show what needs them as a desktop notification. State words only:
 * nothing says what the person did.
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
  /** The menu's switch: this browser says when you're at this computer (Idle Detection). */
  atComputer: "Say when I'm at this computer",
  /** That switch's state word: on, off, blocked in the browser, or no Idle Detection here. */
  atComputerState: (state: "on" | "off" | "blocked" | "unavailable") =>
    state === "unavailable" ? "not available here" : state,
  setUp: "Set up this browser",
  /** The trigger's name, with the dot's word after it. */
  you: (state: string) => `You · ${state}`,
  /** The onboarding row's title, a noun true before and after, by what this browser can do. */
  title: (idle: boolean) =>
    idle ? "Your presence at this computer" : "Desk alerts in this browser",
  /**
   * The row's notice: the site settings it asks for, by the names the
   * browser shows them ("Your device use" is Chromium's name for Idle
   * Detection), what it shares, and what changes for the person.
   */
  lead: (ask: { idle: boolean; notify: boolean }) => {
    if (ask.idle && ask.notify) {
      return "Allow “Your device use” and notifications for this site. CawCo reads only whether this computer is in use, idle or locked, and what needs you shows here instead of on your phone.";
    }
    if (ask.idle) {
      return "Allow “Your device use” for this site. CawCo reads only whether this computer is in use, idle or locked.";
    }
    return "Allow notifications for this site, and what needs you shows here instead of on your phone while you're at this computer.";
  },
  /**
   * The row's notice in a browser with no Idle Detection (Safari, Firefox,
   * Brave): it says so, and where this computer can say it instead, its
   * CawCo agent's switch in the presence menu, by the machine's name when
   * the hub ties this browser to one. Notifications still to ask come after.
   */
  unavailable: (machine: string | null, notify: boolean) =>
    `This browser can't tell CawCo when you're at this computer. ${
      machine
        ? `Turn on ${machine} under “Machines that count” in your presence menu, and its CawCo agent tells CawCo instead.`
        : "Run the CawCo agent on this computer, then turn it on under “Machines that count” in your presence menu."
    }${notify ? " Allow notifications for this site, and what needs you shows here instead of on your phone while you're at this computer." : ""}`,
  meta: "Onboarding · this browser",
  /** Its tick, once the browser allowed it. */
  done: (idle: boolean) =>
    idle
      ? "This browser tells CawCo when you're here."
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
