/**
 * The fleet's browsers, as the hub holds them (Projects spec §5.11): each
 * machine's `browsers` frame kept as rows (one per key per machine), the
 * `browser` artifact in the panel of every session that uses one, and the
 * person's routes. A session uses its project's browser on its own machine,
 * else its machine's (`machine:<id>`), as the machine's gate decides
 * (agent gate.ts `keyOfWorkspace`).
 *
 * - `POST /api/browsers/:key/takeover`: the person takes the browser over
 *   privately (agent shield.ts): every agent connection cut, the asking
 *   workspace's page in front, control the person's; a browser ask it
 *   answers is taken off every screen and its call waits on; the session's
 *   panel opens on its browser artifact; every other live session of the
 *   project on that machine is told in one line.
 * - `POST /api/browsers/:key/handback`: control taken back, the page loaded
 *   again, the gate open; the ask's call answers with the page's origin.
 * - `POST /api/browsers/:key/start`, `/stop`, `GET /api/browsers`.
 * - `POST /api/browsers/:key/remove`: the browser stopped and its profile
 *   deleted on its machine (its sign-ins forgotten), refused while the
 *   person holds it; answered once its row is gone. Forgetting a project
 *   removes each of its browsers this way first.
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
import type { InstanceRow } from "@cawco/core";
import {
  BROWSER_HANDBACK,
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
  type BrowserRow,
  type BrowserShieldArgs,
  isBrowserKey,
  type ListedBrowser,
  SHIELD_WORDS,
} from "@cawco/core/browser";
import { Elysia, t } from "elysia";
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
export const BROWSER_ARTIFACT_NAME = "browser";

/** How long a take-over, a start or a stop has on its machine: a start may build the image first. */
const CALL_MS = 15 * 60_000;

/** How long a browser's own stream relay credential lasts (Projects spec item 4). */
const RELAY_TTL_MS = 7 * 24 * 60 * 60_000;

/** What a machine says of a browser now, kept from its latest frame (core `BrowserRow`). */
export type LiveBrowserFacts = Pick<BrowserRow, "why" | "progress" | "origin">;

/** A refusal the routes answer with its status and the sentence. */
export class BrowserRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409 | 503;
  constructor(
    status: 400 | 403 | 404 | 409 | 503,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.status = status;
  }
}

export interface BrowsersDeps {
  /** The browser asks waiting on the person (browser-tools.ts), made after this. */
  asks: () => BrowserAsks;
  call: RelayCall;
  db: { artifacts: ArtifactsDb; browsers: BrowsersDb };
  instance: (id: string) => InstanceRow | undefined;
  /** Whether the session's work item ended: its browser artifact went with it (server.ts `endBrowserOf`), and none is made again. */
  itemEnded: (instance: InstanceRow) => boolean;
  /** The session's live peers: every session on `machineId` in `projectId` (null: in none) whose process runs; one asleep is never told. */
  liveSessions: (machineId: string, projectId: string | null) => InstanceRow[];
  machineName: (machineId: string) => string;
  /** A credential of the fleet's stream relay, or null while it has none. */
  mint: (
    userId: string,
    ttlMs: number
  ) => import("@cawco/core/browser").BrowserRelay | null;
  /** Brings an artifact to the front of its session's panel (server.ts `openPreview`). */
  open: (artifact: ArtifactRow) => Promise<{ ok: boolean; error?: string }>;
  /** Sends every dashboard the fleet's browsers, whole (core `BrowserListFrame`). */
  publish: (frame: BrowserListFrame) => void;
  /** Says something to a session, as the hub. */
  tell: (instanceId: string, text: string) => void;
  /** The gate id a session's browser door is (agent door.ts): its workspace's, else its own id. */
  workspaceOf: (instance: InstanceRow) => string | undefined;
}

/** The browser `instance` uses: its project's, else its machine's. */
export const browserKeyOf = (instance: InstanceRow): BrowserKey =>
  instance.projectId
    ? `project:${instance.projectId}`
    : `machine:${instance.machineId}`;

