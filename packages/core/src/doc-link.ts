/// <reference lib="dom" />
/**
 * How a live doc's socket to the hub is kept, for the pane's link
 * (dashboard preview/artifact-doc.ts) and the page's overlay (agent
 * preview overlay/artifact.ts) alike. Both are y-websocket 3.1.0
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
 * Two gaps are ours to close, each through the library's own disconnect and
 * connect. An attempt that is never answered: y-websocket watches only an
 * open socket, so an upgrade a proxy holds unanswered would stand
 * connecting for ever; {@link reopenStalled} closes it and tries again. And
 * an open socket gone silent without a close: y-websocket's 30 s
 * no-message check is a constant in 3.1.0 (its `socketTimeout` option is
 * only in the unreleased 4.0 line, yjs/y-websocket#203), so
 * {@link watchSilence} reads the hub's beat itself and says the link lost
 * after {@link SILENT_MS} of nothing.
 *
 * Each also keeps its doc on the device (y-indexeddb), under
 * {@link deviceDocName}, so what the person marks while the link is down
 * outlives a reload; {@link tendDeviceDocs} lets go of the copies of
 * artifacts no one has opened on that device for {@link DEVICE_DOC_MS}, and
 * a doc the hub says is gone ({@link ARTIFACT_GONE}) is let go at once.
 */

import { readWhileHeard } from "./bounded";
import { DAY_MS } from "./time";

/** The hub's close code for an artifact removed while a doc is joined (hub artifacts/sync.ts). */
export const ARTIFACT_GONE = 4410;

/** Where artifact `id`'s doc is kept on a device: its IndexedDB database's name. */
export const deviceDocName = (id: string): string => `cawco-artifact:${id}`;

/** How long a device keeps the doc of an artifact no one opened there, ms: 30 days. Our call. */
const DEVICE_DOC_MS = 30 * DAY_MS;

/** Where a device notes when it last opened artifact `id`'s doc (localStorage, beside its database). */
const usedKey = (id: string) => `cawco-artifact-used:${id}`;

/**
 * Artifact `id`'s doc noted as opened now on this device, and every other
 * artifact's doc it keeps that no one opened within {@link DEVICE_DOC_MS}
 * deleted. Does nothing where the browser lists no databases or keeps no
 * storage.
 */
export function tendDeviceDocs(id: string): void {
  try {
    localStorage.setItem(usedKey(id), String(Date.now()));
  } catch {
    return;
  }
  const listed = globalThis.indexedDB?.databases?.();
  listed
    ?.then((databases) => {
      const prefix = deviceDocName("");
      for (const { name } of databases) {
        const other = name?.startsWith(prefix)
          ? name.slice(prefix.length)
          : null;
        if (!other || other === id) {
          continue;
        }
        const used = Number(localStorage.getItem(usedKey(other)) ?? 0);
        if (Date.now() - used > DEVICE_DOC_MS) {
          indexedDB.deleteDatabase(deviceDocName(other));
          localStorage.removeItem(usedKey(other));
        }
      }
    })
    .catch(() => undefined);
}

/**
 * How often a doc's socket asks the hub for its state, and the hub beats it,
 * ms: inside y-websocket's 30 s no-message window, and under any proxy's
 * idle timeout (Cloudflare closes a WebSocket "when no data is transmitted
 * in either direction for a period of time":
 * developers.cloudflare.com/network/websockets). Our call.
 */
export const RESYNC_MS = 10_000;

/** How long one attempt at the socket may stand connecting before it is closed and tried again, ms. Our call. */
const OPEN_WITHIN_MS = 10_000;

/**
 * How long an open socket may hear nothing before its link counts as lost,
 * ms: two of the hub's missed beats ({@link RESYNC_MS}) and a margin, under
 * y-websocket 3.1.0's own 30 s no-message check. Our call.
 */
const SILENT_MS = 25_000;

/** What {@link reopenStalled} and {@link watchSilence} read of a y-websocket `WebsocketProvider`. */
export interface LinkProvider {
  connect: () => void;
  disconnect: () => void;
  off: (name: "status", listener: (event: { status: string }) => void) => void;
  on: (name: "status", listener: (event: { status: string }) => void) => void;
  /** Its socket, a new one each attempt (y-websocket's own `ws`): a `WebSocket` where a page runs it. */
  ws: unknown;
  wsconnected: boolean;
  wsconnecting: boolean;
}

