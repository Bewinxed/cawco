/**
 * This tab's presence (`POST /api/presence`): two facts the hub rolls up
 * into whether the person is here (hub notifications.ts `rollup`).
 *
 * - **The chat in front and read** (`active`, `sessionId`): a session in
 *   front while the page is visible and focused. The hub sends no
 *   notification about what landed in a session while some client was
 *   active on it. It goes inactive the moment the tab blurs, hides or
 *   unloads; a blur no longer means the person left.
 * - **The machine** (`machine`, `idleMs`): Chromium's Idle Detection, once
 *   the person allowed it for this browser (Needs you's onboarding row, the
 *   presence menu), says whether this computer is in use, idle or locked.
 *   Without it (Safari, Firefox, not allowed) the tab says only how long
 *   since the last key, pointer or scroll on this page.
 *
 * Beside them, `alerts`: this tab may show desktop notifications, so the
 * hub can show what needs the person here instead of buzzing their phone
 * (person.svelte.ts shows them). The tab beats every {@link PRESENCE_BEAT_MS}
 * while it is open, and at once on a change.
 */
import {
  type MachineState,
  PRESENCE_BEAT_MS,
  type PresenceBeat,
} from "@cawco/core";
import { newId } from "#lib/cawco/id.js";
import { store, stored } from "#lib/cawco/storage.js";

/** Per tab: sessionStorage outlives a reload and is the tab's own. */
const CLIENT_KEY = "cawco-presence-client";
/** Idle after this long without input: Idle Detection's least threshold, the agents' too. */
const IDLE_AFTER_MS = 60_000;

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
/** The last key, pointer or scroll on this page, epoch ms. */
let lastInput = Date.now();
/** Idle Detection while it runs: its reading, and since when it said idle. */
let detector: IdleDetectorLike | undefined;
let idleSince: number | undefined;

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

/** How long since the last input this tab can know of, ms. */
const idleNow = (now: number): number => {
  if (detector) {
    return detector.userState === "idle" && idleSince !== undefined
      ? now - idleSince + IDLE_AFTER_MS
      : 0;
  }
  return Math.max(0, now - lastInput);
};

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
  const alerts = notificationsAllowed();
  const state = `${front}|${active}|${machine}|${alerts}`;
  if (beat || state !== told) {
    told = state;
    post(
      {
        clientId: presenceClientId(),
        client: "web",
        sessionId: front,
        active,
        alerts,
        idleMs: idleNow(now),
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

/** An input on the page: counted, and said at once when it ends a quiet stretch. */
const touched = (): void => {
  const quiet = Date.now() - lastInput > IDLE_AFTER_MS;
  lastInput = Date.now();
  if (quiet && !detector) {
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
  for (const kind of ["pointerdown", "keydown", "wheel", "touchstart"]) {
    window.addEventListener(kind, touched, { capture: true, passive: true });
  }
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

/** What this browser lets the presence model use, as its permissions stand now. */
export interface DeskPermissions {
  /** Idle Detection: absent (Safari, Firefox, not a secure context), or its permission. */
  readonly idle: PermissionState | "unsupported";
  /** Desktop notifications: absent, or their permission. */
  readonly notify: NotificationPermission | "unsupported";
}

/** This browser's permissions for the presence model, read without asking. */
export async function deskPermissions(): Promise<DeskPermissions> {
  const notify =
    typeof Notification === "undefined" || !window.isSecureContext
      ? "unsupported"
      : Notification.permission;
  if (!idleDetectorClass()) {
    return { idle: "unsupported", notify };
  }
  try {
    const status = await navigator.permissions.query({
      name: "idle-detection" as PermissionName,
    });
    return { idle: status.state, notify };
  } catch {
    return { idle: "prompt", notify };
  }
}

/** Starts Idle Detection when it is allowed and not yet running. */
async function detectIdle(): Promise<void> {
  const Detector = idleDetectorClass();
  if (!Detector || detector) {
    return;
  }
  const { idle } = await deskPermissions();
  if (idle !== "granted") {
    return;
  }
  const running = new Detector();
  running.addEventListener("change", () => {
    if (running.userState === "idle") {
      idleSince ??= Date.now();
    } else {
      idleSince = undefined;
      lastInput = Date.now();
    }
    report();
  });
  await running.start({
    threshold: IDLE_AFTER_MS,
    signal: new AbortController().signal,
  });
  detector = running;
  report();
}

/**
 * Asks this browser, on the person's press, for what the presence model
 * uses: Idle Detection where it has one, then desktop notifications; each
 * asked only while it is still to answer. Starts Idle Detection once
 * allowed. Answers the permissions as they stand after.
 */
export async function allowDesk(): Promise<DeskPermissions> {
  const Detector = idleDetectorClass();
  const before = await deskPermissions();
  if (Detector && before.idle === "prompt") {
    await Detector.requestPermission();
  }
  if (before.notify === "default") {
    await Notification.requestPermission();
  }
  await detectIdle();
  report(true);
  return deskPermissions();
}
