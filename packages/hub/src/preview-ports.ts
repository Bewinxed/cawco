/**
 * Which port each preview origin keeps, and the listener opened on it. An
 * origin (a session's, a project's or a machine artifact's, preview-origin.ts)
 * takes a port of the range when something asks for its address: the port it
 * keeps while that is still a preview port and opens; else the lowest of the
 * range that is not the fleet's own, not another origin's, and opens; else,
 * the range being full, the lowest that opens once an origin that no screen
 * shows let it go, one at a time (`open`). The listeners
 * stand in the table that owns them (preview-listeners.ts); the rows of the
 * ports each origin keeps are the database's (db/previews.ts).
 */
import { detach } from "@cawco/core/detach";
import { isStreamRelayPort } from "@cawco/core/stream-relay";
import {
  type PortHolders,
  previewPortWords,
} from "@cawco/core/words/preview-ports";
import { causeOf, previewFailed } from "@cawco/preview/proxy";
import { ElysiaStatus, problem } from "elysia";
import { FLEET_PORTS, PREVIEW_PORTS, PREVIEW_PORTS_TEXT } from "./config";
import type { PreviewsDb } from "./db/previews";
import { SESSION_PASS_MS } from "./preview-access";
import { HOP, type Listener, type ListenerTable } from "./preview-listeners";

/**
 * How long a port an origin let go stays held for its stale addresses
 * (`createPreviewPorts`' `holdVacant`): a session's pass ticket's life
 * (preview-access.ts `SESSION_PASS_MS`), the longest an `artifact_browse`
 * url can still be entered, which a tab kept open past it outlives only
 * on a reload. Past it, the port is free for any program.
 */
const VACANT_HOLD_MS = SESSION_PASS_MS;

/** What the ports need of the hub around them. */
export interface PreviewPortsEnv {
  /** Runs `run` once after `ms`, on the hub's lifetime (lifetime.ts `after`). */
  after: (ms: number, run: () => void) => void;
  db: Pick<
    PreviewsDb,
    "dropPort" | "keepPort" | "ownerHeld" | "ports" | "portsByUse"
  >;
  /** The address the listeners bind. */
  hostname: string;
  /** Whether a screen shows origin `key` now: the one an origin gives its port up last. */
  inUse: (key: string) => boolean;
  /** Origins that let their port go to another: what each shows is told again, without its old address. */
  letGo: (keys: string[]) => void;
  /** A listener of the hub's on `port`, each request's origin from `route`, behind the lock of an origin's own port. */
  listen: (port: number, route: () => string | undefined) => Listener;
  listeners: ListenerTable;
  /** False for a hub built only to be read (server.ts `serves`): it opens no listener, and every ask for an origin's port is refused. */
  listens: boolean;
  /** The fleet's mode now: host mode's listener holds the range's first port. */
  mode: () => "port" | "host";
}

