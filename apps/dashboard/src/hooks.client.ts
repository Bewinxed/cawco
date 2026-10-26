import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";
// Before anything on the page makes a ResizeObserver: the window's own is
// the shared observer's from here on (frame-observer `ForeignResizeObserver`).
import "#lib/cawco/frame-observer.js";
import { holdReadsWhileLeaving } from "#lib/cawco/leaving.js";
import { claimRegionDrop } from "#lib/cawco/region-held.js";
import { version } from "$app/env";

const WINDOW_MS = 60_000;
const FIRST_FRAME = /^\s*at\s|@/u;
/**
 * The conversation on screen, as the URL names it: the workspace writes the
 * focused pane's session there (`/session/<id>`). Read off the URL rather
 * than the workspace store, so this hook, which runs on every route, loads
 * no store: an artifact's own tab loads nothing of the app.
 */
const SESSION_PATH = /^\/session\/([^/]+)/u;
const seen = new Map<string, number>();
let windowStart = 0;
let windowCount = 0;
let total = 0;

/** An `Error` of any realm (a frame's own, a DOMException): it says itself in its message. */
const isError = (value: unknown): value is Error =>
  value instanceof Error ||
  Object.prototype.toString.call(value) === "[object Error]";

/** A value's JSON, cycles cut and bigints written out; undefined where it has none. */
function jsonOf(value: object): string | undefined {
  const held = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, field: unknown) => {
      if (typeof field === "bigint") {
        return `${field}n`;
      }
      if (typeof field === "object" && field !== null) {
        if (held.has(field)) {
          return "[cycle]";
        }
        held.add(field);
      }
      return field;
    });
  } catch {
    // A getter that throws: no JSON, so its own fields are read instead.
  }
}

/**
 * What a thrown value says in the hub's log. An `Error` by its message;
 * anything else carries no message or stack of its own (a hub problem body,
 * a rejected await's object, an event), so it is written as its JSON, or its
 * own fields where its JSON is empty, after its class's name when it has one.
 * `String()` of such a value is "[object Object]", all nightly 4343's tabs
 * crash told the hub.
 */
function thrownWords(error: unknown): string {
  if (isError(error)) {
    return error.message || String(error);
  }
  if (typeof error !== "object" || error === null) {
    return String(error);
  }
  const named = (Object.getPrototypeOf(error) as object | null)?.constructor
    ?.name;
  const prefix = named && named !== "Object" ? `${named} ` : "";
  let words = jsonOf(error);
  if (words === undefined || words === "{}") {
    const fields = Object.getOwnPropertyNames(error).map((key) => {
      let field: unknown;
      try {
        field = (error as Record<string, unknown>)[key];
      } catch {
        field = "[unreadable]";
      }
      return `${key}: ${String(field)}`;
    });
    words = fields.length > 0 ? `{ ${fields.join(", ")} }` : (words ?? "{}");
  }
  return `${prefix}${words}`;
}

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
    const message = thrownWords(error).slice(0, 1000);
    const stack = (
      isError(error) && typeof error.stack === "string"
        ? error.stack
        : stackHint
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
  holdReadsWhileLeaving();
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
 * SvelteKit does not in a build, and sent to the hub. A boundary's is
 * answered `region`, so `page.error` never reads as the route failing
 * (region-held.ts).
 */
export const handleError: HandleClientError = ({ error, event }) => {
  console.error("[cawco]", error);
  report(error, event.url.pathname);
  return claimRegionDrop() ? { region: true } : undefined;
};
