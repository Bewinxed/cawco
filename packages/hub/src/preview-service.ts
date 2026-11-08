import type { Bounded } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import {
  PREVIEW_START,
  PREVIEW_STOP,
  type PreviewDown,
} from "@cawco/core/preview/protocol";
import { DOWN_WORDS, isFolderGone } from "@cawco/core/preview/proxy";
import {
  type ServingPreview,
  type SourceKey,
  sourceKeyOf,
  sourceMachine,
  type Upstream,
} from "@cawco/core/preview/upstream";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import type { ArtifactRow, ArtifactServed, SourceMoved } from "./db/artifacts";
import { originOfKey } from "./db/previews";
import {
  embedKey,
  loadedOnce,
  type MachineRow,
  type PreviewReach,
  servedByMachine,
} from "./preview";

/** What a machine's agent answered a control call. */
interface Answered {
  error?: string;
  ok: boolean;
  result?: unknown;
}

/** What the preview service needs of the hub. */
export interface PreviewServiceDeps {
  /** Machine `machineId`'s socket's address; undefined while it is away. */
  address: (machineId: string) => string | undefined;
  /** How long a machine has to answer a listener's start or stop. */
  busyMs: number;
  /** Asks machine `machineId`'s agent: its answer, or that it gave none within `timeoutMs`. */
  call: (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number
  ) => Promise<Bounded<Answered>>;
  /** Whether machine `machineId` is reached through the hub's SSH connection to it. */
  carried: (machineId: string) => boolean;
  /** A machine port carried to one on the hub's own loopback, for a machine added over SSH (ssh-tunnels.ts). */
  carry: (machineId: string, port: number) => Promise<number>;
  /** Whether machine `machineId`'s agent is connected now. */
  connected: (machineId: string) => boolean;
  /** Whether origin `key` is in use now (preview.ts `inUse`): a screen has it open, or a running session keeps it. */
  inUse: (key: string) => boolean;
  /** The server artifact `id`'s source moved off, let go once nothing else shows it (artifacts service `letGoMoved`). */
  letGoMoved: (id: string, before: ArtifactServed) => void;
  /** Why machine `machineId` is not connected, the cause alone. */
  offline: (machineId: string) => string;
  /** Why machine `machineId` starts nothing now (its pause), or undefined. */
  paused: (machineId: string) => string | undefined;
  /** Origin `key`'s listener on the hub stopped and its port free again (preview.ts `release`). */
  release: (key: string) => void;
  /** Artifact `id` as its row stands now. */
  row: (id: string) => ArtifactRow | undefined;
  /** The artifact whose row points at origin `origin` now. */
  rowAt: (origin: string) => ArtifactRow | undefined;
  /** How long a hand-up's check waits for its page (artifacts service `SHOWN_WAIT_MS`). */
  shownWaitMs: number;
  /** What a start said of a folder preview's folder (artifacts service `sourceSeen`): gone, with the machine's words, or there. */
  sourceSeen: (id: string, gone: string | null) => void;
}

/** One start of a machine's listener for an origin: the key it is for, and its answer once the machine gives it. */
interface Start {
  for: SourceKey;
  reach: Promise<PreviewReach>;
  token: string;
}

/** The key of what a machine serves `row` from. */
const keyOf = (row: MachineRow): SourceKey =>
  sourceKeyOf({ machineId: row.machineId, source: row.source });

/**
 * WHETHER A MACHINE ARTIFACT'S ORIGIN IS REACHABLE, AND THROUGH WHAT.
 *
 * The hub keeps no copy of what serves an origin: the artifact's row names
 * it (its machine and source), and the row alone. Per origin it keeps only
 * the upstream it relays to, `{ for, address, port, token }`, where `for`
 * is the source key the machine's listener was started for (core
 * `SourceKey`). A request reaches the origin through {@link reach}, which
 * reads the row each time and uses the upstream only while its `for` is
 * the row's key now; any other is told to go and a start for the row's
 * source takes its place. So a row's source that moves (a re-hand in
 * place, a held version opened, a sheet made again) moves its origin's
 * upstream with it at the next request, and the row's one write
 * ({@link moved}, db `onSourceMoved`) moves it at once while a screen
 * uses it. A machine's register is squared against the rows, never
 * against another copy ({@link reconcile}).
 */
