/**
 * The hub's error log, from a page: every error the page reports goes to the
 * hub, which writes it to its journal (hub dashboard-errors.ts), in the body
 * its route takes (core `hubRequest`). One reporter
 * per page, started once ({@link reportErrorsTo}): the dashboard's from its
 * client hook (hooks.client.ts), to `/api/dashboard-errors` on its own
 * origin; a decision page's from its host (decisions/host/host.ts), to core
 * `PREVIEW_ERRORS_PATH` on its preview origin, the hub's own path there.
 * Anything either catches reports through {@link reportError} (the
 * dashboard's `handleError`, the OpenUI renderer's throws). The dashboard's
 * reporter also catches its window's uncaught errors and rejections; a
 * decision page's are the preview overlay's, which reports every page's to
 * the same path with its artifact and revision (preview overlay/
 * faults.ts), so `artifact_read` says them.
 */

import { hubRequest } from "@cawco/core/hub-request";
import { PREVIEW_ERRORS_PATH } from "@cawco/core/preview/routes";

const WINDOW_MS = 60_000;
const FIRST_FRAME = /^\s*at\s|@/u;
/**
 * The conversation on screen, as the URL names it: the workspace writes the
 * focused pane's session there (`/session/<id>`). Read off the URL rather
 * than the workspace store, so reporting loads no store: an artifact's own
 * tab loads nothing of the app.
 */
const SESSION_PATH = /^\/session\/([^/]+)/u;

/**
 * Where a page's errors go: the dashboard's, to the hub's route through its
 * own origin's `/api`; a decision page's, to core `PREVIEW_ERRORS_PATH` on
 * its preview origin, which hands the same body to that route.
 */
type ErrorSink = "dashboard" | "preview";

/** Where this page's errors go and the build it runs; null until {@link reportErrorsTo}. */
let sink: { to: ErrorSink; version: string } | null = null;
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

/**
 * `error` in the hub's log, once a minute at most for one message and first
 * frame, and 20 a minute and 200 a page at most. `about` goes before its
 * message: where it was thrown when the page knows more than its stack
 * ("Decision bar in decision page …"). Nothing until the page's reporter
 * started; reporting never becomes another uncaught error, a failed delivery
 * included.
 */
export function reportError(
  error: unknown,
  {
    path = location.pathname,
    stackHint = "",
    about = "",
  }: { about?: string; path?: string; stackHint?: string } = {}
): void {
  if (!sink) {
    return;
  }
  try {
    const now = Date.now();
    if (now - windowStart >= WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    if (total >= 200 || windowCount >= 20) {
      return;
    }
    const words = thrownWords(error);
    const message = (about ? `${about}: ${words}` : words).slice(0, 1000);
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
    const request = hubRequest("POST /api/dashboard-errors", {
      body: {
        message,
        stack,
        path: path.slice(0, 1000),
        sessionId:
          SESSION_PATH.exec(location.pathname)?.[1]?.slice(0, 256) ?? null,
        version: sink.version.slice(0, 128),
        userAgent: navigator.userAgent.slice(0, 512),
      },
    });
    // keepalive also delivers while navigating away.
    fetch(sink.to === "preview" ? PREVIEW_ERRORS_PATH : request.path, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // A malformed thrown value or unavailable transport must not alter the app.
  }
}

/**
 * Starts the page's reporter: its errors go to `to` (an {@link ErrorSink}) on the page's own
 * origin, as build `version`, and on the dashboard the window's uncaught
 * errors and rejections with them (a preview origin's are its overlay's).
 * The window is listened to once; a second call only moves where the
 * errors go.
 */
export function reportErrorsTo(to: ErrorSink, version: string): void {
  const listening = sink !== null;
  sink = { to, version };
  if (listening || to === "preview") {
    return;
  }
  addEventListener("error", (event) => {
    reportError(event.error ?? event.message, {
      stackHint: event.filename
        ? `at ${event.filename}:${event.lineno}:${event.colno}`
        : "",
    });
  });
  addEventListener("unhandledrejection", (event) => reportError(event.reason));
}
