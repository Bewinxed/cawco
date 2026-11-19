/**
 * The preview server's way to the hub (wire.ts): the control link, kept open
 * and opened again after each drop on a capped backoff with jitter, and the
 * hub's routes for what only it answers, on its own port on loopback. While
 * the hub is away the server goes on serving what it holds: nothing a page
 * waits on goes over the link, and what it says meanwhile (a use, a pass's
 * use) is dropped, its next one said after.
 */
import { openWebSocket } from "@cawco/preview/proxy";
import { HUB_PORT } from "../config";
import {
  CONTROL_PATH,
  type HubSays,
  isHubSays,
  previewServerToken,
  type ServerSays,
  TOKEN_HEADER,
} from "./wire";

/** The waits before opening the link again after a drop, ms: doubling from the first to the last, each with up to a fifth again of jitter. Our calls. */
const FIRST_MS = 250;
const MOST_MS = 10_000;

/** The hub's own origin on loopback, where the preview server reaches it. */
export const hubOrigin = (): string => `http://127.0.0.1:${HUB_PORT}`;

export const openHubLink = (heard: (said: HubSays) => void) => {
  let socket: WebSocket | null = null;
  let tries = 0;
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
      tries = 0;
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
      const wait = Math.min(FIRST_MS * 2 ** tries, MOST_MS);
      tries += 1;
      timer = setTimeout(open, wait * (1 + Math.random() / 5));
    });
  };
  open();

  return {
    /** Says `said` to the hub when the link is open; dropped while it isn't. */
    say(said: ServerSays): void {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(said));
      }
    },
    /** Runs `listener` each time the link opens. */
    onOpen(listener: () => void): void {
      listeners.push(listener);
    },
    /** A request to the hub's route `path`, carrying the server's token. */
    ask(path: string, init: RequestInit = {}): Promise<Response> {
      const headers = new Headers(init.headers);
      headers.set(TOKEN_HEADER, token);
      return fetch(`${hubOrigin()}${path}`, { ...init, headers });
    },
    token,
    close(): void {
      ended = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
};

export type HubLink = ReturnType<typeof openHubLink>;
