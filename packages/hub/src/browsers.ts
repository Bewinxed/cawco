/**
 * The fleet's browsers, as the hub holds them (Projects spec §5.11): each
 * machine's `browsers` frame kept as rows (one per key per machine), the
 * `browser` artifact in the panel of every session that uses one, and the
 * person's routes. A session uses its project's browser on its own machine,
 * else its machine's (`machine:<id>`), as the machine's gate decides
 * (agent gate.ts `keyOfWorkspace`).
 *
 * - `POST /api/browsers/:key/takeover`: the person takes the browser over
 *   privately (agent shield.ts): every agent connection cut, the page the
 *   browser ask was pinned to in front (browser-tools.ts), else the
 *   session's own newest, control the person's; a browser ask it
 *   answers is taken off every screen and its call waits on; the session's
 *   panel opens on its browser artifact; every other live session of the
 *   project on that machine is told in one line.
 * - `POST /api/browsers/:key/handback`: control taken back, the page loaded
 *   again, the gate open; the ask's call answers with the page's origin.
 * - `POST /api/browsers/:key/start`, `/stop`, `GET /api/browsers`.
 * - `POST /api/browsers/:key/remove`: the browser stopped and its profile
 *   deleted on its machine (its sign-ins forgotten), refused while the
 *   person holds it; answered once its row is gone. Forgetting a project
 *   stops each of its browsers and keeps its profile, which its restore
 *   finds where it was (project-trash.ts).
 *
 * What a machine says of a browser right now and the hub keeps nowhere
 * else (why it failed, how far its image is, the origin of the page it
 * shows) is held in memory from its latest frame and listed with the row:
 * live facts, which a hub restart reads again from the machine's next
 * frame, never served back from a table.
 *
 * Every route is the person's: a session's credential is refused by the
 * hub's gate (hub-auth.ts, "Only the person takes over").
 *
 * The machine holds the truth of a take-over (agent shield.ts); the hub's row
 * follows it and never sends one again. A take-over starts on the hub only
 * with the machine's answer to `browser.shield`, and ends in one place,
 * {@link ended}, from every path: the person's Hand back (the machine's
 * answer), the machine's own hand-back (no view for two minutes, or the
 * browser stopped: its `browser_handback` frame), and any end the hub was not
 * there to hear (a machine's frame, or its rows read as it registers, with no
 * take-over where the row had one). A browser ask withdrawn before the
 * person took it never started one; one whose session ends while it stands
 * keeps it until the person, or the machine, hands back.
 */

import {
  BROWSER_HANDBACK,
  BROWSER_INJECT_ADVERT,
  BROWSER_REMOVE,
  BROWSER_ROWS,
  BROWSER_SHIELD,
  BROWSER_START,
  BROWSER_STOP,
  type BrowserFrame,
  type BrowserHandback,
  type BrowserHandedBackFrame,
  type BrowserKey,
  type BrowserListFrame,
  type BrowserPasskeyAdvertArgs,
  type BrowserRow,
  type BrowserShieldArgs,
  type BrowserState,
  isBrowserKey,
  type ListedBrowser,
  PASSKEY_ADVERT_MAX_AGE_MS,
  type PasskeyQrFrame,
} from "@cawco/core/browser";
import type { InstanceRow } from "@cawco/core/protocol";
import { DAY_MS } from "@cawco/core/time";
import { artifactWords } from "@cawco/core/words/artifacts";
import { SHIELD_WORDS } from "@cawco/core/words/browser";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import type { BrowserAsks } from "./browser-tools";
import type { ArtifactRow, ArtifactsDb } from "./db/artifacts";
import type { BrowsersDb, StoredBrowser } from "./db/browsers";

import type { RelayCall } from "./stream-relay";

/** How a take-over came to end, as the hub's log says it. */
const HANDED_BACK_BY: Record<BrowserHandedBackFrame["why"], string> = {
  person: "by the person",
  unwatched: "by its machine: no view for two minutes",
  stopped: "by its machine: the browser stopped",
};

