/**
 * What the overlay's page code and its doc worker (doc-worker.ts) say to
 * each other: plain data, Yjs updates as bytes. The artifact's Yjs doc
 * lives in the worker, a realm of its own, so the page's realm holds no
 * Yjs of CawCo's: a previewed app's page has only its own Yjs, or none. The
 * page keeps a mirror of the doc's maps (mirror.ts) and the doc's socket
 * (so it opens through the page's `WebSocket`, as every socket of the
 * page's does); the worker runs Yjs, y-websocket's protocol over that
 * socket, and the copy kept on the device (y-indexeddb).
 */

/** One write to a mirrored map: a key set to a plain value, or deleted. */
export type WriteOp =
  | { deleted: true; key: string; map: string }
  | { key: string; map: string; value: unknown };

/**
 * Who made a transaction the worker reports: the page's own writes
 * (`page`), the worker's own sweep of deleted pins (`local`), the hub
 * through the socket (`remote`), the device's copy (`kept`), the hub's copy
 * embedded in the page (`seed`), or the page's replica (`replica`, a
 * canvas's host page, which runs a Yjs doc of its own).
 */
export type ChangeOrigin =
  "kept" | "local" | "page" | "remote" | "replica" | "seed";

/** The device's copy of a joined doc: its database's name, or none where the page keeps no IndexedDB. */
export type DeviceCopy = string | null;

export type ToWorker =
  /** The hub's copy embedded in the page's overlay tag. */
  | { type: "seed"; update: Uint8Array }
  /** Join the artifact's doc: its socket at `url`/`room`, its device copy. */
  | {
      device: DeviceCopy;
      params: Record<string, string>;
      room: string;
      type: "join";
      url: string;
    }
  /** A fresh doc in place of the one held, numbered `generation`. */
  | { generation: number; type: "replace" }
  /** A batch of the page's writes, in one transaction, numbered `seq`. */
  | { ops: WriteOp[]; seq: number; type: "write" }
  /** The socket closed and opened again now (the host's Try again). */
  | { type: "reconnect" }
  /** Whether the page is shown: the silence watch rests while it is hidden. */
  | { type: "shown"; visible: boolean }
  /** The page's replica wants the doc: its whole state now, then every change. */
  | { type: "replicate" }
  /** A change the page's replica made, to doc `generation`. */
  | { generation: number; type: "replica-update"; update: Uint8Array }
  /** What happened to socket `id` the worker asked the page to open. */
  | { id: number; type: "socket-open" }
  | { data: ArrayBuffer | string; id: number; type: "socket-message" }
  | {
      code: number;
      id: number;
      reason: string;
      type: "socket-close";
      wasClean: boolean;
    }
  | { id: number; type: "socket-error" };

export type FromWorker =
  /**
   * One transaction's changes to the mirrored maps of doc `generation`, its
   * values as they stand after it, and the page's last write batch the
   * worker had applied by then (`seq`).
   */
  | {
      deleted: Record<string, string[]>;
      generation: number;
      origin: ChangeOrigin;
      seq: number;
      set: Record<string, Record<string, unknown>>;
      type: "changes";
    }
  /** The socket began connecting. */
  | { type: "connecting" }
  /** The doc holds the hub's state. */
  | { type: "synced" }
  /** The link is lost, and why; `silent` when the hub's beat stopped. */
  | { error: string; silent: boolean; type: "lost" }
  /** What the device kept of the doc is merged in, or there is none to wait for. */
  | { type: "stored" }
  /**
   * The hub would not keep what the page wrote: the doc started again as
   * `generation`, the pins it held before then, and the hub's reason.
   */
  | {
      generation: number;
      pins: Record<string, unknown>;
      reason: string;
      type: "refused";
    }
  /** Doc `generation`'s whole state, or one change to it, for the page's replica. */
  | { generation: number; type: "replica"; update: Uint8Array }
  /** Open a socket on the page, numbered `id`. */
  | { id: number; protocols: string[]; type: "socket-new"; url: string }
  | {
      data: ArrayBuffer | string | Uint8Array<ArrayBuffer>;
      id: number;
      type: "socket-send";
    }
  | { code?: number; id: number; reason?: string; type: "socket-close" };
