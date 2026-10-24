/**
 * This tab's presence (`POST /api/presence`): three facts the hub rolls up
 * into whether the person is here (hub notifications.ts `rollup`).
 *
 * - **The chat in front and read** (`active`, `sessionId`): a session in
 *   front while the page is visible and focused. The hub sends no
 *   notification about what landed in a session while some client was
 *   active on it. It goes inactive the moment the tab blurs, hides or
 *   unloads; a blur no longer means the person left.
 * - **The person's input here** (`idleMs`): how long since their last key,
 *   pointer press or move, wheel or touch on this page or a preview frame
 *   in it, as the page's one input tracker hears it (reload.svelte.ts
 *   `watchInput`); absent until the first since the page loaded. Input
 *   decides whether the person is here: a tab open and focused with nobody
 *   at it says no input, and they go away once the away clock passes.
 * - **The computer** (`machine`, `deskIdleMs`): Chromium's Idle Detection,
 *   once the person allowed it for this browser (Needs you's onboarding
 *   row, the presence menu) and left it on, says whether this computer is
 *   in use, idle or locked, its threshold the away clock. The hub reads it
 *   as an opted-in machine's desktop: input there keeps the person here
 *   with the tab hidden, a lock makes them away at once.
 * - **A phone or tablet** (`handheld`): a coarse pointer that can't hover,
 *   so what needs the person goes to the phone while this tab is the one
 *   in use, never to a desk tab.
 *
 * Beside them, `alerts`: this tab may show desktop notifications, so the
 * hub can show what needs the person here instead of buzzing their phone
 * (person.svelte.ts shows them). The tab beats every {@link PRESENCE_BEAT_MS}
 * while it is open, and at once on a change.
 */
import {
  AWAY_AFTER_DEFAULT_MS,
  type MachineState,
  PRESENCE_BEAT_MS,
  type PresenceBeat,
} from "@cawco/core/notifications";
import { newId } from "#lib/cawco/id.js";
import { store, stored } from "#lib/cawco/storage.js";
import { lastInputAt, onInput } from "./reload.svelte";

/** Per tab: sessionStorage outlives a reload and is the tab's own. */
const CLIENT_KEY = "cawco-presence-client";
/**
 * This browser's word on reporting whether the person is at this computer,
 * kept in localStorage: `off` once they turned it off (the presence menu)
 * or put the offer away; Idle Detection runs only without it.
 */
const DESK_KEY = "cawco-desk-report";
/** Idle Detection's least threshold (the spec's 60 s). */
const LEAST_THRESHOLD_MS = 60_000;
/** An input after this long without one is said at once, not on the next beat: the person came back. */
const QUIET_MS = 60_000;

/** Chromium's Idle Detection (wicg.github.io/idle-detection), not in TypeScript's DOM yet. */
interface IdleDetectorLike extends EventTarget {
  readonly screenState: "locked" | "unlocked" | null;
  readonly start: (options: {
    signal: AbortSignal;
    threshold: number;
  }) => Promise<void>;
  readonly userState: "active" | "idle" | null;
}
interface IdleDetectorClass {
  readonly requestPermission: () => Promise<PermissionState>;
  new (): IdleDetectorLike;
}

/** The browser's IdleDetector, where it has one and the page is a secure context. */
const idleDetectorClass = (): IdleDetectorClass | undefined =>
  typeof window === "undefined" || !window.isSecureContext
    ? undefined
    : (window as unknown as { IdleDetector?: IdleDetectorClass }).IdleDetector;

let front: string | null = null;
let listening = false;
let beating: ReturnType<typeof setInterval> | undefined;
/** The last state the hub was told, so only a change (or a beat) posts. */
let told: string | undefined;
/** Idle Detection while it runs, what stops it, and since when it has said idle. */
let detector: IdleDetectorLike | undefined;
let stopDetector: AbortController | undefined;
let idleSince: number | undefined;
/** Idle Detection's threshold: the person's away clock (person.svelte.ts says it). */
let threshold = AWAY_AFTER_DEFAULT_MS;

/** Minted once per page load where no storage keeps the tab's own. */
let mintedHere: string | null = null;

/**
 * This tab's presence id. A send carries it beside the page's own client id
 * (client.svelte.ts `submitCommand` provenance), so the hub's log ties each
 * send to the presence that said what the tab had in front; a desk alert
 * names the tab it is for by it.
 */
export const presenceClientId = (): string => {
  const kept = stored("session", CLIENT_KEY);
  if (kept) {
    return kept;
  }
  mintedHere ??= newId();
  store("session", CLIENT_KEY, mintedHere);
  return mintedHere;
};

const reading = (): boolean =>
  front !== null &&
  document.visibilityState === "visible" &&
  document.hasFocus();

