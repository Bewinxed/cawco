/**
 * Which port each preview origin keeps. An origin (a session's, a project's
 * or a machine artifact's, preview-origin.ts) takes a port of the range when
 * something asks for its address: the port it keeps while that is still a
 * preview port no other program holds; else the lowest of the range that is
 * not the fleet's own, not another origin's and not held by another
 * program; else, the range being full, the lowest once an origin that no
 * screen shows let it go, one at a time (`open`). The rows are the
 * database's (db/previews.ts); the listeners on them are the preview
 * server's (preview-server/listeners.ts), which binds what the rows say and
 * says back each port it couldn't (`refused`).
 */
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import {
  type PortHolders,
  previewPortWords,
} from "@cawco/core/words/preview-ports";
import { problem } from "elysia";
import { FLEET_PORTS, PREVIEW_PORTS, PREVIEW_PORTS_TEXT } from "./config";
import type { PreviewsDb } from "./db/previews";
import { SESSION_PASS_MS } from "./preview-access";
import { HOP } from "./preview-origin";

/** How long a port the preview server found another program holding is passed over: a session's pass ticket's life, as long as a vacant port is held. Our call. */
const HELD_ELSEWHERE_MS = SESSION_PASS_MS;

/** What the ports need of the hub around them. */
export interface PreviewPortsEnv {
  db: Pick<
    PreviewsDb,
    "dropPort" | "keepPort" | "ownerHeld" | "ports" | "portsByUse"
  >;
  /** Whether a screen shows origin `key` now: the one an origin gives its port up last. */
  inUse: (key: string) => boolean;
  /** Origins that let their port go to another: what each shows is told again, without its old address. */
  letGo: (keys: string[]) => void;
  /** False for a hub built only to be read (server.ts `serves`): every ask for an origin's port is refused. */
  listens: boolean;
  /** The fleet's mode now: host mode's listener holds the range's first port. */
  mode: () => "port" | "host";
  /** The rows moved: the preview server stands its listeners as they say now. */
  moved: () => void;
}