/** What a browser artifact is called in a panel. */
const BROWSER_ARTIFACT_NAME = "browser";

/** The states in which a browser runs nothing: a forget has nothing of it to stop. */
const RESTING: ReadonlySet<BrowserState> = new Set(["asleep", "failed"]);

/** How long a take-over, a start or a stop has on its machine: a start may build the image first. A browser ask's page waits as long, as it may wake its browser (server.ts `pageOf`). */
export const BROWSER_CALL_MS = 15 * 60_000;

/** How long a browser's own stream relay credential lasts (Projects spec item 4). */
const RELAY_TTL_MS = 7 * DAY_MS;

/** What a machine says of a browser now, kept from its latest frame (core `BrowserRow`). */
export type LiveBrowserFacts = Pick<BrowserRow, "why" | "progress" | "origin">;

export interface BrowsersDeps {
  /** The browser asks waiting on the person (browser-tools.ts), made after this. */
  asks: () => BrowserAsks;
  call: RelayCall;
  db: { artifacts: ArtifactsDb; browsers: BrowsersDb };
  instance: (id: string) => InstanceRow | undefined;
  /** Whether the session's work item ended: its browser artifact went with it (server.ts `endBrowserOf`), and listing makes none again while it stays ended. */
  itemEnded: (instance: InstanceRow) => boolean;
  /** The session's live peers: every session on `machineId` in `projectId` (null: in none) whose process runs; one asleep is never told. */
  liveSessions: (machineId: string, projectId: string | null) => InstanceRow[];
  machineName: (machineId: string) => string;
  /** A credential of the fleet's stream relay, or null while it has none. */
  mint: (
    userId: string,
    ttlMs: number
  ) => import("@cawco/core/browser").BrowserRelay | null;
  /** Brings an artifact to the front of its session's panel (artifact-pages.ts `openPreview`). */
  open: (artifact: ArtifactRow) => Promise<{ ok: boolean; error?: string }>;
  /** Sends every dashboard the fleet's browsers, whole (core `BrowserListFrame`). */
  publish: (frame: BrowserListFrame) => void;
  /** Says something to a session, as the hub. */
  tell: (instanceId: string, text: string) => void;
  /** The gate id a session's browser door is (agent door.ts): its workspace's, else its own id. */
  workspaceOf: (instance: InstanceRow) => string | undefined;
}

/** The browser `instance` uses: its project's, else its machine's. */
const browserKeyOf = (instance: InstanceRow): BrowserKey =>
  instance.projectId
    ? `project:${instance.projectId}`
    : `machine:${instance.machineId}`;

/** A machine's answer to a browser call, or its refusal in the person's words. */
export const answered = <T>(
  read: Awaited<ReturnType<RelayCall>>,
  machine: string,
  what: string
) => {
  if (read.kind === "unanswered") {
    return read.reason === "dead"
      ? problem(503, {
          code: "browser-machine-away",
          detail: `${machine} is not connected, so its browser could not ${what}. Try again once it is back.`,
        })
      : problem(503, {
          code: "browser-machine-late",
          detail: `${machine}'s browser did not ${what} in time; it may still be at it there.`,
        });
  }
  if (!read.value.ok) {
    return problem(409, {
      code: "browser-machine-refused",
      detail: read.value.error ?? `${machine}'s browser did not ${what}.`,
    });
  }
  return read.value.result as T;
};

const rowFrom = (row: BrowserRow): Omit<StoredBrowser, "machineId"> => ({
  key: row.key,
  name: row.name,
  host: row.host,
  state: row.state,
  lastUsedAt: row.lastUsedAt,
  projectId: row.key.startsWith("project:")
    ? row.key.slice("project:".length)
    : null,
  takeover: row.takeover
    ? {
        by: row.takeover.by ?? "",
        requestId: row.takeover.requestId ?? null,
        since: row.takeover.since,
      }
    : null,
});

