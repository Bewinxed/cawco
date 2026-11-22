/**
 * The preview server's way to the hub (wire.ts): the control link, kept open
 * and opened again after each drop on a capped backoff with jitter, and the
 * hub's routes for what only it answers, on its own port on loopback. While
 * the hub is away the server goes on serving what it holds: nothing a page
 * waits on goes over the link, and what it says meanwhile (a use, a pass's
 * use) is dropped, its next one said after.
 */
import { Backoff, type BackoffPolicy } from "@cawco/core/backoff";
import { openWebSocket } from "@cawco/preview/proxy";
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
  close: () => void;
  /** The hub's routes as Eden's typed client (client.ts), each request carrying the server's token. */
  hub: HubClient;
  /** Runs `listener` each time the link opens. */
  onOpen: (listener: () => void) => void;
  /** Says `said` to the hub when the link is open; dropped while it isn't. */
  say: (said: ServerSays) => void;
  token: string;
}

export const openHubLink = (heard: (said: HubSays) => void): HubLink => {
  let socket: WebSocket | null = null;
  const tries = new Backoff(REOPENS);
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const token = previewServerToken();
  const listeners: (() => void)[] = [];

  const open = (): void => {
    const ws = openWebSocket(`ws${hubOrigin().slice(4)}${CONTROL_PATH}`, {
      headers: { [TOKEN_HEADER]: token },
    });
    socket = ws;
    ws.addEventListener("open", () => {
      tries.succeeded();
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
      if (ended) {
        return;
      }
      const step = tries.failed();
      timer = setTimeout(open, step.kind === "wait" ? step.ms : REOPENS.mostMs);
    });
  };
  open();

  return {
    say(said: ServerSays): void {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(said));
      }
    },
    onOpen(listener: () => void): void {
      listeners.push(listener);
    },
    hub: hubClient(hubOrigin(), fetch, { headers: { [TOKEN_HEADER]: token } }),
    token,
    close(): void {
      ended = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
};
