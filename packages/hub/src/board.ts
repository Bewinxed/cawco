import type { FramePayload } from "@cawco/core/frames";
import { invariant } from "@cawco/core/invariant";
import type { AgentRow, Envelope, InstanceRow } from "@cawco/core/protocol";
import { personsOwn } from "@cawco/core/protocol";
import { WIRE_PROTOCOL } from "@cawco/core/stream";
import { sessionLimitsReader } from "./accounts";
import { withAncestors } from "./board-ancestors";
import type { DbShape } from "./db";
import type { BoardInstanceRow } from "./db/instances";
import { listedAt } from "./db/instances";
import type { HubContext } from "./hub-context";
import type { KeepAliveRow } from "./keep-alive";
import { keepAliveState } from "./keep-alive";
import { previewTargets } from "./preview";
import type { HubSocket } from "./wire-socket";
import { isHubParent } from "./work-item-state";

export type BoardContext = Pick<
  HubContext,
  | "agentProtocols"
  | "artifactLane"
  | "artifactSessions"
  | "binaryUpdateStates"
  | "boardBase"
  | "browsers"
  | "contact"
  | "continuationTable"
  | "damagedRecords"
  | "db"
  | "findHears"
  | "fleetSyncs"
  | "handoffs"
  | "heldSessions"
  | "hubBuild"
  | "hubRun"
  | "laws"
  | "lifetime"
  | "machineCustody"
  | "machinePresence"
  | "moves"
  | "noticesSeen"
  | "owedAfterBoard"
  | "ownMachineIdRead"
  | "previewListeners"
  | "publishedAgents"
  | "publishedMetadata"
  | "publishedOverlays"
  | "publishedRows"
  | "pulses"
  | "registry"
  | "ruleEngine"
  | "sendFrame"
  | "sendsPending"
  | "storedRecent"
  | "shownFrame"
  | "speaksContract"
  | "stallOf"
  | "stalledNow"
  | "toolsMayHaveChanged"
  | "workItems"
>;