export const createBrowsers = (deps: BrowsersDeps) => {
  const passkeyQrs = new Map<BrowserKey, PasskeyQrFrame>();
  const { db } = deps;
  /** Each browser's live facts, by machine and key, from its machine's latest frame or answer. */
  const live = new Map<string, LiveBrowserFacts>();
  const liveKey = (machineId: string, key: BrowserKey): string =>
    `${machineId}\u0000${key}`;
  const noteLive = (machineId: string, row: BrowserRow): void => {
    const facts: LiveBrowserFacts = {
      ...(row.why ? { why: row.why } : {}),
      ...(row.progress ? { progress: row.progress } : {}),
      ...(row.origin ? { origin: row.origin } : {}),
    };
    live.set(liveKey(machineId, row.key), facts);
  };

  /** `instance`'s browser artifact, made the first time it is listed or asked about. */
  const artifactFor = (instance: InstanceRow, key: BrowserKey): ArtifactRow => {
    const kept = db.artifacts.byName(
      instance.id,
      "browser",
      BROWSER_ARTIFACT_NAME
    );
    if (kept) {
      return kept;
    }
    const now = new Date();
    return db.artifacts.create({
      id: crypto.randomUUID(),
      instanceId: instance.id,
      madeBy: null,
      heldFor: null,
      projectId: instance.projectId ?? null,
      kind: "browser",
      name: BROWSER_ARTIFACT_NAME,
      // The person takes the browser over; each browser_ask carries its own reason, so the row keeps no line of its own.
      does: "try",
      ask: "",
      title: artifactWords.kindWord.browser,
      machineId: instance.machineId,
      source: { page: key },
      revision: 1,
      seq: 0,
      deliveredSeq: 0,
      readSeq: 0,
      openedRevision: null,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
  };

  /** The machine a route means: the one named, else the only one with `key`. */
  const machineOf = (key: BrowserKey, named: string | undefined) => {
    if (named) {
      return named;
    }
    const rows = db.browsers.list().filter((row) => row.key === key);
    const [only] = rows;
    if (rows.length === 1 && only) {
      return only.machineId;
    }
    return rows.length === 0
      ? problem(404, {
          code: "browser-unreported",
          detail: `No machine has reported the browser ${key}: name its machine.`,
        })
      : problem(409, {
          code: "browser-machine-unnamed",
          detail: `The browser ${key} runs on ${rows.length} machines: name one.`,
        });
  };

  /** Every dashboard told the fleet's browsers as they stand now: after each change of any. */
  const told = (): void =>
    deps.publish({ kind: "browser_list", browsers: browsers.list() });

  const keep = (machineId: string, row: BrowserRow): void => {
    db.browsers.put(machineId, rowFrom(row));
    noteLive(machineId, row);
    told();
  };

  const shield = async (machineId: string, args: BrowserShieldArgs) => {
    const row = answered<BrowserRow>(
      await deps.call(machineId, BROWSER_SHIELD, [args], BROWSER_CALL_MS),
      deps.machineName(machineId),
      "be taken over"
    );
    if (row instanceof ElysiaStatus) {
      return row;
    }
    keep(machineId, row);
    return row;
  };

  /** The open browser ask `requestId` names, when one does; refused when it is gone or about another browser. */
  const askOf = (key: BrowserKey, requestId: string | undefined) => {
    if (!requestId) {
      return;
    }
    const ask = deps.asks().get(requestId);
    if (!ask) {
      return problem(404, {
        code: "browser-ask-closed",
        detail: "That browser ask is no longer open.",
      });
    }
    if (ask.key !== key) {
      return problem(400, {
        code: "browser-ask-other",
        detail: `That browser ask is about ${ask.key}, not ${key}.`,
      });
    }
    return ask;
  };

  /** The session's panel brought onto its browser artifact; the artifact's id. */
  const openPanel = async (
    session: InstanceRow,
    key: BrowserKey
  ): Promise<string> => {
    const artifact = artifactFor(session, key);
    const opened = await deps.open(artifact);
    if (!opened.ok) {
      console.warn(
        `[browser] ${session.id}'s panel did not open on its browser: ${opened.error ?? "no reason given"}`
      );
    }
    return artifact.id;
  };

  /** Every other live session of the browser's project (or machine) told in one line, a note its next turn reads. */
  const tellPeers = (
    machineId: string,
    key: BrowserKey,
    asker: string | undefined
  ): void => {
    const projectId = key.startsWith("project:")
      ? key.slice("project:".length)
      : null;
    for (const peer of deps.liveSessions(machineId, projectId)) {
      if (peer.id !== asker) {
        deps.tell(peer.id, SHIELD_WORDS);
      }
    }
  };

  /**
   * The one place a take-over ends on the hub: its row holds none, and the
   * browser ask it answered (its call waiting on) answers with the page's
   * origin, or none when the machine could not say.
   */
  const ended = (
    machineId: string,
    key: BrowserKey,
    origin: string | null,
    requestId: string | undefined
  ): void => {
    const row = db.browsers.get(machineId, key);
    if (row?.takeover) {
      db.browsers.put(machineId, { ...row, takeover: null });
      told();
    }
    deps.asks().handedBack(machineId, key, origin, requestId);
  };

  /** Where a take-over of `key` happens: the ask it answers, its session and its machine; refused as {@link askOf} and {@link machineOf} refuse. */
  const takeoverAt = (
    key: BrowserKey,
    asked: { instanceId?: string; machineId?: string; requestId?: string }
  ) => {
    const ask = askOf(key, asked.requestId);
    if (ask instanceof ElysiaStatus) {
      return ask;
    }
    const session = deps.instance(ask?.instanceId ?? asked.instanceId ?? "");
    const machineId =
      ask?.machineId ?? machineOf(key, asked.machineId ?? session?.machineId);
    if (machineId instanceof ElysiaStatus) {
      return machineId;
    }
    return { ask, machineId, session };
  };

  /** Browser `row` of a project being forgotten handed back when held and stopped; the forget's refusal when it isn't. */
  const stopKept = async (key: BrowserKey, row: StoredBrowser) => {
    const unstopped = (status: number, why: string) =>
      problem(status, {
        code: "browser-not-stopped",
        detail: `Its browser on ${deps.machineName(row.machineId)} wasn't stopped: ${why} The project is kept; Forget tries again.`,
      });
    try {
      const back = row.takeover
        ? await browsers.handback(key, row.machineId)
        : undefined;
      const stopped =
        back instanceof ElysiaStatus
          ? back
          : await browsers.stop(key, row.machineId);
      if (stopped instanceof ElysiaStatus) {
        return unstopped(stopped.status, stopped.response.detail);
      }
    } catch (error) {
      return unstopped(
        503,
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const browsers = {
    /**
     * A machine's browsers, whole, as it holds them: the rows follow it. A
     * take-over the row held and the machine no longer does ended where
     * the hub was not there to hear it.
     */
    heard(machineId: string, frame: BrowserFrame): void {
      const now = new Map(frame.browsers.map((row) => [row.key, row]));
      for (const row of db.browsers.list()) {
        if (
          row.machineId === machineId &&
          row.takeover &&
          !now.get(row.key)?.takeover
        ) {
          ended(machineId, row.key, null, row.takeover.requestId ?? undefined);
        }
      }
      db.browsers.replace(machineId, frame.browsers.map(rowFrom));
      for (const at of live.keys()) {
        if (at.startsWith(`${machineId}\u0000`)) {
          live.delete(at);
        }
      }
      for (const row of frame.browsers) {
        noteLive(machineId, row);
      }
      told();
    },

    /** A passkey QR extracted from a browser's page: kept per browser key, so a dashboard that connects later gets the latest. */
    heardPasskeyQr(frame: PasskeyQrFrame): void {
      passkeyQrs.set(frame.key, frame);
    },

    /** The latest passkey QR of each browser that has one. */
    passkeyQrs(): PasskeyQrFrame[] {
      return [...passkeyQrs.values()];
    },

    /** A take-over its machine ended, whichever way: told before the record's frame, with the page's origin. */
    heardHandback(frame: BrowserHandedBackFrame): void {
      passkeyQrs.delete(frame.key);
      console.info(
        `[browser] ${frame.key} on ${deps.machineName(frame.machineId)} handed back (${HANDED_BACK_BY[frame.why]})`
      );
      ended(frame.machineId, frame.key, frame.origin, frame.requestId);
    },

    /**
     * The browser a session uses and its artifact in the session's panel,
     * for a browser ask: its machine starts the browser on the first need.
     */
    browserFor(instance: InstanceRow): {
      artifactId: string;
      key: BrowserKey;
      machineId: string;
    } {
      const key = browserKeyOf(instance);
      return {
        key,
        machineId: instance.machineId,
        artifactId: artifactFor(instance, key).id,
      };
    },

    /**
     * Every session lists its browser once its machine runs one for it: the
     * artifact made the first time. A session whose work item ended has
     * none: its browser artifact ended with the item.
     */
    listed(instance: InstanceRow): void {
      const key = browserKeyOf(instance);
      if (
        db.browsers.get(instance.machineId, key) &&
        !deps.itemEnded(instance)
      ) {
        artifactFor(instance, key);
      }
    },

    /**
     * A machine registered: its browsers are read from it whole, so every
     * row (and every take-over) is what the machine holds now, not what the
     * hub kept while it was away.
     */
    async connected(machineId: string) {
      const frame = answered<BrowserFrame>(
        await deps.call(machineId, BROWSER_ROWS, [], BROWSER_CALL_MS),
        deps.machineName(machineId),
        "say what it runs"
      );
      if (frame instanceof ElysiaStatus) {
        return frame;
      }
      browsers.heard(machineId, frame);
    },

    /**
     * The person takes `key` over: for the browser ask `requestId` when
     * given (its session's page in front, its call waiting on), else from
     * session `instanceId`'s panel.
     */
    async takeover(
      key: BrowserKey,
      asked: {
        instanceId?: string;
        machineId?: string;
        requestId?: string;
      }
    ) {
      const at = takeoverAt(key, asked);
      if (at instanceof ElysiaStatus) {
        return at;
      }
      const { ask, machineId, session } = at;
      const workspaceId = session ? deps.workspaceOf(session) : undefined;
      // Sent again (a second press, or after the daemon restarted): the peers were told.
      const held = !!db.browsers.get(machineId, key)?.takeover;
      const row = await shield(machineId, {
        key,
        ...(workspaceId ? { workspaceId } : {}),
        ...(ask
          ? {
              origin: ask.origin,
              requestId: asked.requestId,
              targetId: ask.targetId,
            }
          : {}),
      });
      if (row instanceof ElysiaStatus) {
        return row;
      }
      if (asked.requestId) {
        deps.asks().taken(asked.requestId);
      }
      const artifactId =
        session && session.machineId === machineId
          ? await openPanel(session, key)
          : null;
      if (!held) {
        tellPeers(machineId, row.key, session?.id);
      }
      return { artifactId, row };
    },

    /** The person hands `key` back: the ask's call answers with the page's origin. */
    async handback(key: BrowserKey, named: string | undefined) {
      const machineId = machineOf(key, named);
      if (machineId instanceof ElysiaStatus) {
        return machineId;
      }
      const back = answered<BrowserHandback>(
        await deps.call(
          machineId,
          BROWSER_HANDBACK,
          [{ key }],
          BROWSER_CALL_MS
        ),
        deps.machineName(machineId),
        "be handed back"
      );
      if (back instanceof ElysiaStatus) {
        return back;
      }
      ended(machineId, key, back.origin, back.requestId);
      return back;
    },

    async start(key: BrowserKey, named: string | undefined) {
      const machineId = machineOf(key, named);
      if (machineId instanceof ElysiaStatus) {
        return machineId;
      }
      const relay = deps.mint(`browser:${key}`, RELAY_TTL_MS);
      const row = answered<BrowserRow>(
        await deps.call(
          machineId,
          BROWSER_START,
          [{ key, ...(relay ? { relay } : {}) }],
          BROWSER_CALL_MS
        ),
        deps.machineName(machineId),
        "start"
      );
      if (row instanceof ElysiaStatus) {
        return row;
      }
      keep(machineId, row);
      return row;
    },

    /** Stops `key`, handed back first when the person holds it. */
    async stop(key: BrowserKey, named: string | undefined) {
      const machineId = machineOf(key, named);
      if (machineId instanceof ElysiaStatus) {
        return machineId;
      }
      if (db.browsers.get(machineId, key)?.takeover) {
        const back = await browsers.handback(key, machineId);
        if (back instanceof ElysiaStatus) {
          return back;
        }
      }
      const row = answered<BrowserRow | null>(
        await deps.call(machineId, BROWSER_STOP, [{ key }], BROWSER_CALL_MS),
        deps.machineName(machineId),
        "stop"
      );
      if (row instanceof ElysiaStatus) {
        return row;
      }
      if (row) {
        keep(machineId, row);
      }
      return row;
    },

    /**
     * Removes `key` on its machine: stopped, its profile (its sign-ins)
     * deleted, its row gone. Refused while the person holds it.
     */
    async remove(key: BrowserKey, named: string | undefined) {
      const machineId = machineOf(key, named);
      if (machineId instanceof ElysiaStatus) {
        return machineId;
      }
      if (db.browsers.get(machineId, key)?.takeover) {
        return problem(409, {
          code: "browser-held",
          detail:
            "You have control of this browser now. Hand it back first, then forget its sign-ins.",
        });
      }
      const removed = answered<null>(
        await deps.call(machineId, BROWSER_REMOVE, [{ key }], BROWSER_CALL_MS),
        deps.machineName(machineId),
        "be removed"
      );
      if (removed instanceof ElysiaStatus) {
        return removed;
      }
      db.browsers.remove(machineId, key);
      live.delete(liveKey(machineId, key));
      told();
    },

    /**
     * A project being forgotten: each of its browsers, on every machine,
     * handed back when the person holds it and stopped when it runs, its
     * profile (its sign-ins) kept on its machine for the project's restore
     * (project-trash.ts keeps which). One asleep or failed has nothing to
     * stop. The first that can't be stopped is the forget's refusal, the
     * project kept.
     */
    async forgetProject(projectId: string) {
      const key: BrowserKey = `project:${projectId}`;
      for (const row of db.browsers.list()) {
        if (row.key !== key || RESTING.has(row.state)) {
          continue;
        }
        const stopped = await stopKept(key, row);
        if (stopped) {
          return stopped;
        }
      }
    },

    /** Every browser of the fleet, for Settings, the project page and every browser view. */
    list(): ListedBrowser[] {
      return db.browsers.list().map((row) => ({
        ...row,
        machineName: deps.machineName(row.machineId),
        ...live.get(liveKey(row.machineId, row.key)),
      }));
    },

    /**
     * A FIDO caBLE BLE advertisement captured on `sourceMachineId`: relayed
     * to every other machine with a live browser whose take-over is active.
     * Validates the service data and age, then sends
     * `browser.injectAdvert` to each target machine's daemon in parallel.
     */
    relayPasskeyAdvert(
      sourceMachineId: string,
      args: BrowserPasskeyAdvertArgs
    ): void {
      // Validate: base64-decoded service data must be exactly 20 bytes.
      let decoded: Buffer;
      try {
        decoded = Buffer.from(args.serviceData, "base64");
      } catch {
        console.warn(
          `[browser] passkey advert from ${deps.machineName(sourceMachineId)}: service data is not valid base64`
        );
        return;
      }
      if (decoded.length !== 20) {
        console.warn(
          `[browser] passkey advert from ${deps.machineName(sourceMachineId)}: service data is ${decoded.length} bytes, expected 20`
        );
        return;
      }

      // Drop adverts that are too old.
      const age = Date.now() - args.capturedAt;
      if (age > PASSKEY_ADVERT_MAX_AGE_MS) {
        console.warn(
          `[browser] passkey advert from ${deps.machineName(sourceMachineId)}: ${age} ms old, dropped (max ${PASSKEY_ADVERT_MAX_AGE_MS} ms)`
        );
        return;
      }

      // TODO: check a fleet-level `passkeyRelay` setting once it exists.

      // Find every other machine with a live browser whose take-over is active.
      const targets = new Set<string>();
      for (const row of db.browsers.list()) {
        if (row.machineId !== sourceMachineId && row.takeover) {
          targets.add(row.machineId);
        }
      }

      if (targets.size === 0) {
        return;
      }

      console.info(
        `[browser] relaying passkey advert from ${deps.machineName(sourceMachineId)} to ${targets.size} machine(s)`
      );

      for (const machineId of targets) {
        // Find the keys with active take-overs on this machine.
        const keys = db.browsers
          .list()
          .filter(
            (row) =>
              row.machineId === machineId &&
              row.machineId !== sourceMachineId &&
              row.takeover
          )
          .map((row) => row.key);

        for (const key of keys) {
          deps
            .call(
              machineId,
              BROWSER_INJECT_ADVERT,
              [
                {
                  key,
                  serviceData: args.serviceData,
                  rssi: args.rssi,
                  capturedAt: args.capturedAt,
                  sourceMachineId,
                },
              ],
              PASSKEY_ADVERT_MAX_AGE_MS
            )
            .catch((error) => {
              console.warn(
                `[browser] passkey inject to ${deps.machineName(machineId)} (${key}) failed: ${error instanceof Error ? error.message : String(error)}`
              );
            });
        }
      }
    },
  };
  return browsers;
};

export type Browsers = ReturnType<typeof createBrowsers>;

const keyOf = (raw: string) => {
  const key = decodeURIComponent(raw);
  return isBrowserKey(key)
    ? key
    : problem(400, {
        code: "browser-key-unfit",
        detail: `${key} is no browser key.`,
      });
};

const machineBody = t.Object({
  machineId: t.Optional(t.String({ minLength: 1 })),
});

/** The person's browser routes. */
export const browserRoutes = (browsers: Browsers) =>
  new Elysia()
    .get("/api/browsers", () => browsers.list())
    .post(
      "/api/browsers/:key/takeover",
      {
        body: t.Object({
          machineId: t.Optional(t.String({ minLength: 1 })),
          requestId: t.Optional(t.String({ minLength: 1 })),
          instanceId: t.Optional(t.String({ minLength: 1 })),
        }),
      },
      async ({ params, body }) => {
        const key = keyOf(params.key);
        return key instanceof ElysiaStatus
          ? key
          : await browsers.takeover(key, body);
      }
    )
    .post(
      "/api/browsers/:key/handback",
      { body: machineBody },
      async ({ params, body }) => {
        const key = keyOf(params.key);
        return key instanceof ElysiaStatus
          ? key
          : await browsers.handback(key, body.machineId);
      }
    )
    .post(
      "/api/browsers/:key/start",
      { body: machineBody },
      async ({ params, body }) => {
        const key = keyOf(params.key);
        return key instanceof ElysiaStatus
          ? key
          : await browsers.start(key, body.machineId);
      }
    )
    .post(
      "/api/browsers/:key/stop",
      { body: machineBody },
      async ({ params, body }) => {
        const key = keyOf(params.key);
        return key instanceof ElysiaStatus
          ? key
          : await browsers.stop(key, body.machineId);
      }
    )
    .post(
      "/api/browsers/:key/remove",
      { body: machineBody },
      async ({ params, body }) => {
        const key = keyOf(params.key);
        if (key instanceof ElysiaStatus) {
          return key;
        }
        const removed: { ok: true } = { ok: true };
        return (await browsers.remove(key, body.machineId)) ?? removed;
      }
    );