/**
 * Whether the page is shown, as {@link watchSilence} reads it: the page's
 * own document, or what a worker holding the socket's doc is told of it
 * (preview overlay/doc-worker.ts). Core is typed without the DOM's.
 */
export interface ShownDocument {
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
  visibilityState: string;
}

export interface StallWatch {
  /** Whether the close being heard now is the watch's own, of a stalled attempt. */
  reopening: () => boolean;
  stop: () => void;
}

/** A socket {@link watchSilence} hears each message of: a `WebSocket`'s own listeners. */
interface Heard {
  addEventListener: (type: "message", listener: () => void) => void;
  removeEventListener: (type: "message", listener: () => void) => void;
}
const isHeard = (ws: unknown): ws is Heard =>
  typeof ws === "object" &&
  ws !== null &&
  "addEventListener" in ws &&
  typeof ws.addEventListener === "function" &&
  "removeEventListener" in ws &&
  typeof ws.removeEventListener === "function";

/**
 * Says `provider`'s open socket lost once it has heard nothing for
 * {@link SILENT_MS}, and closes it and opens another through the library's
 * own disconnect and connect, so a link that dies without a close (a
 * dropped network, a sleeping laptop, a proxy that stops forwarding) is
 * found from the hub's beat, not after y-websocket's 30 s check. `silent`
 * runs before the close, whose `connection-close` the caller tells apart
 * by `reopening()`.
 *
 * Each open socket is one spell of {@link readWhileHeard}, told `heard()`
 * at each message it carries: its clock is the page's awake time, with its
 * catch-up for a page that was held, so nothing reads the time on a
 * cadence. A hidden tab's timers run once a minute (Chromium's intensive
 * wake-up throttling), so a spell that runs out while the tab is hidden
 * says nothing and begins again, and the tab's showing counts as heard:
 * there y-websocket's own check stands, as before. `page` says whether the
 * page is shown.
 */
export function watchSilence(
  provider: LinkProvider,
  silent: () => void,
  page: ShownDocument
): StallWatch {
  let reopening = false;
  const stopped = new AbortController();
  /** The open socket's spell, told of each message and of the tab's showing. */
  let hear: (() => void) | undefined;
  /** The open socket's spell ends at the socket's close. */
  let closed: (() => void) | undefined;
  const shown = () => {
    if (page.visibilityState === "visible") {
      hear?.();
    }
  };
  const status = (event: { status: string }) => {
    if (event.status === "connected") {
      // A spell already under way is ended first: it heard the old socket.
      closed?.();
      spell();
    } else {
      closed?.();
    }
  };
  /** One open socket's spell: from its open until it goes silent or closes. */
  const spell = () => {
    const socket = isHeard(provider.ws) ? provider.ws : undefined;
    let heardHere: (() => void) | undefined;
    const onMessage = () => heardHere?.();
    socket?.addEventListener("message", onMessage);
    /** This spell is over: its socket and the tab's showing no longer tell it. */
    const over = () => {
      socket?.removeEventListener("message", onMessage);
      if (hear === heardHere) {
        hear = undefined;
      }
    };
    readWhileHeard(
      SILENT_MS,
      (signal, heard) =>
        new Promise<void>((done) => {
          heardHere = heard;
          hear = heard;
          const end = () => {
            if (closed === end) {
              closed = undefined;
            }
            done();
          };
          closed = end;
          signal.addEventListener("abort", end, { once: true });
        }),
      { signal: stopped.signal }
    ).then(
      (spelled) => {
        over();
        if (
          spelled.kind === "answered" ||
          stopped.signal.aborted ||
          !provider.wsconnected
        ) {
          return;
        }
        if (page.visibilityState === "hidden") {
          spell();
          return;
        }
        silent();
        reopening = true;
        provider.disconnect();
        reopening = false;
        provider.connect();
      },
      // Its stop's own abort ends a spell, and is no failure.
      (error: unknown) => {
        over();
        if (!stopped.signal.aborted) {
          console.warn(
            `[doc-link] a socket's silence watch failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    );
  };
  page.addEventListener("visibilitychange", shown);
  provider.on("status", status);
  if (provider.wsconnected) {
    spell();
  }
  return {
    reopening: () => reopening,
    stop: () => {
      stopped.abort();
      provider.off("status", status);
      page.removeEventListener("visibilitychange", shown);
    },
  };
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