export function createPreviewService(deps: PreviewServiceDeps) {
  /** Each origin's upstream, by its key ({@link embedKey}). */
  const upstreams = new Map<string, Upstream>();
  /**
   * Each origin's start in flight, by its key: one per origin and source
   * key, however many ask. Taken out when the origin ends, its machine goes
   * or registers again, or its row moves to another source: the start then
   * finds itself voided as the machine answers, and tells its listener to go.
   */
  const starting = new Map<string, Start>();

  /** Machine `machineId`'s listener for origin `key` told to go, the one start `token` opened alone. */
  const stop = (machineId: string, key: string, token: string): void => {
    detach(
      deps.call(
        machineId,
        PREVIEW_STOP,
        [{ instanceId: key, token }],
        deps.busyMs
      ),
      "preview listener stop"
    );
  };

  /** Origin `key`'s upstream forgotten and its listener told to go. */
  const drop = (key: string, held: Upstream): void => {
    upstreams.delete(key);
    stop(sourceMachine(held.for), key, held.token);
  };

  /** A start's listener told to go, unless a register has since made it the origin's upstream. */
  const stopLate = (machineId: string, key: string, token: string): void => {
    if (upstreams.get(key)?.token !== token) {
      stop(machineId, key, token);
    }
  };

  /**
   * Where machine `machineId`'s listener at `port` is reached from the hub:
   * the address its socket came from, or, for a machine added over SSH
   * (ssh-tunnels.ts), the port carried to one on the hub's own loopback, as
   * that address is the connection's end here.
   */
  const upstreamAt = async (
    machineId: string,
    key: string,
    port: number,
    start: Start
  ): Promise<PreviewReach> => {
    const { token } = start;
    const address = deps.address(machineId);
    if (!address) {
      return { ok: false, down: "machine", error: "Machine is not connected" };
    }
    if (!deps.carried(machineId)) {
      return { ok: true, upstream: { for: start.for, address, port, token } };
    }
    try {
      const carried = await deps.carry(machineId, port);
      return {
        ok: true,
        upstream: {
          for: start.for,
          address: "127.0.0.1",
          port: carried,
          token,
        },
      };
    } catch (error) {
      stopLate(machineId, key, token);
      return {
        ok: false,
        down: "reach",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  /**
   * A machine's listener for origin `key`, started for what `row` names
   * (`start.for`), with the start's own token, which the relay carries and
   * the stop names: where it listens ({@link upstreamAt}), or the hop that
   * failed and why.
   */
  const startListener = async (
    key: string,
    row: MachineRow,
    start: Start
  ): Promise<PreviewReach> => {
    const { machineId, source } = row;
    // A paused machine starts no preview: the pane says why, and the
    // preview's next request after the pause asks again.
    const paused = deps.paused(machineId);
    if (paused) {
      return { ok: false, down: "machine", error: paused };
    }
    const asked = await deps.call(
      machineId,
      PREVIEW_START,
      [{ instanceId: key, ...source, token: start.token, for: start.for }],
      deps.busyMs
    );
    switch (asked.kind) {
      case "unanswered":
        if (asked.reason === "dead") {
          return {
            ok: false,
            down: "machine",
            error: "Machine is not connected",
          };
        }
        // The daemon may still finish the start after this gave up; the
        // listener it would open is no upstream here, so it is told to go.
        stopLate(machineId, key, start.token);
        return {
          ok: false,
          down: "machine",
          error: `Machine did not answer within ${secondsOf(asked.after)} s`,
        };
      case "answered":
        break;
      default:
        unhandled("preview start answer", asked);
    }
    const answer = asked.value;
    if (!answer.ok) {
      const error = answer.error ?? "Preview failed";
      return {
        ok: false,
        // The daemon refuses a workspace no boundary runs in these words
        // (preview-bridge.ts `WorkspaceDown`); anything else kept the way to
        // the server from opening.
        down: error === DOWN_WORDS.workspace ? "workspace" : "reach",
        error,
      };
    }
    const { port } = answer.result as { port: number };
    return await upstreamAt(machineId, key, port, start);
  };

  /** What a start said of a folder preview's folder, kept on its artifact: gone in its machine's words, or there; any other failure says nothing of it. */
  const folderSeen = (row: MachineRow, started: PreviewReach): void => {
    if (!("dir" in row.source)) {
      return;
    }
    if (started.ok) {
      deps.sourceSeen(row.id, null);
    } else if (isFolderGone(started.error)) {
      deps.sourceSeen(row.id, started.error);
    }
  };

  /** Origin `key`'s upstream, when it is for what `row` names now. */
  const upstreamOf = (row: MachineRow): Upstream | undefined => {
    const held = upstreams.get(embedKey(row.origin));
    return held?.for === keyOf(row) ? held : undefined;
  };

  /**
   * A start of origin `key` that was voided while it ran (its origin ended,
   * its machine registered again or went, its row moved): its listener told
   * to go, and where the origin is served now answered instead.
   */
  const voided = (
    row: MachineRow,
    key: string,
    started: PreviewReach
  ): Promise<PreviewReach> | PreviewReach => {
    if (started.ok) {
      stopLate(row.machineId, key, started.upstream.token);
    }
    const now = deps.rowAt(row.origin);
    return now && servedByMachine(now)
      ? reach(now)
      : {
          ok: false,
          down: "closed",
          error: "Preview was closed while starting.",
        };
  };

  /**
   * THE ONE WAY A REQUEST REACHES A MACHINE'S PREVIEW: by its row, never by
   * a copy. The origin's upstream when it was started for what the row
   * names now; else one for another source told to go, and a start for the
   * row's own (one per origin and source key, however many ask). A start
   * voided while it ran (its origin ended, its machine registered again or
   * went, its row moved) answers with where the origin is served now.
   */
  const reach = (row: MachineRow): Promise<PreviewReach> => {
    const key = embedKey(row.origin);
    const want = keyOf(row);
    const held = upstreams.get(key);
    if (held?.for === want) {
      return Promise.resolve({ ok: true, upstream: held });
    }
    if (held) {
      drop(key, held);
    }
    const inFlight = starting.get(key);
    if (inFlight && inFlight.for === want) {
      return inFlight.reach;
    }
    // One for another source finds itself voided as its machine answers.
    starting.delete(key);
    if (!deps.connected(row.machineId)) {
      return Promise.resolve({
        ok: false,
        down: "machine",
        // The cause alone: its readers are the hub's own lines and the
        // preview ping, whose pane says its own next step (it tries again).
        error: deps.offline(row.machineId),
      });
    }
    const start: Start = {
      for: want,
      token: crypto.randomUUID(),
      reach: Promise.resolve({ ok: false, down: "closed", error: "" }),
    };
    start.reach = (async (): Promise<PreviewReach> => {
      const started = await startListener(key, row, start);
      folderSeen(row, started);
      if (starting.get(key) !== start) {
        return voided(row, key, started);
      }
      starting.delete(key);
      if (started.ok) {
        upstreams.set(key, started.upstream);
      }
      return started;
    })();
    starting.set(key, start);
    return start.reach;
  };

  /**
   * Origin `key`'s listener at `at` refused a connection: that is not where
   * it is served, so it is forgotten and the next request reaches the
   * machine again instead of dialing it again.
   */
  const unreachable = (key: string, at: Upstream): void => {
    const held = upstreams.get(key);
    if (
      held?.token === at.token &&
      held.address === at.address &&
      held.port === at.port
    ) {
      upstreams.delete(key);
    }
  };

  /**
   * Every upstream and start of machine `machineId` forgotten: its socket
   * went (its listeners may well still run, and its next register says so)
   * or it registered again. A start in flight finds itself voided as it is
   * answered.
   */
  const forget = (machineId: string): void => {
    for (const [key, held] of upstreams) {
      if (sourceMachine(held.for) === machineId) {
        upstreams.delete(key);
      }
    }
    for (const [key, start] of starting) {
      if (sourceMachine(start.for) === machineId) {
        starting.delete(key);
      }
    }
  };

  return {
    reach,

    upstreamOf,

    unreachable,

    /**
     * A preview handed to a parent loaded once on its own origin, as the
     * parent will open it: its listener reached for what its row names now,
     * then its page asked for as a pane's load is (a sleeping stage or
     * served server wakes for it). Null when nothing stands in its way, else
     * the hop that failed and why, or `error` when its page answered an
     * error status, with that status and the error's first line
     * ({@link loadedOnce}; artifacts service `answersFirst`).
     */
    reachable: async (
      row: ArtifactRow
    ): Promise<{ failure: PreviewDown; why: string | null } | null> => {
      if (!servedByMachine(row)) {
        return null;
      }
      const reached = await reach(row);
      if (!reached.ok) {
        return { failure: reached.down, why: reached.error };
      }
      return await loadedOnce(
        reached.upstream,
        row.source.path,
        deps.shownWaitMs
      );
    },

    /**
     * A register squares the machine's listeners with the rows. It is the
     * machine's whole account of what it serves, so nothing the hub held
     * for it before stands ({@link forget}). A listener the daemon still
     * serves, started for what its origin's row names now, is the origin's
     * upstream again; any other (its origin ended, its row moved to another
     * source, or no origin's key) is told to go. One the daemon no longer
     * serves (it restarted) is started by nothing here: the origin's next
     * request starts it ({@link reach}), so a machine coming back after a
     * reboot wakes no server nobody is looking at.
     */
    reconcile: (
      machineId: string,
      address: string,
      serving: ServingPreview[]
    ): void => {
      forget(machineId);
      for (const listener of serving) {
        const key = listener.instanceId;
        const origin = originOfKey(key);
        const row = origin === null ? undefined : deps.rowAt(origin);
        if (!(row && servedByMachine(row) && keyOf(row) === listener.for)) {
          stop(machineId, key, listener.token);
          continue;
        }
        const adopted = (at: string, port: number): Upstream => ({
          for: listener.for,
          address: at,
          port,
          token: listener.token,
        });
        if (!deps.carried(machineId)) {
          upstreams.set(key, adopted(address, listener.port));
          continue;
        }
        // Through the hub's SSH connection to the machine, carried anew on
        // this connection: until it is, a request starts the listener again.
        deps.carry(machineId, listener.port).then(
          (port) => {
            const now = deps.rowAt(row.origin);
            if (
              !(upstreams.has(key) || starting.has(key)) &&
              now &&
              servedByMachine(now) &&
              keyOf(now) === listener.for
            ) {
              upstreams.set(key, adopted("127.0.0.1", port));
            }
          },
          (error: unknown) =>
            console.warn(
              `[preview] ${key} is not pointed at its listener again: ${error instanceof Error ? error.message : String(error)}`
            )
        );
      }
    },

    /**
     * Machine `machineId`'s socket went: a preview outlives it, without an
     * upstream, until its register says what it still serves or a request
     * starts one again. Nothing is published; the panes keep the page they
     * have.
     */
    machineGone: forget,

    /**
     * Origin `origin` ended (db `onArtifactsGone`: every way an artifact row
     * goes, a held version's too, which after its opening points at the
     * artifact's old origin, `handOrigin`): its listener on the hub stops
     * and its port is free again, its machine's listener is told to go, and
     * a start in flight is voided. The one end of an artifact's origin.
     */
    end: (origin: string): void => {
      const key = embedKey(origin);
      deps.release(key);
      starting.delete(key);
      const held = upstreams.get(key);
      if (held) {
        drop(key, held);
      }
    },

    /**
     * Artifact `move.id`'s source moved (db `onSourceMoved`, its row's one
     * write): the upstream of the origin it stands on now told to go when
     * it was for another source, and a start for another voided; while a
     * screen uses that origin the row's own source is started at once.
     * Only then is the server it moved off let go, once nothing else shows
     * it (artifacts service `letGoMoved`), so a page open on it has its new
     * server before its old one stops.
     */
    moved: async ({ id, before }: SourceMoved): Promise<void> => {
      const row = deps.row(id);
      if (row && servedByMachine(row)) {
        const key = embedKey(row.origin);
        const want = keyOf(row);
        const held = upstreams.get(key);
        if (held && held.for !== want) {
          drop(key, held);
        }
        if (starting.get(key)?.for !== want) {
          starting.delete(key);
        }
        if (deps.inUse(key)) {
          await reach(row);
        }
      }
      deps.letGoMoved(id, before);
    },
  };
}
