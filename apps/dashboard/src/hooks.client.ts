import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";
import { version } from "$app/env";

const WINDOW_MS = 60_000;
const FIRST_FRAME = /^\s*at\s|@/;
/**
 * The conversation on screen, as the URL names it: the workspace writes the
 * focused pane's session there (`/session/<id>`). Read off the URL rather
 * than the workspace store, so this hook, which runs on every route, loads
 * no store: an artifact's own tab loads nothing of the app.
 */
const SESSION_PATH = /^\/session\/([^/]+)/;
const seen = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
let total = 0;

/** Reporting must never become another uncaught error, including failed delivery. */
function report(
  error: unknown,
  path = location.pathname,
  stackHint = ""
): void {
  try {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (total >= 200 || windowCount >= 20) {
      return;
    }
    const value = error as { message?: unknown; stack?: unknown } | null;
    const message = (
      typeof value?.message === "string" ? value.message : String(error)
    ).slice(0, 1000);
    const stack = (
      typeof value?.stack === "string" ? value.stack : stackHint
    ).slice(0, 6000);
    const firstFrame =
      stack.split("\n").find((line) => FIRST_FRAME.test(line)) ?? "";
    const key = JSON.stringify([message, firstFrame]);
    for (const [held, when] of seen) {
      if (now - when >= WINDOW_MS) {
        seen.delete(held);
      }
    }
    if (seen.has(key)) {
      return;
    }
    seen.set(key, now);
    windowCount += 1;
    total += 1;
    const body = JSON.stringify({
      message,
      stack,
      path: path.slice(0, 1000),
      sessionId:
        SESSION_PATH.exec(location.pathname)?.[1]?.slice(0, 256) ?? null,
      version: version.slice(0, 128),
      userAgent: navigator.userAgent.slice(0, 512),
    });
    // keepalive also delivers while navigating away; JSON uses the existing API proxy.
    fetch("/api/dashboard-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A malformed thrown value or unavailable transport must not alter the app.
  }
}

export const init: ClientInit = () => {
  window.addEventListener("error", (event) => {
    report(
      event.error ?? event.message,
      location.pathname,
      event.filename
        ? `at ${event.filename}:${event.lineno}:${event.colno}`
        : ""
    );
  });
  window.addEventListener("unhandledrejection", (event) =>
    report(event.reason)
  );
};

/**
 * Every error SvelteKit catches: a load's, and (SvelteKit 3) every one a
 * `<svelte:boundary>` holds (RegionBoundary), which it hands here before the
 * boundary sees it (kit client.js, `transformError`). Logged whole, as
 * SvelteKit does not in a build, and sent to the hub.
 */
export const handleError: HandleClientError = ({ error, event }) => {
  console.error("[cawco]", error);
  report(error, event.url.pathname);
};
