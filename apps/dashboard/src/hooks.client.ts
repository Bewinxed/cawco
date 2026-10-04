import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";
import { workspace } from "#lib/cawco/workspace/workspace.svelte.js";
import { version } from "$app/env";

const WINDOW_MS = 60_000;
const FIRST_FRAME = /^\s*at\s|@/;
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
      sessionId: workspace.activeSessionId?.slice(0, 256) ?? null,
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

export const handleError: HandleClientError = ({ error, event }) => {
  report(error, event.url.pathname);
};