export const createBoard = (ctx: BoardContext) => {
  const withPresence = (rows: AgentRow[]): AgentRow[] =>
    rows.map((row) => {
      const custody = ctx.machineCustody.get(row.machineId);
      const visibleCustody =
        custody?.state === "available"
          ? {
              ...custody,
              instances: ctx.db
                .getInstancesByIds(custody.instances)
                .map((owner) => owner.id),
            }
          : custody;
      const away = ctx.machinePresence(row.machineId);
      return {
        ...row,
        custody: visibleCustody,
        // Live, like `status`: the window a read off it answers
        // `reconnecting` in (awayHeaders), so a reader that does not ask it
        // says the same.
        reconnectingUntil:
          away.kind === "reconnecting" && !ctx.registry.agent(row.machineId)
            ? away.until
            : null,
        // Online while its agent holds a link and, when it speaks this
        // hub's contract, once it has answered its welcome (fleet-sync.ts).
        status:
          ctx.registry.agent(row.machineId) &&
          (ctx.fleetSyncs.isReady(row.machineId) ||
            !ctx.speaksContract(ctx.agentProtocols.get(row.machineId)))
            ? "online"
            : "offline",
        // Live, like `status`: since when it has been lost, null while it answers.
        lostAt: ctx.contact.lostAt(row.machineId),
        hostsHub: row.machineId === ctx.ownMachineIdRead,
        // Additive and live, like `status` above: present only for a machine that
        // has actually reported one on this connection.
        ...(ctx.binaryUpdateStates.get(row.machineId)
          ? { binaryUpdate: ctx.binaryUpdateStates.get(row.machineId) }
          : {}),
      };
    });

  /**
   * The same law, applied to sessions — the instance of it the codebase was
   * violating.
   *
   * `instances.status` is written on lifecycle events and read back by every
   * rail as if it were a statement about now. It is not: the hub cannot see a
   * process, only the daemon can, and when the hub is not holding that daemon's
   * socket there is no one to ask. Measured in exactly that state:
   * `/api/instances` reported 178 sessions `running` on a machine carrying 42
   * `claude` processes, all of them idling at ≤1.5% CPU and 36–44 hours old,
   * with two rows touched in the last hour and a half. Every one of those
   * `running` values was true when written and had been true of nothing since.
   *
   * So a row whose machine is absent from the socket registry is served
   * `unknown`, which is precisely what the hub knows about it: not that it
   * failed, not that it is fine — that there is currently no way to find out.
   * The stored column is left alone; it is history, and history is allowed to
   * say what last happened.
   *
   * The overlay covers the values that *claim* something about a live process —
   * `running`, `starting`, `sleeping` (which claims a session is there to be
   * woken, and waking it needs the machine). `stopped`, `error` and `discarded`
   * pass through untouched: they are records of something that already
   * finished, and an unreachable machine does not make a session that was
   * deliberately stopped any less stopped. Serving `unknown` for those would
   * trade a fact for a shrug.
   *
   * Applied at the two places a session's status reaches a reader: the
   * `/api/instances` route and {@link instancesFrame}.
   */
  const withSessionPresence = <
    Row extends { id: string; machineId: string; status: string },
  >(
    rows: Row[]
  ): Row[] =>
    rows.map((row) => {
      const held = ctx.heldSessions.get(row.id);
      if (
        held &&
        ctx.registry.agent(row.machineId) &&
        (row.status === "sleeping" || row.status === "error")
      ) {
        return {
          ...row,
          status: "sleeping",
          held: { since: held.since, reason: held.reason },
        };
      }
      return ctx.registry.agent(row.machineId) ||
        (row.status !== "running" &&
          row.status !== "starting" &&
          row.status !== "sleeping")
        ? row
        : { ...row, status: "unknown" };
    });

  /**
   * The rows every reader of the board is handed: the presence overlay, and
   * no `tooling`. A session's MCP servers and tools were 62% of the first
   * dashboard frame (1.29 MB of 2.1 MB over 1,095 rows) and only the `/`
   * palette of an open session reads them, so they travel per session
   * instead: on the newest transcript page's facts when a view opens, and the
   * live `init` frame after that.
   */
  const withDelegates = <Row extends { id: string }>(rows: Row[]) => {
    const counts = ctx.db.runningDelegateCounts();
    return rows.map((row) => ({
      ...row,
      runningDelegates: counts.get(row.id) ?? 0,
    }));
  };
  const withKeepAlive = <
    Row extends
      KeepAliveRow | ReturnType<DbShape["listBoardInstances"]>[number],
  >(
    rows: Row[]
  ) => {
    const now = Date.now();
    const limits = sessionLimitsReader(ctx.db, now);
    return rows.map((row) => {
      const {
        keepAliveEnabled: _enabled,
        keepAliveSent: _sent,
        keepAliveStopped: _stopped,
        cacheCold: _cold,
        keepAliveTurn: _turn,
        cacheTtl: _ttl,
        contextTokens: _contextTokens,
        contextReadAt: _contextReadAt,
        ...visible
      } = row;
      return {
        ...visible,
        keepAlive: keepAliveState(row as KeepAliveRow, limits(row), now),
      };
    });
  };
  /** The rows the database changed since the last publish took them. */
  const boardMoved = new Set<string>();
  const refreshBoard = (): void => {
    const changed = ctx.db.takeChangedInstances();
    if (changed.length === 0) {
      return;
    }
    ctx.findHears(changed);
    const fresh = new Map(
      ctx.db
        .listedBoardInstancesByIds(changed)
        .map((row) => [row.id, row] as const)
    );
    for (const id of changed) {
      const row = fresh.get(id);
      if (row) {
        ctx.boardBase.set(id, row);
      } else {
        ctx.boardBase.delete(id);
      }
      boardAncestorRows.delete(id);
      boardMoved.add(id);
    }
  };
  /**
   * Ancestors of listed rows the board does not keep (stopped, failed or
   * gone from the listing a day ago), as the database last gave them, by
   * id; null for an id it has no row for. A change to one drops it here
   * ({@link refreshBoard}), and it is read again when a row still nests
   * under it.
   */
  const boardAncestorRows = new Map<string, BoardInstanceRow | null>();
  /** Rows by id for the board's ancestors: the board's own first, then the database's. */
  const boardRowsByIds = (ids: string[]): Map<string, BoardInstanceRow> => {
    const out = new Map<string, BoardInstanceRow>();
    const unread: string[] = [];
    for (const id of ids) {
      const kept = ctx.boardBase.get(id) ?? boardAncestorRows.get(id);
      if (kept) {
        out.set(id, kept);
      } else if (!boardAncestorRows.has(id)) {
        unread.push(id);
      }
    }
    if (unread.length > 0) {
      const read = new Map(
        ctx.db.boardAncestors(unread).map((row) => [row.id, row] as const)
      );
      for (const id of unread) {
        const row = read.get(id) ?? null;
        boardAncestorRows.set(id, row);
        if (row) {
          out.set(id, row);
        }
      }
    }
    return out;
  };
  /** The rows the board lists now, as the database holds them. */
  const boardShown = (): BoardInstanceRow[] => {
    refreshBoard();
    const now = Date.now();
    const shown: BoardInstanceRow[] = [];
    for (const row of ctx.boardBase.values()) {
      if (row.kind !== "summariser" && listedAt(row, now)) {
        shown.push(row);
      }
    }
    return shown;
  };
  /**
   * Rows as every reader of the board is handed them: what the database
   * does not hold laid over each (presence, damage, running delegates,
   * keep-alive, its queued sends, its owed move, its stall). Whether its
   * work item is live was read to list it, and goes no further.
   */
  const asBoard = (rows: BoardInstanceRow[]) => {
    const listed = rows.map(({ workLive: _workLive, ...row }) => row);
    // The move a person asked of each session that it still owes, off its
    // one record (`owedMoves`, read here from the database: the board is
    // first read before that is declared). A move of the hub's own
    // (rebalance's, the at-limit controller's) says itself when it lands.
    const owed = new Map(ctx.db.owedMoves.list());
    // Each session stopped at its limit, in the at-limit controller's words:
    // its row, head and transcript show the stop as an error.
    const stalled = new Set(ctx.stalledNow());
    const board = withKeepAlive(
      withDelegates(ctx.damagedRecords.overlay(withSessionPresence(listed)))
    ).map((row) => {
      const one = owed.get(row.id);
      const stall = stalled.has(row.id) ? ctx.stallOf(row.id) : undefined;
      const queued = ctx.sendsPending.count(row.id);
      return {
        ...row,
        ...(queued > 0 ? { queuedSends: queued } : {}),
        ...(one?.to !== undefined && one.byHand
          ? { owedMove: { accountId: one.to, waits: one.waits } }
          : {}),
        ...(stall ? { stalled: stall } : {}),
      };
    });
    // Law `running-session-machine-connected` (core invariant.ts), paired
    // with the overlay above: checked on the rows as they leave for a reader,
    // after every overlay laid on them, so no later one serves a stored
    // `running` as now. A row that breaks it fails the board's frame or
    // request (laws.ts).
    for (const row of board) {
      invariant(
        row.status !== "running" || ctx.registry.agent(row.machineId),
        "running-session-machine-connected",
        () =>
          `Session ${row.id} was about to be served running on machine ${row.machineId}, which holds no socket at the hub.`
      );
    }
    return board;
  };
  // Each listed row comes with the sessions it nests under, and one whose
  // chain names a session the hub no longer has is not listed at all
  // (board-ancestors.ts).
  const boardRows = () =>
    asBoard(withAncestors(boardShown(), boardRowsByIds, isHubParent));

  /**
   * What the hub holds behind stored transcripts (stored-recent.ts), asked
   * by their harness keys: the keys no session wraps (transcripts run outside CawCo), and
   * the sessions wrapping the rest that the board no longer lists, where
   * the session at the top of their chain is the person's own (core
   * `personsOwn`), each with the sessions it nests under, as the board
   * hands a row. A session the person neither started nor wrote in leaves
   * every list with the board, as before; one whose chain names a session
   * the hub no longer has stands nowhere (board-ancestors.ts).
   */
  const storedSessions = (
    keys: string[]
  ): { rows: InstanceRow[]; unwrapped: string[] } => {
    const wrapping = ctx.db
      .boardSessionsWrapping(keys)
      .filter((row) => row.kind !== "summariser");
    const wrapped = new Set(wrapping.map((row) => row.sessionId));
    const listed = new Map(
      withAncestors(boardShown(), boardRowsByIds, isHubParent).map(
        (row) => [row.id, row] as const
      )
    );
    const nested = new Map(
      withAncestors(
        wrapping.filter((row) => !listed.has(row.id)),
        boardRowsByIds,
        isHubParent
      ).map((row) => [row.id, row] as const)
    );
    /** The session at the top of a row's chain, among the rows held here. */
    const topOf = (row: BoardInstanceRow): BoardInstanceRow => {
      const seen = new Set<string>();
      let at = row;
      while (at.parentInstanceId && !seen.has(at.id)) {
        seen.add(at.id);
        const parent =
          nested.get(at.parentInstanceId) ?? listed.get(at.parentInstanceId);
        if (!parent) {
          break;
        }
        at = parent;
      }
      return at;
    };
    return {
      unwrapped: keys.filter((key) => !wrapped.has(key)),
      rows: asBoard(
        [...nested.values()].filter(
          (row) => !listed.has(row.id) && personsOwn(topOf(row))
        )
      ),
    };
  };

  /** Everything an `instances` frame carries besides the rows themselves. */
  const boardExtras = () => ({
    agents: withPresence(ctx.db.listAgents()),
    previews: [...previewTargets].map(([id, target]) =>
      ctx.shownFrame(id, target, false)
    ),
    handoffs: Object.fromEntries(ctx.handoffs),
    // Carried on every publish, so a dashboard follows a continuation it
    // started over the socket rather than over the request that started it.
    continuations: ctx.continuationTable(),
    // A screen that connects is handed every move; each change after
    // arrives on the `moves` frame.
    moves: ctx.moves.table(),
    // Carried on every publish too: a notice acknowledged on one device
    // leaves every other one live, and is never shown after a reload.
    noticesSeen: ctx.noticesSeen.ids(),
    // A damaged record says so, and notices are off until it is reset.
    noticesDamaged: ctx.noticesSeen.damaged(),
    // Every former id, whole: a session folded into its continuation leaves
    // a tab on its id for the session it is now.
    formerIds: ctx.db.formerIds(),
    // The fleet's preview mode: a switch moves every origin, so a decision
    // page a dashboard loaded on its own (PageFrame) loads again.
    previewSettings: ctx.previewListeners.settings(),
    // `hubBuild` lets a client tell a hub that is
    // behind from a machine that is. `protocol` is the wire this hub speaks:
    // a page built for an older one reloads itself on its first frame.
    hubBuild: ctx.hubBuild,
    protocol: WIRE_PROTOCOL,
    // The numbering this socket's streams count in: a page of the same run
    // resumes from its `seq`.
    hubRun: ctx.hubRun,
  });

  const instancesFrame = (
    machineId: string,
    rows: ReturnType<typeof boardRows> = boardRows()
  ): Envelope => ({
    verb: "frames",
    machineId,
    payload: {
      kind: "instances",
      instances: rows,
      ...boardExtras(),
      // Seed now-state once per connection; updates have per-session frames.
      pulses: Object.fromEntries(ctx.pulses),
    },
  });

  /**
   * A dashboard's first frames, as its socket opens: the board, before it is
   * asked for, so the rail fills before the REST snapshot lands. A law broken
   * on the board fails this snapshot (laws.ts), and the break goes to every
   * dashboard, this one among them; a snapshot that went is followed by
   * every law caught broken before it. Then the fleet's browsers, whole, to
   * a page on this wire: a browser view paints from them and follows each
   * `browser_list` frame after, never polling.
   */
  const greetDashboard = (ws: HubSocket, older: boolean): void => {
    const board = ctx.laws.hold(() => instancesFrame(""));
    const broken = ctx.laws.broken();
    if (board) {
      ctx.sendFrame(ws, board);
      for (const payload of ctx.owedAfterBoard(broken)) {
        ctx.sendFrame(ws, {
          verb: "frames",
          machineId: "hub",
          payload,
        } satisfies Envelope<FramePayload>);
      }
      // Then Recent's stored transcripts, whole (stored-recent.ts).
      const stored = ctx.laws.hold(ctx.storedRecent.now);
      if (stored) {
        ctx.sendFrame(ws, {
          verb: "frames",
          machineId: "hub",
          payload: { kind: "stored", stored },
        } satisfies Envelope<FramePayload>);
      }
    }
    if (!older) {
      ctx.sendFrame(ws, {
        verb: "frames",
        machineId: "hub",
        payload: { kind: "browser_list", browsers: ctx.browsers.list() },
      } satisfies Envelope<FramePayload>);
    }
  };
  const overlayOf = (row: ReturnType<typeof boardRows>[number]): string =>
    JSON.stringify([
      row.status,
      "held" in row ? row.held : null,
      "damaged" in row ? row.damaged : null,
      row.runningDelegates,
      row.keepAlive,
      "owedMove" in row ? row.owedMove : null,
      "stalled" in row ? row.stalled : null,
      "queuedSends" in row ? row.queuedSends : null,
    ]);

  const pendingInstancePublishes = new Set<string>();
  let instancePublishScheduled = false;
  const publishInstances = (machineId: string): void => {
    // A session's model, project or harness can move under a live rule; every
    // move republishes, so this is the one place that has to drop the cache.
    ctx.ruleEngine.forgetFacts();
    ctx.toolsMayHaveChanged();
    // A session ending ends its artifacts' asks (Needs you's rule 4).
    ctx.artifactLane.moved();
    pendingInstancePublishes.add(machineId);
    if (instancePublishScheduled) {
      return;
    }
    instancePublishScheduled = true;
    // On the hub's lifetime, as all its own schedule is: a hub closed first
    // (scripts/openapi.ts closes its scratch hub) publishes nothing after.
    ctx.lifetime.after(0, () => {
      instancePublishScheduled = false;
      const machines = [...pendingInstancePublishes];
      pendingInstancePublishes.clear();
      publishInstanceDelta(machines.length === 1 ? machines[0] : "");
    });
  };

  const publishInstanceDelta = (machineId: string): void => {
    // A law broken on the board fails this publish (laws.ts): what moved
    // stays owed to the next one.
    const rows = ctx.laws.hold(boardRows);
    // A row, a machine or a preview may have moved: an artifact's tab hears
    // what moved of its own session, before the board's own early return.
    ctx.artifactSessions.refresh();
    if (rows) {
      publishBoardDelta(machineId, rows);
    }
  };

  /** The board's rows, `rows`, sent as what moved since the last publish. */
  const publishBoardDelta = (
    machineId: string,
    rows: ReturnType<typeof boardRows>
  ): void => {
    const moved = new Set(boardMoved);
    boardMoved.clear();
    // A work item follows its session's life: of every row the database
    // changed since the last publish (its change log, whichever path wrote
    // it — a failed process, a register's settle, a refused restore), one in
    // `error` or gone fails its live item (work-items `followSessions`).
    if (moved.size > 0) {
      ctx.workItems.followSessions(moved);
    }
    const upserts: ReturnType<typeof boardRows> = [];
    const present = new Set<string>();
    for (const row of rows) {
      present.add(row.id);
      const overlay = overlayOf(row);
      if (
        !moved.has(row.id) &&
        ctx.publishedOverlays.get(row.id) === overlay &&
        ctx.publishedRows.has(row.id)
      ) {
        continue;
      }
      ctx.publishedOverlays.set(row.id, overlay);
      const serialised = JSON.stringify(row);
      if (ctx.publishedRows.get(row.id) !== serialised) {
        ctx.publishedRows.set(row.id, serialised);
        upserts.push(row);
      }
    }
    const removed: string[] = [];
    for (const id of ctx.publishedRows.keys()) {
      if (!present.has(id)) {
        ctx.publishedRows.delete(id);
        ctx.publishedOverlays.delete(id);
        removed.push(id);
      }
    }
    const delta: Extract<FramePayload, { kind: "instances_delta" }> = {
      kind: "instances_delta",
      upserts,
      removed,
      ...boardMetadataDelta(),
    };
    if (
      upserts.length === 0 &&
      removed.length === 0 &&
      Object.keys(delta).length === 3
    ) {
      return;
    }
    ctx.registry.broadcastBoard(
      { verb: "frames", machineId, payload: delta },
      () => instancesFrame(machineId, rows)
    );
  };

  /** No pulse snapshots on publishes: each session already has its own stream. */
  const boardMetadataDelta = (): Partial<
    Extract<FramePayload, { kind: "instances_delta" }>
  > => {
    const extras = boardExtras();
    const delta: ReturnType<typeof boardMetadataDelta> = {};
    const agents = extras.agents.filter((row) => {
      const serialised = JSON.stringify(row);
      if (ctx.publishedAgents.get(row.machineId) === serialised) {
        return false;
      }
      ctx.publishedAgents.set(row.machineId, serialised);
      return true;
    });
    const machineIds = new Set(extras.agents.map((row) => row.machineId));
    const removedAgents = [...ctx.publishedAgents.keys()].filter(
      (id) => !machineIds.has(id)
    );
    for (const id of removedAgents) {
      ctx.publishedAgents.delete(id);
    }
    if (agents.length > 0) {
      delta.agents = agents;
    }
    if (removedAgents.length > 0) {
      delta.removedAgents = removedAgents;
    }
    for (const key of [
      "previews",
      "handoffs",
      "continuations",
      "formerIds",
      "noticesSeen",
      "noticesDamaged",
      "previewSettings",
    ] as const) {
      const serialised = JSON.stringify(extras[key]);
      if (ctx.publishedMetadata.get(key) !== serialised) {
        ctx.publishedMetadata.set(key, serialised);
        Object.assign(delta, { [key]: extras[key] });
      }
    }
    // The notices record's damage moved (a Reset): its ids go with it, so a
    // client that cannot tell a null from an absent field (the Apple app's
    // generated decoder) still hears the record is whole again.
    if ("noticesDamaged" in delta) {
      delta.noticesSeen = extras.noticesSeen;
    }
    return delta;
  };

  return {
    withPresence,
    withSessionPresence,
    withKeepAlive,
    boardMoved,
    refreshBoard,
    boardRows,
    storedSessions,
    boardExtras,
    greetDashboard,
    overlayOf,
    publishInstances,
  };
};