/** What Idle Detection says of this computer now; undefined while it doesn't run. */
const machineNow = (): MachineState | undefined => {
  if (!detector) {
    return;
  }
  if (detector.screenState === "locked") {
    return "locked";
  }
  return detector.userState === "idle" ? "idle" : "active";
};

/**
 * How long since the last input anywhere on this computer, as Idle
 * Detection can tell: 0 while it says active (input inside the threshold),
 * the threshold plus the time since it said idle after; undefined while it
 * doesn't run or the screen is locked (the lock says the rest).
 */
const deskIdleNow = (now: number): number | undefined => {
  if (!detector || detector.screenState === "locked") {
    return;
  }
  return detector.userState === "idle" && idleSince !== undefined
    ? now - idleSince + threshold
    : 0;
};

/** How long since the person's last input on this page, ms; undefined before any. */
const idleNow = (now: number): number | undefined => {
  const at = lastInputAt();
  return at === null ? undefined : Math.max(0, now - at);
};

/** A phone or tablet: a coarse pointer that can't hover. */
const handheld = (): boolean =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(pointer: coarse) and (hover: none)").matches;

const post = (beat: PresenceBeat, leaving: boolean): void => {
  const body = JSON.stringify(beat);
  if (leaving) {
    // The page is going: only a beacon is sure to leave with it.
    navigator.sendBeacon(
      "/api/presence",
      new Blob([body], { type: "application/json" })
    );
    return;
  }
  fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((error: unknown) => {
    // The next change or beat says it again.
    console.warn("[cawco] presence not sent:", error);
  });
};

/** Tells the hub this tab's state when it changed, or on a beat. */
const report = (beat = false, leaving = false): void => {
  const now = Date.now();
  const active = !leaving && reading();
  const machine = machineNow();
  // A tab going away shows nothing more: it is never the desk tab again.
  const alerts = !leaving && notificationsAllowed();
  const state = `${front}|${active}|${machine}|${alerts}`;
  if (beat || state !== told) {
    told = state;
    const idleMs = idleNow(now);
    const deskIdleMs = deskIdleNow(now);
    post(
      {
        clientId: presenceClientId(),
        client: "web",
        sessionId: front,
        active,
        alerts,
        handheld: handheld(),
        ...(idleMs === undefined ? {} : { idleMs }),
        ...(deskIdleMs === undefined ? {} : { deskIdleMs }),
        ...(machine ? { machine } : {}),
        // Beats can land out of order; the hub keeps the newest said.
        saidAt: now,
      },
      leaving
    );
  }
};

/** This browser may show desktop notifications. */
export const notificationsAllowed = (): boolean =>
  typeof Notification !== "undefined" && Notification.permission === "granted";

/** An input on the page: said at once when it is the first since the load, or ends a quiet stretch. */
const touched = (at: number, before: number | null): void => {
  if (before === null || at - before > QUIET_MS) {
    report(true);
  }
};

const listen = (): void => {
  if (listening) {
    return;
  }
  listening = true;
  const changed = () => report();
  window.addEventListener("focus", changed);
  window.addEventListener("blur", changed);
  document.addEventListener("visibilitychange", changed);
  window.addEventListener("pageshow", changed);
  window.addEventListener("pagehide", () => report(false, true));
  onInput(touched);
  beating = setInterval(() => report(true), PRESENCE_BEAT_MS);
  // Idle Detection runs again on every load once it is allowed.
  detectIdle().catch(() => undefined);
};

/** The session the owner has in front in this tab, or null when none is. */
export function presenceFront(sessionId: string | null): void {
  listen();
  front = sessionId;
  report();
}

/** Starts this tab's beats, whatever is in front: the dashboard's layout, once. */
export function startPresence(): void {
  listen();
  report();
}

/** Whether this tab beats: for a check that the interval stands. */
export const presenceBeating = (): boolean => beating !== undefined;

/**
 * Whose site settings the person changes a blocked permission in: Chromium's
 * and Firefox's sit behind the icon left of the address, Safari's in its
 * Settings › Websites. Chromium is told by `navigator.userAgentData`, which
 * only Chromium has.
 */
export type SettingsPlace = "chromium" | "firefox" | "safari" | "other";

const placeOf = (): SettingsPlace => {
  if ("userAgentData" in navigator) {
    return "chromium";
  }
  const agent = navigator.userAgent;
  if (agent.includes("Firefox/")) {
    return "firefox";
  }
  return agent.includes("Safari/") ? "safari" : "other";
};

/** What this browser lets the presence model use, as its permissions stand now. */
export interface DeskPermissions {
  /**
   * Idle Detection: absent (Safari, Firefox, Brave, not a secure context),
   * or its permission.
   */
  readonly idle: PermissionState | "unsupported";
  /** Desktop notifications: absent, or their permission. */
  readonly notify: NotificationPermission | "unsupported";
  /** Where a blocked one is turned back on. */
  readonly place: SettingsPlace;
}

