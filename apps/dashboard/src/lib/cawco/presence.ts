/**
 * This tab's presence (`POST /api/presence`): which session it has in front
 * and whether the owner is reading it. The hub sends no notification about
 * what landed in a session while some client was active on it (hub
 * notifications.ts), so a tab counts only while its page is visible and
 * focused and a session is in front; it goes inactive the moment the tab
 * blurs, hides or unloads. The web shows no notifications itself.
 */
import { PRESENCE_BEAT_MS, type PresenceBeat } from "@cawco/core";
import { newId } from "#lib/cawco/id.js";

/** Per tab: sessionStorage outlives a reload and is the tab's own. */
const CLIENT_KEY = "cawco-presence-client";

let front: string | null = null;
let listening = false;
let beating: ReturnType<typeof setInterval> | undefined;
/** The last state the hub was told, so only a change (or a beat) posts. */
let told: string | undefined;

const clientId = (): string => {
  const kept = sessionStorage.getItem(CLIENT_KEY);
  if (kept) {
    return kept;
  }
  const minted = newId();
  sessionStorage.setItem(CLIENT_KEY, minted);
  return minted;
};

const reading = (): boolean =>
  front !== null &&
  document.visibilityState === "visible" &&
  document.hasFocus();

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
  const active = !leaving && reading();
  const state = `${front}|${active}`;
  if (beat || state !== told) {
    told = state;
    post(
      {
        clientId: clientId(),
        client: "web",
        sessionId: front,
        active,
        // Beats can land out of order; the hub keeps the newest said.
        saidAt: Date.now(),
      },
      leaving
    );
  }
  if (active && beating === undefined) {
    beating = setInterval(() => report(true), PRESENCE_BEAT_MS);
  } else if (!active && beating !== undefined) {
    clearInterval(beating);
    beating = undefined;
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
};

/** The session the owner has in front in this tab, or null when none is. */
export function presenceFront(sessionId: string | null): void {
  listen();
  front = sessionId;
  report();
}
