/**
 * The preview server's way to the hub (wire.ts): the control link, kept open
 * and opened again after each drop on a capped backoff with jitter, and the
 * hub's routes for what only it answers, on its own port on loopback. While
 * the hub is away the server goes on serving what it holds: nothing a page
 * waits on goes over the link, and what it says meanwhile (a use, a pass's
 * use) is dropped, its next one said after.
 */
import type { BackoffPolicy } from "@cawco/core/backoff";
import {
  backoffSchedule,
  reopenSeries,
} from "@cawco/core/effect/backoff-schedule";
import { openWebSocket } from "@cawco/preview/proxy";
import { Effect, Option, Schema, type Scope } from "effect";
import { type HubClient, hubClient } from "../client";
import { HUB_PORT } from "../config";
import {
  CONTROL_PATH,
  type HubSays,
  isHubSays,
  previewServerToken,
  type ServerSays,
  TOKEN_HEADER,
} from "./wire";

/**
 * Opening the link again after a drop: from 250 ms, doubling to 10 s. Our
 * calls.
 */
const REOPENS: BackoffPolicy = {
  firstMs: 250,
  mostMs: 10_000,
  giveUp: {
    never:
      "the preview server learns of its origins from the hub on this link alone; it ends with the server",
  },
};

/** The hub's own origin on loopback, where the preview server reaches it. */
export const hubOrigin = (): string => `http://127.0.0.1:${HUB_PORT}`;

/** The preview server's way to the hub, as {@link openHubLink} opens it. */
export interface HubLink {
  /** The hub's routes as Eden's typed client (client.ts), each request carrying the server's token. */
  hub: HubClient;
  /** Runs `listener` each time the link opens. */
  onOpen: (listener: () => void) => void;
  /** Says `said` to the hub when the link is open; dropped while it isn't. Whether it was said. */
  say: (said: ServerSays) => boolean;
  token: string;
}

/** The link closed before it opened: a failure of its series of opens. */
class NotOpened extends Schema.TaggedError<NotOpened>()("NotOpened", {}) {}

/**
 * The link, held open for as long as the scope it is opened in, and closed
 * with it.
 */
export const openHubLink = Effect.fnUntraced(function* (
  heard: (said: HubSays) => void
): Effect.fn.Return<HubLink, never, Scope.Scope> {
  let socket: WebSocket | null = null;
  const token = previewServerToken();
  const listeners: (() => void)[] = [];

  /**
   * One socket to the hub, followed until it closes: done when one that
   * opened closes, {@link NotOpened} when it closed first. Interrupted, it
   * closes the socket.
   */
  const connection = Effect.callback<void, NotOpened>((resume) => {
    const ws = openWebSocket(`ws${hubOrigin().slice(4)}${CONTROL_PATH}`, {
      headers: { [TOKEN_HEADER]: token },
    });
    socket = ws;
    let opened = false;
    ws.addEventListener("open", () => {
      opened = true;
      console.log("[preview] the hub's link is open");
      for (const listener of listeners) {
        listener();
      }
    });
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") {
        return;
      }
      let said: unknown;
      try {
        said = JSON.parse(event.data);
      } catch {
        return;
      }
      if (isHubSays(said)) {
        heard(said);
      }
    });
    ws.addEventListener("close", () => {
      if (socket === ws) {
        socket = null;
      }
      resume(opened ? Effect.void : Effect.fail(new NotOpened()));
    });
    return Effect.sync(() => ws.close());
  });

  /**
   * Opens until one opens and later closes, each after its wait on
   * {@link REOPENS}. `afterDrop`: a link that was open just closed, which
   * counts as the series' first failure, so the open after it waits the
   * first wait (the house backoff's `succeeded()` at the open, then
   * `failed()` at the close).
   */
  const series = (afterDrop: boolean) =>
    reopenSeries(
      connection,
      backoffSchedule(REOPENS),
      afterDrop ? Option.some(new NotOpened()) : Option.none()
    );

  yield* Effect.forkScoped(
    series(false).pipe(
      Effect.andThen(Effect.forever(Effect.suspend(() => series(true))))
    )
  );

  return {
    say(said: ServerSays): boolean {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(said));
        return true;
      }
      return false;
    },
    onOpen(listener: () => void): void {
      listeners.push(listener);
    },
    hub: hubClient(hubOrigin(), fetch, {
      headers: { [TOKEN_HEADER]: token },
    }),
    token,
  };
});