/**
 * Brave, by the check Brave names for it (its wiki, "Detecting Brave (for
 * Websites)": `navigator.brave.isBrave()`). Brave turns Idle Detection off
 * (brave-core#7054) and hides its site setting (brave-browser#18409): its
 * answer is no without a prompt, and there is no setting to change.
 */
const isBrave = async (): Promise<boolean> => {
  const { brave } = navigator as Navigator & {
    brave?: { isBrave?: () => Promise<boolean> };
  };
  try {
    return (await brave?.isBrave?.()) === true;
  } catch {
    return false;
  }
};

/** This browser's permissions for the presence model, read without asking. */
export async function deskPermissions(): Promise<DeskPermissions> {
  const place = placeOf();
  const notify =
    typeof Notification === "undefined" || !window.isSecureContext
      ? "unsupported"
      : Notification.permission;
  if (!idleDetectorClass() || (await isBrave())) {
    return { idle: "unsupported", notify, place };
  }
  try {
    const status = await navigator.permissions.query({
      name: "idle-detection" as PermissionName,
    });
    return { idle: status.state, notify, place };
  } catch {
    return { idle: "prompt", notify, place };
  }
}

/** This browser reports whether the person is at this computer: not turned off here. */
export const deskReportOn = (): boolean => stored("local", DESK_KEY) !== "off";

/** Whether Idle Detection runs in this tab now. */
export const deskReporting = (): boolean => detector !== undefined;

/** Stops Idle Detection: the hub hears no more of this computer from this tab. */
const stopIdle = (): void => {
  stopDetector?.abort();
  stopDetector = undefined;
  detector = undefined;
  idleSince = undefined;
};

/**
 * Starts Idle Detection when it is granted, not turned off here and not yet
 * running, on the away clock as its threshold.
 */
async function detectIdle(): Promise<void> {
  const Detector = idleDetectorClass();
  if (!Detector || detector || !deskReportOn()) {
    return;
  }
  const { idle } = await deskPermissions();
  if (idle !== "granted") {
    return;
  }
  const running = new Detector();
  const stop = new AbortController();
  running.addEventListener("change", () => {
    if (running.userState === "idle") {
      idleSince ??= Date.now();
    } else {
      idleSince = undefined;
    }
    report(true);
  });
  await running.start({
    threshold: Math.max(LEAST_THRESHOLD_MS, threshold),
    signal: stop.signal,
  });
  stopDetector = stop;
  detector = running;
  report(true);
}

/**
 * The away clock, as the hub holds it: Idle Detection's threshold, so its
 * idle is the clock's. A running detector starts again on a new one.
 */
export function setDeskThreshold(ms: number): void {
  if (ms === threshold) {
    return;
  }
  threshold = ms;
  if (detector) {
    stopIdle();
    detectIdle().catch(() => undefined);
  }
}

/**
 * Turns this browser's report on or off, on the person's press: on asks the
 * browser first where it still may (the press's user activation stands),
 * then starts it; off stops it and is kept, so it is not offered again
 * until they turn it on.
 */
export async function setDeskReport(on: boolean): Promise<DeskPermissions> {
  if (!on) {
    store("local", DESK_KEY, "off");
    stopIdle();
    report(true);
    return deskPermissions();
  }
  const Detector = idleDetectorClass();
  const asked = Detector?.requestPermission();
  store("local", DESK_KEY, "on");
  await asked?.catch(() => undefined);
  await detectIdle();
  report(true);
  return deskPermissions();
}

/** The offer put away in this browser: its report stays off. */
export function declineDesk(): void {
  store("local", DESK_KEY, "off");
  stopIdle();
}

/** What a press asks this browser for. */
export interface DeskAsk {
  readonly idle: boolean;
  readonly notify: boolean;
  /** No Idle Detection here: the row says so and where this computer can say it instead; nothing is asked for it. */
  readonly unavailable: boolean;
}

/**
 * Asks this browser, on the person's press, for what `ask` names: each
 * browser's own prompt is requested in the press itself, before anything
 * is awaited, as a prompt needs the press's user activation and Chromium
 * queues the second behind the first. Starts Idle Detection once allowed.
 * Answers the permissions as they stand after.
 */
export function allowDesk(ask: DeskAsk): Promise<DeskPermissions> {
  const Detector = idleDetectorClass();
  const asked = [
    ask.idle && Detector ? Detector.requestPermission() : undefined,
    ask.notify ? Notification.requestPermission() : undefined,
  ];
  if (ask.idle) {
    store("local", DESK_KEY, "on");
  }
  return Promise.all(asked).then(async () => {
    await detectIdle();
    report(true);
    return deskPermissions();
  });
}