/** A machine's answer to a browser call, or its refusal in the person's words. */
export const answered = <T>(
  read: Awaited<ReturnType<RelayCall>>,
  machine: string,
  what: string
): T => {
  if (read.kind === "unanswered") {
    throw new BrowserRefusal(
      503,
      read.reason === "dead"
        ? `${machine} is not connected, so its browser could not ${what}. Try again once it is back.`
        : `${machine}'s browser did not ${what} in time; it may still be at it there.`
    );
  }
  if (!read.value.ok) {
    throw new BrowserRefusal(
      409,
      read.value.error ?? `${machine}'s browser did not ${what}.`
    );
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
  const machineOf = (key: BrowserKey, named: string | undefined): string => {
    if (named) {
      return named;
    }
    const rows = db.browsers.list().filter((row) => row.key === key);
    const [only] = rows;
    if (rows.length === 1 && only) {
      return only.machineId;
    }
    throw new BrowserRefusal(
      rows.length === 0 ? 404 : 409,
      rows.length === 0
        ? `No machine has reported the browser ${key}: name its machine.`
        : `The browser ${key} runs on ${rows.length} machines: name one.`
    );
  };

  /** Every dashboard told the fleet's browsers as they stand now: after each change of any. */
  const told = (): void =>
    deps.publish({ kind: "browser_list", browsers: browsers.list() });

  const keep = (machineId: string, row: BrowserRow): void => {
    db.browsers.put(machineId, rowFrom(row));
    noteLive(machineId, row);
    told();
  };

  const shield = async (
    machineId: string,
    args: BrowserShieldArgs
  ): Promise<BrowserRow> => {
    const row = answered<BrowserRow>(
      await deps.call(machineId, BROWSER_SHIELD, [args], CALL_MS),
      deps.machineName(machineId),
      "be taken over"
    );
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
      throw new BrowserRefusal(404, "That browser ask is no longer open.");
    }
    if (ask.key !== key) {
      throw new BrowserRefusal(
        400,
        `That browser ask is about ${ask.key}, not ${key}.`
      );
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

    /** A take-over its machine ended, whichever way: told before the record's frame, with the page's origin. */
    heardHandback(frame: BrowserHandedBackFrame): void {
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
    async connected(machineId: string): Promise<void> {
      const frame = answered<BrowserFrame>(
        await deps.call(machineId, BROWSER_ROWS, [], CALL_MS),
        deps.machineName(machineId),
        "say what it runs"
      );
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
        /** The person's neko session, once their view has one: control is given to it. */
        viewer?: string;
      }
    ): Promise<{ artifactId: string | null; row: BrowserRow }> {
      const ask = askOf(key, asked.requestId);
      const session = deps.instance(ask?.instanceId ?? asked.instanceId ?? "");
      const machineId =
        ask?.machineId ?? machineOf(key, asked.machineId ?? session?.machineId);
      const workspaceId = session ? deps.workspaceOf(session) : undefined;
      // Sent again (a viewer's neko session now known): the peers were told.
      const held = !!db.browsers.get(machineId, key)?.takeover;
      const row = await shield(machineId, {
        key,
        ...(workspaceId ? { workspaceId } : {}),
        ...(ask ? { origin: ask.origin, requestId: asked.requestId } : {}),
        ...(asked.viewer ? { viewer: asked.viewer } : {}),
      });
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
    async handback(
      key: BrowserKey,
      named: string | undefined
    ): Promise<BrowserHandback> {
      const machineId = machineOf(key, named);
      const back = answered<BrowserHandback>(
        await deps.call(machineId, BROWSER_HANDBACK, [{ key }], CALL_MS),
        deps.machineName(machineId),
        "be handed back"
      );
      ended(machineId, key, back.origin, back.requestId);
      return back;
    },

    async start(
      key: BrowserKey,
      named: string | undefined
    ): Promise<BrowserRow> {
      const machineId = machineOf(key, named);
      const relay = deps.mint(`browser:${key}`, RELAY_TTL_MS);
      const row = answered<BrowserRow>(
        await deps.call(
          machineId,
          BROWSER_START,
          [{ key, ...(relay ? { relay } : {}) }],
          CALL_MS
        ),
        deps.machineName(machineId),
        "start"
      );
      keep(machineId, row);
      return row;
    },

    /** Stops `key`, handed back first when the person holds it. */
    async stop(
      key: BrowserKey,
      named: string | undefined
    ): Promise<BrowserRow | null> {
      const machineId = machineOf(key, named);
      if (db.browsers.get(machineId, key)?.takeover) {
        await browsers.handback(key, machineId);
      }
      const row = answered<BrowserRow | null>(
        await deps.call(machineId, BROWSER_STOP, [{ key }], CALL_MS),
        deps.machineName(machineId),
        "stop"
      );
      if (row) {
        keep(machineId, row);
      }
      return row;
    },

    /**
     * Removes `key` on its machine: stopped, its profile (its sign-ins)
     * deleted, its row gone. Refused while the person holds it.
     */
    async remove(key: BrowserKey, named: string | undefined): Promise<void> {
      const machineId = machineOf(key, named);
      if (db.browsers.get(machineId, key)?.takeover) {
        throw new BrowserRefusal(
          409,
          "You have control of this browser now. Hand it back first, then forget its sign-ins."
        );
      }
      answered<unknown>(
        await deps.call(machineId, BROWSER_REMOVE, [{ key }], CALL_MS),
        deps.machineName(machineId),
        "be removed"
      );
      db.browsers.remove(machineId, key);
      live.delete(liveKey(machineId, key));
      told();
    },

    /**
     * A project being forgotten: each of its browsers, on every machine,
     * handed back when the person holds it, then removed. The first that
     * can't be is the forget's refusal, the project kept.
     */
    async forgetProject(projectId: string): Promise<void> {
      const key: BrowserKey = `project:${projectId}`;
      for (const row of db.browsers.list()) {
        if (row.key !== key) {
          continue;
        }
        try {
          if (row.takeover) {
            // biome-ignore lint/performance/noAwaitInLoops: one machine at a time, each answered before the next.
            await browsers.handback(key, row.machineId);
          }
          await browsers.remove(key, row.machineId);
        } catch (error) {
          // biome-ignore lint/style/useErrorCause: the cause rides the refusal's options, its third argument.
          throw new BrowserRefusal(
            error instanceof BrowserRefusal ? error.status : 503,
            `Its browser on ${deps.machineName(row.machineId)} wasn't removed: ${error instanceof Error ? error.message : String(error)} The project is kept; Forget tries again.`,
            { cause: error }
          );
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
  };
  return browsers;
};

export type Browsers = ReturnType<typeof createBrowsers>;

const keyOf = (raw: string): BrowserKey => {
  const key = decodeURIComponent(raw);
  if (!isBrowserKey(key)) {
    throw new BrowserRefusal(400, `${key} is no browser key.`);
  }
  return key;
};

const run = async <T>(work: () => Promise<T> | T): Promise<T | Response> => {
  try {
    return await work();
  } catch (error) {
    if (error instanceof BrowserRefusal) {
      return new Response(error.message, { status: error.status });
    }
    throw error;
  }
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
          viewer: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
        }),
      },
      ({ params, body }) =>
        run(() => browsers.takeover(keyOf(params.key), body))
    )
    .post(
      "/api/browsers/:key/handback",
      { body: machineBody },
      ({ params, body }) =>
        run(() => browsers.handback(keyOf(params.key), body.machineId))
    )
    .post(
      "/api/browsers/:key/start",
      { body: machineBody },
      ({ params, body }) =>
        run(() => browsers.start(keyOf(params.key), body.machineId))
    )
    .post(
      "/api/browsers/:key/stop",
      { body: machineBody },
      ({ params, body }) =>
        run(() => browsers.stop(keyOf(params.key), body.machineId))
    )
    .post(
      "/api/browsers/:key/remove",
      { body: machineBody },
      ({ params, body }) =>
        run(async () => {
          await browsers.remove(keyOf(params.key), body.machineId);
          return { ok: true as const };
        })
    );