export function createPreviewPorts({
  db,
  inUse,
  letGo,
  listens,
  mode,
  moved,
}: PreviewPortsEnv) {
  /** Ports the preview server found another program holding, until when each is passed over. */
  const elsewhere = new Map<number, number>();
  /** Why the preview server couldn't bind on the hub's bind address at all (its last word); null while it binds. */
  let unbindable: string | null = null;

  /** Whether another program held `port` when the preview server last tried it. */
  const heldElsewhere = (port: number): boolean => {
    const until = elsewhere.get(port);
    if (until === undefined) {
      return false;
    }
    if (until > Date.now()) {
      return true;
    }
    elsewhere.delete(port);
    return false;
  };

  /** Why no origin may have `port`: one of the fleet's own, or outside the range; null when one may. */
  const barred = (port: number): string | null => {
    const fleet = FLEET_PORTS.get(port);
    if (fleet) {
      return `it is ${fleet} port`;
    }
    // A machine of the fleet may run the stream relay on these (3478, 3479,
    // 5349, 5350): no preview ever takes one, wherever CAWCO_PREVIEW_PORTS
    // puts the range.
    if (isStreamRelayPort(port)) {
      return "it is the stream relay's port";
    }
    if (mode() === "host" && port === PREVIEW_PORTS.first) {
      return "it is host mode's listener port";
    }
    return port < PREVIEW_PORTS.first || port > PREVIEW_PORTS.last
      ? `it is outside the preview ports ${PREVIEW_PORTS_TEXT}`
      : null;
  };

  /**
   * One port taken back for origin `asking`, the range being full: from
   * the origin least recently used (`used_at`, db previews.ts
   * `portsByUse`) of those no screen shows ({@link inUse}); one whose owner
   * went first. Its row is dropped, and what shows it is told again without
   * that address: the next ask for it takes a free port, and says that
   * address (`letGo`). The key that let its port go; undefined when every
   * port is in use.
   */
  const reclaimOne = (asking: string): string | undefined => {
    const idle = db
      .portsByUse()
      .map((row) => row.key)
      .filter((one) => one !== asking && !inUse(one));
    const taken = idle.find((one) => !db.ownerHeld(one)) ?? idle[0];
    if (taken === undefined) {
      return;
    }
    db.dropPort(taken);
    letGo([taken]);
    return taken;
  };

  /** The lowest port of the range no origin keeps, not barred, not held by another program; undefined when none is. */
  const firstFree = (): number | undefined => {
    const taken = new Set(db.ports().map((row) => row.port));
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (!(taken.has(port) || barred(port) || heldElsewhere(port))) {
        return port;
      }
    }
  };

  /** What keeps each port of the range, the barred left out: a screen that shows its origin ({@link inUse}), else another program on the hub's machine. */
  const portHolders = (): PortHolders => {
    const keys = new Map(db.ports().map((row) => [row.port, row.key]));
    const count = { others: 0, screens: 0 };
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (barred(port)) {
        continue;
      }
      const key = keys.get(port);
      if (key !== undefined && inUse(key)) {
        count.screens += 1;
      } else {
        count.others += 1;
      }
    }
    return count;
  };

  /** The port origin `key` keeps while it is still one it may have; undefined, its move said, when it has to move or keeps none. */
  const keptStays = (key: string): number | undefined => {
    const kept = db.ports().find((row) => row.key === key)?.port;
    if (kept === undefined) {
      return;
    }
    const why =
      barred(kept) ?? (heldElsewhere(kept) ? "another program holds it" : null);
    if (why === null) {
      return kept;
    }
    console.warn(
      `[preview] ${HOP}: preview of ${key} moves from port ${kept}: ${why}`
    );
  };

  /** The lowest free port, an idle origin's taken back each time none is, until one is or none is left to take back. */
  const freePort = (key: string): number | undefined => {
    let port = firstFree();
    while (port === undefined && reclaimOne(key) !== undefined) {
      port = firstFree();
    }
    return port;
  };

  /**
   * The one way an origin gets its port, at the hub's start and on demand:
   * a move is saved and said in one line, and the preview server stands
   * its listener on it.
   */
  const open = (key: string) => {
    if (!listens) {
      return problem(503, {
        code: "preview-no-listener",
        detail:
          "This hub opens no preview listener: it was built only to be read.",
      });
    }
    if (unbindable !== null) {
      return problem(503, {
        code: "preview-port-unopened",
        detail: unbindable,
      });
    }
    const kept = keptStays(key);
    if (kept !== undefined) {
      return kept;
    }
    // An origin whose session or project is gone holds no port: it is let go, never kept.
    if (!db.ownerHeld(key)) {
      return problem(409, {
        code: "preview-owner-gone",
        detail: `No session or project holds the preview origin ${key} now, so it serves nothing.`,
      });
    }
    const port = freePort(key);
    if (port === undefined) {
      return problem(503, {
        code: "preview-ports-taken",
        detail: previewPortWords.everyPortTaken(
          PREVIEW_PORTS_TEXT,
          portHolders()
        ),
      });
    }
    if (!db.keepPort(key, port)) {
      return problem(409, {
        code: "preview-owner-gone",
        detail: `No session or project holds the preview origin ${key} now, so it serves nothing.`,
      });
    }
    moved();
    return port;
  };

  return {
    /** Origin `key`'s port, taken when it has none; the problem of why none is free for it. */
    open,

    /** Origin `key` holds no port now: its row goes, and the preview server lets its listener go (holding the port a while for a stale address). */
    release: (key: string): void => {
      db.dropPort(key);
      moved();
    },

    /**
     * What the preview server said of its last binds: each port another
     * program holds is passed over a while and its origin moves (its row
     * dropped and what shows it told again); a bind the address itself
     * refused refuses every ask until one stands.
     */
    refused(
      refusals: { key: string; port: number; held: boolean; why: string }[]
    ): void {
      const lost = refusals.filter((one) => one.held);
      const unbound = refusals.find((one) => !one.held);
      unbindable = unbound
        ? `Preview port ${unbound.port} didn't open (${unbound.why}).`
        : null;
      if (lost.length === 0) {
        return;
      }
      for (const { key, port } of lost) {
        elsewhere.set(port, Date.now() + HELD_ELSEWHERE_MS);
        db.dropPort(key);
      }
      letGo(lost.map((one) => one.key));
    },
  };
}