export function createPreviewPorts({
  after,
  db,
  hostname,
  inUse,
  letGo,
  listen,
  listeners,
  listens,
  mode,
}: PreviewPortsEnv) {
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
   * `bind`, which opens a socket on `port`: true once it did; false when
   * another process holds the port (EADDRINUSE). Any other refusal is the
   * bind address's, not the port's, so no other port would open either: it
   * is returned, in one sentence, never said as every preview port taken.
   */
  const binds = (port: number, bind: () => void) => {
    try {
      bind();
      return true;
    } catch (thrown) {
      if ((thrown as { code?: unknown }).code === "EADDRINUSE") {
        return false;
      }
      return problem(503, {
        code: "preview-port-unopened",
        detail: `Preview port ${port} didn't open on ${hostname} (${causeOf(thrown)}).`,
      });
    }
  };

  /**
   * Whether no socket holds `port` on the listeners' address now: a bind
   * without `reusePort`, closed at once. A listener binds with `reusePort`
   * (its tailnet twin needs it), and such a bind succeeds silently on a port
   * another process holds the same way, the kernel then splitting
   * connections between the two: a scratch hub beside another took half of
   * an embed's requests that way, its frame left on the browser's error page.
   */
  const unheld = (port: number) => {
    if (!listens) {
      return problem(503, {
        code: "preview-no-listener",
        detail:
          "This hub opens no preview listener: it was built only to be read.",
      });
    }
    return binds(port, () =>
      Bun.serve({ hostname, port, fetch: () => new Response(null) }).stop(true)
    );
  };

  /**
   * Port `port`, which an origin served until now, held for
   * {@link VACANT_HOLD_MS} while no origin and no other program has it: a
   * stale address there (a tab, or an `artifact_browse` url kept from before
   * its origin ended or moved) is answered as one on another origin's port
   * is (preview-stale.ts), not with the browser's connection error. Only a
   * port the hub handed out is ever held: one it never gave a preview stays
   * free for any program the person runs (the release proof's systemd socket
   * on 43458, inside its hub's range, failed to start when every free port
   * was held, a4df55bbc).
   *
   * A held port can't stand down for another program: nothing tells a
   * listener that another bind was refused (a plain bind just fails
   * EADDRINUSE; `reusePort` would split its connections, not hand the port
   * over). So the hold is bounded: {@link VACANT_HOLD_MS}, then the port is
   * free. Let go at once when an origin takes it ({@link takeVacant}).
   */
  const holdVacant = (port: number): void => {
    if (
      !listens ||
      listeners.vacantAt(port) ||
      barred(port) ||
      db.ports().some((row) => row.port === port) ||
      listeners.keyAt(port) !== undefined
    ) {
      return;
    }
    try {
      const free = unheld(port);
      if (free instanceof ElysiaStatus) {
        previewFailed(
          HOP,
          null,
          `port ${port} wasn't held: ${free.response.detail}`
        );
        return;
      }
      if (!free) {
        return;
      }
      const held = listen(port, () => undefined);
      listeners.hold(port, held);
      after(VACANT_HOLD_MS, () => {
        if (listeners.vacantAt(port) === held) {
          takeVacant(port);
        }
      });
    } catch (thrown) {
      previewFailed(HOP, null, `port ${port} wasn't held: ${causeOf(thrown)}`);
    }
  };

  /** Port `port` let go by the hub, for an origin to bind: its socket closes as `stop` is called, its connections after. */
  const takeVacant = (port: number): void => {
    const held = listeners.takeVacant(port);
    if (held) {
      detach(held.stop(), "vacant preview port let go");
    }
  };

  /**
   * Origin `key` served on `port`: false when another process holds it
   * (EADDRINUSE). Any other refusal is the bind address's, not the port's,
   * so no other port would open either: it is returned, in one sentence.
   */
  const opens = (key: string, port: number) => {
    takeVacant(port);
    const free = unheld(port);
    if (free instanceof ElysiaStatus || !free) {
      return free;
    }
    return binds(port, () =>
      listeners.bind(
        key,
        listen(port, () => key)
      )
    );
  };

  /**
   * One port taken back for origin `asking`, the range being full: from
   * the origin least recently used (`used_at`, db previews.ts
   * `portsByUse`) of those no screen shows ({@link inUse}), a running
   * session's among them; one whose owner went first. Its listener stops,
   * its stored port is dropped, and what shows it is told again without that
   * address: the next ask for it opens it on a free port, and says that
   * address (`letGo`). Every other origin keeps its port, and so its
   * address. The key that let its port go; undefined when every port is in
   * use.
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
    release(taken);
    letGo([taken]);
    return taken;
  };

  /** Port `kept` while it is still a preview port and opens; else why it moves, or the problem of its opening. */
  const keptStays = (key: string, kept: number) => {
    const refused = barred(kept);
    if (refused) {
      return refused;
    }
    const opened = opens(key, kept);
    if (opened instanceof ElysiaStatus) {
      return opened;
    }
    return opened ? kept : "another process holds it";
  };

  /** The lowest port of the range not `taken`, not barred, that opens; undefined when none does, or the problem of one that did not open. */
  const firstOpen = (key: string, taken: Set<number>) => {
    for (
      let port = PREVIEW_PORTS.first;
      port <= PREVIEW_PORTS.last;
      port += 1
    ) {
      if (taken.has(port) || barred(port)) {
        continue;
      }
      const opened = opens(key, port);
      if (opened instanceof ElysiaStatus) {
        return opened;
      }
      if (opened) {
        return port;
      }
    }
  };

  /** {@link firstOpen} of the ports no origin keeps, an origin that doesn't hold its port let go each time none does ({@link reclaimOne}), until one opens or none is left to let go. */
  const openOrReclaim = (key: string) => {
    for (;;) {
      const port = firstOpen(key, new Set(db.ports().map((row) => row.port)));
      if (port !== undefined || reclaimOne(key) === undefined) {
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

  /**
   * The one way an origin gets its port, at the hub's start and on demand:
   * a move is saved, so a collision heals itself, and said in one line. Its
   * listener opens on it, and host mode's `{port}` names it too.
   */
  const allocate = (key: string) => {
    if (!listens) {
      return problem(503, {
        code: "preview-no-listener",
        detail:
          "This hub opens no preview listener: it was built only to be read.",
      });
    }
    // An origin whose session or project is gone holds no port: it is let go, never kept.
    if (!db.ownerHeld(key)) {
      return problem(409, {
        code: "preview-owner-gone",
        detail: `No session or project holds the preview origin ${key} now, so it serves nothing.`,
      });
    }
    const kept = db.ports().find((row) => row.key === key)?.port;
    const why = kept === undefined ? undefined : keptStays(key, kept);
    if (typeof why === "number" || why instanceof ElysiaStatus) {
      return why;
    }
    const port = openOrReclaim(key);
    if (port instanceof ElysiaStatus) {
      return port;
    }
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
      // Its owner went while the listener opened.
      release(key);
      return problem(409, {
        code: "preview-owner-gone",
        detail: `No session or project holds the preview origin ${key} now, so it serves nothing.`,
      });
    }
    if (kept !== undefined) {
      console.warn(
        `[preview] ${HOP}: preview of ${key} moves from port ${kept} to ${port}: ${why}`
      );
    }
    return port;
  };

  /** Origin `key`'s listener stops and its port is free again, held by the hub a while for a stale address of it ({@link holdVacant}). */
  const release = (key: string): void => {
    const listener = listeners.unbind(key);
    if (listener) {
      // Its port answers a stale address of it from then on.
      detach(
        listener.stop().then(() => holdVacant(listener.port)),
        "preview listener stop"
      );
    }
    db.dropPort(key);
  };

  return {
    /** Origin `key`'s port, its listener started when it has none; the problem of why no port opens for it. */
    open: (key: string) => listeners.portOf(key) ?? allocate(key),
    release,
    unheld,
  };
}
