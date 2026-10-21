/**
 * How a live doc's socket to the hub is kept, for the pane's link
 * (dashboard preview/artifact-doc.ts) and the page's overlay (agent
 * preview-overlay/artifact.ts) alike. Both are y-websocket 3.1.0
 * `WebsocketProvider`s, and the library does the keeping:
 *
 * - **Keepalive** is its `resyncInterval`: a sync step 1 every
 *   {@link RESYNC_MS}, which the hub answers with its step 2 (hub
 *   artifacts/sync.ts), so a quiet link carries bytes both ways and a proxy
 *   that drops idle sockets never finds it idle. y-websocket 3.1.0 has no
 *   ping option, and a browser's WebSocket can't send a ping frame. The
 *   page's timers stall in a hidden tab (a wake-up a minute), so the hub
 *   beats every joined client on its own every {@link RESYNC_MS} too (hub
 *   artifacts/docs.ts), and y-websocket's 30 s no-message check, which runs
 *   on those same stalled timers, always finds a message within it.
 * - **Reconnect** is its own: a socket closed without a frame (1006: a
 *   proxy or tunnel dropped it) opens again on an exponential backoff from
 *   200 ms up to its `maxBackoffTime` (2.5 s), and resyncs on open. A close
 *   it won't reopen (4400–4499, the hub's deliberate refusals) it says with
 *   its `closed` event.
 *
 * The one gap is an attempt that is never answered: y-websocket watches
 * only an open socket (its 30 s no-message check), so an upgrade a proxy
 * holds unanswered would stand connecting for ever. {@link reopenStalled}
 * closes such an attempt and tries again through the library's own
 * disconnect and connect.
 */

/**
 * How often a doc's socket asks the hub for its state, and the hub beats it,
 * ms: inside y-websocket's 30 s no-message window, and under any proxy's
 * idle timeout (Cloudflare closes a WebSocket "when no data is transmitted
 * in either direction for a period of time":
 * developers.cloudflare.com/network/websockets). Our call.
 */
export const RESYNC_MS = 10_000;

/** How long one attempt at the socket may stand connecting before it is closed and tried again, ms. Our call. */
export const OPEN_WITHIN_MS = 10_000;

/** What {@link reopenStalled} reads of a y-websocket `WebsocketProvider`. */
export interface LinkProvider {
  connect: () => void;
  disconnect: () => void;
  off: (name: "status", listener: (event: { status: string }) => void) => void;
  on: (name: "status", listener: (event: { status: string }) => void) => void;
  ws: unknown;
  wsconnecting: boolean;
}

export interface StallWatch {
  /** Whether the close being heard now is the watch's own, of a stalled attempt. */
  reopening: () => boolean;
  stop: () => void;
}

/**
 * Closes an attempt at `provider`'s socket that hasn't opened within
 * {@link OPEN_WITHIN_MS} and starts another; `stalled` hears how many
 * attempts in a row never opened, after the next has begun.
 */
export function reopenStalled(
  provider: LinkProvider,
  stalled: (stalls: number) => void
): StallWatch {
  let stalls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let reopening = false;
  const watch = () => {
    clearTimeout(timer);
    const attempt = provider.ws;
    timer = setTimeout(() => {
      if (provider.ws !== attempt || !provider.wsconnecting) {
        return;
      }
      stalls += 1;
      reopening = true;
      provider.disconnect();
      reopening = false;
      provider.connect();
      stalled(stalls);
    }, OPEN_WITHIN_MS);
  };
  const status = ({ status: now }: { status: string }) => {
    if (now === "connecting") {
      watch();
      return;
    }
    clearTimeout(timer);
    if (now === "connected") {
      stalls = 0;
    }
  };
  provider.on("status", status);
  // The first attempt began in the constructor, before anything heard it.
  if (provider.wsconnecting) {
    watch();
  }
  return {
    reopening: () => reopening,
    stop: () => {
      clearTimeout(timer);
      provider.off("status", status);
    },
  };
}
