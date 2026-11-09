import { GO_WITH_MACHINE, MACHINE_MOVED } from "./owned-rows";
/** Machines: each one's row, what its daemon reports, and re-keying and removing one. */

import type {
  FleetItemStatus,
  FleetSyncOutcome,
  FleetSyncReport,
} from "@cawco/core/fleet";
import type { HarnessReport } from "@cawco/core/harness";
import type { HarnessKind, PermissionMode } from "@cawco/core/harness/kinds";
import {
  type MachinePath,
  MachinePathRefused,
  machinePath,
} from "@cawco/core/machine-path";
import type {
  AgentRow,
  BuildInfo,
  RunKind,
  StoppedCommands,
} from "@cawco/core/protocol";
import type { ToolStatus } from "@cawco/core/tools";
import { stoppedWords } from "@cawco/core/words/machine-pause";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { DbCore } from "./core";
import {
  agentHarnesses,
  agents,
  agentTools,
  chosenModes,
  instances,
  projectPlaces,
  removedMachines,
} from "./schema";
import type { Tx } from "./tx";

export type AgentAuth = (typeof agents.$inferSelect)["auth"];

/** How many rows moved, by what they are: what a re-key answers. */
type Moved = (what: string, count: number) => void;

/**
 * Rows of `table` whose `column` names `from`. Through `all`: bun-sqlite's
 * `get` of raw SQL answers the row as an array of values.
 */
const naming = (tx: Tx, table: string, column: string, from: string) =>
  tx.all<{ n: number }>(
    sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${from}`
  )[0]?.n ?? 0;

/**
 * The machine's row, with what its daemon last reported, onto `to`, unless
 * `to` registered already: then that row is the current one, and `from`'s
 * goes with its reports.
 */
/** Whether the hub keeps a row for the machine. */
const machineKept = (tx: Tx, machineId: string): boolean =>
  tx
    .select({ machineId: agents.machineId })
    .from(agents)
    .where(eq(agents.machineId, machineId))
    .get() !== undefined;

export interface MachinesDb {
  /** The machine's fleet generation and the fingerprint of what it was to hold at it (hub fleet-sync.ts); generation 0 for a machine never sent one. */
  readonly agentFleetGeneration: (machineId: string) => {
    fingerprint: string | null;
    generation: number;
  };
  readonly agentHarnesses: (machineId: string) => HarnessReport[] | undefined;
  /**
   * One machine's row as {@link listAgents} shapes it, read alone: what
   * `GET /api/agents/:machineId` answers, which an update's trial asks every
   * second through a loaded hub, so it reads that machine's cells and no
   * other's. Undefined when the hub knows no such machine.
   */
  readonly agentRow: (machineId: string) => AgentRow | undefined;
  /** A machine's last-known tool status by id; empty for one that never reported. */
  readonly agentTools: (machineId: string) => Record<string, ToolStatus>;
  /** Files `mode` as the one the person last chose for `harness` on `machineId`. */
  readonly chooseMode: (
    machineId: string,
    harness: HarnessKind,
    mode: PermissionMode
  ) => void;
  /** The permission mode the person last chose for `harness` on `machineId` (schema `chosenModes`); none when never. */
  readonly chosenMode: (
    machineId: string,
    harness: string
  ) => PermissionMode | undefined;
  /**
   * Forgets a machine's entry, its places and its current limit reading;
   * hidden session ownership remains until its stored delete decisions are
   * confirmed by that machine. Spend and limit history stay, because they
   * happened. A project whose primary checkout was there moves it to its
   * next checkout, or has none yet; every project keeps its folder on the
   * hub, so none goes. Its name and the time are kept in `removed_machines`:
   * what reads of the rows that still name it say it was. Answers which
   * sessions went, for the confirm's receipt.
   */
  readonly deleteMachine: (machineId: string) => {
    instanceIds: string[];
  };
  /**
   * Every machine, in the shape everything downstream reads them: the `fleet`
   * column is null until a machine has synced once, and `AgentRow` says absent.
   */
  readonly listAgents: () => AgentRow[];
  /**
   * `raw` as a path on `machineId` ({@link machinePath}), against the home
   * that machine's daemon reported. Every path a person or a session names
   * for a machine comes through here before anything stores or runs in it.
   * A path it will not make answers its {@link MachinePathRefused}, the
   * sentence the caller refuses with.
   */
  readonly machinePathOn: (
    machineId: string,
    raw: string
  ) => MachinePath | MachinePathRefused;
  readonly markAgentOffline: (machineId: string) => void;
  /** The machine answered its welcome (hub fleet-sync.ts): it is online. */
  readonly markAgentReady: (machineId: string) => void;
  /**
   * Every row back to `offline`, for the one moment it is unconditionally true:
   * hub startup. The `status` column only ever goes to `offline` from the socket
   * close handler, and a hub that died — crashed, was restarted, was upgraded —
   * ran no close handlers, so every machine it was holding is left claiming
   * `online` in a database the new process has never spoken to. This process
   * holds no sockets until a daemon registers, so on the first line of its life
   * the honest value for every row is `offline`; presence is re-earned by a
   * register, not inherited from a previous life.
   *
   * `lastSeenAt` is deliberately NOT touched: when the machine was last heard
   * from is history, and history survives a restart. Only reachability is reset.
   */
  readonly markAllAgentsOffline: () => void;
  /**
   * What each harness on the machine can do, as its daemon's report beat
   * said: every harness the beat names is replaced, and one it leaves out
   * keeps its last report, since its daemon could not read it this time.
   */
  readonly mergeAgentHarnesses: (
    machineId: string,
    harnesses: HarnessReport[]
  ) => void;
  /** A whole report: every id it names is replaced, every other cell survives. */
  readonly mergeAgentTools: (machineId: string, statuses: ToolStatus[]) => void;
  /** Every machine by its id and hostname, in {@link listAgents}' order: what a machine's name is read from. */
  readonly namedMachines: () => { hostname: string; machineId: string }[];
  /**
   * A machine that re-joined under a new id (its id follows its hostname,
   * core machine-id.ts) is the machine it was: every row that named `from`
   * names `to`, in one transaction. Its machine row moves whole unless `to`
   * has one already (then `to`'s stands); a row keyed by machine that `to`
   * already holds (its key, a place, a sign-in, a usage bucket) stays `to`'s,
   * and `from`'s goes. A check that named `from` by id names `to`. Answers
   * how many rows moved, by table.
   */
  readonly rekeyMachine: (from: string, to: string) => Record<string, number>;
  /** The machines the person removed ({@link deleteMachine}), by id. */
  readonly removedMachines: () => (typeof removedMachines.$inferSelect)[];
  /**
   * A machine's word on Claude, as a beat's Claude report says it (a keychain
   * unlocked from the dashboard, a login gone under it). Answers whether the
   * row moved.
   */
  readonly setAgentAuth: (machineId: string, auth: AgentAuth) => boolean;
  /** What the machine has installed, as its latest capabilities beat said. */
  readonly setAgentCapabilities: (
    machineId: string,
    capabilities: import("@cawco/core/capabilities").MachineCapabilities
  ) => void;
  /** A machine's own account of what it came to, from the sync it just answered. */
  readonly setAgentFleet: (machineId: string, report: FleetSyncReport) => void;
  /** The machine's fleet generation and the fingerprint of what it is to hold at it (hub fleet-sync.ts). */
  readonly setAgentFleetGeneration: (
    machineId: string,
    generation: number,
    fingerprint: string
  ) => void;
  /** Each fleet item as the machine converges it (hub fleet-sync.ts), by item id. */
  readonly setAgentFleetItems: (
    machineId: string,
    items: Record<string, FleetItemStatus>
  ) => void;
  /** What became of the last delta the hub sent the machine (hub fleet-sync.ts). */
  readonly setAgentFleetSync: (
    machineId: string,
    outcome: FleetSyncOutcome
  ) => void;
  readonly setAgentToolCell: (machineId: string, status: ToolStatus) => void;
  /**
   * Pauses a machine until `until`, with what the pause stopped as it began,
   * or ends its pause (null, null); false when no such machine (machine-pause.ts).
   */
  readonly setMachinePause: (
    machineId: string,
    until: Date | null,
    stopped: StoppedCommands | null
  ) => boolean;
  readonly touchAgent: (machineId: string) => void;
  /**
   * A machine registered: its row, and off the removed list if it was on it.
   * A register carries no word on Claude and no capabilities (each follows on
   * a beat of its own: {@link setAgentAuth}, {@link setAgentCapabilities}), so
   * the row keeps what it had of both; a new row's auth is `unknown`.
   */
  readonly upsertAgent: (agent: {
    machineId: string;
    hostname: string;
    os: string;
    /** Set by a seed, never by a register. */
    auth?: AgentAuth;
    /** Absent from a register with nothing new to say about it; the row keeps what it had. */
    build?: BuildInfo;
    /** The machine's home folder, absolute; absent from a daemon that does not say it. */
    home?: string;
    /**
     * Online at once: a seed, or an agent of an older contract. One that
     * speaks this hub's is online once it answers its welcome
     * ({@link markAgentReady}); until then it reads offline.
     */
    online?: boolean;
  }) => void;
}

export const machinesDb = (core: DbCore): MachinesDb => {
  const { db } = core;

  const moveMachineRow = (tx: Tx, from: string, to: string, note: Moved) => {
    const row = tx
      .select()
      .from(agents)
      .where(eq(agents.machineId, from))
      .get();
    if (row && !machineKept(tx, to)) {
      tx.insert(agents)
        .values({ ...row, machineId: to })
        .run();
      note("agents", 1);
      note("agent_tools", naming(tx, "agent_tools", "machine_id", from));
      tx.update(agentTools)
        .set({ machineId: to })
        .where(eq(agentTools.machineId, from))
        .run();
      note(
        "agent_harnesses",
        naming(tx, "agent_harnesses", "machine_id", from)
      );
      tx.update(agentHarnesses)
        .set({ machineId: to })
        .where(eq(agentHarnesses.machineId, from))
        .run();
    }
    tx.delete(agentTools).where(eq(agentTools.machineId, from)).run();
    tx.delete(agentHarnesses).where(eq(agentHarnesses.machineId, from)).run();
    tx.delete(agents).where(eq(agents.machineId, from)).run();
  };

  /** A tool's row as the status the wire carries: what it does not say is left out. */
  const toolStatusOf = (row: typeof agentTools.$inferSelect): ToolStatus => ({
    id: row.toolId,
    state: row.state,
    at: row.at.getTime(),
    ...(row.version === null ? {} : { version: row.version }),
    ...(row.method === null ? {} : { method: row.method }),
    ...(row.detail === null ? {} : { detail: row.detail }),
    ...(row.signin === null ? {} : { signin: row.signin }),
  });

  /** Each machine's tool statuses by catalog id; one machine's with `machineId`. */
  const toolsByMachine = (
    machineId?: string
  ): Map<string, Record<string, ToolStatus>> => {
    const byMachine = new Map<string, Record<string, ToolStatus>>();
    for (const row of db
      .select()
      .from(agentTools)
      .where(
        machineId === undefined
          ? undefined
          : eq(agentTools.machineId, machineId)
      )
      .all()) {
      byMachine.set(row.machineId, {
        ...byMachine.get(row.machineId),
        [row.toolId]: toolStatusOf(row),
      });
    }
    return byMachine;
  };

  const toolsOf = (machineId: string): Record<string, ToolStatus> =>
    toolsByMachine(machineId).get(machineId) ?? {};

  /** Each status over the machine's cell for its tool, the rest kept, in one transaction. */
  const putToolCells = (machineId: string, statuses: ToolStatus[]): void => {
    db.transaction((tx) => {
      // A machine the hub keeps no row for has no cells to keep.
      if (!machineKept(tx, machineId)) {
        return;
      }
      for (const status of statuses) {
        const cell = {
          state: status.state,
          version: status.version ?? null,
          method: status.method ?? null,
          detail: status.detail ?? null,
          signin: status.signin ?? null,
          at: new Date(status.at),
        };
        tx.insert(agentTools)
          .values({ machineId, toolId: status.id, ...cell })
          .onConflictDoUpdate({
            target: [agentTools.machineId, agentTools.toolId],
            set: cell,
          })
          .run();
      }
    });
  };

  /** Each machine's harness reports, in the order they were last reported; one machine's with `machineId`. */
  const harnessesByMachine = (
    machineId?: string
  ): Map<string, HarnessReport[]> => {
    const byMachine = new Map<string, HarnessReport[]>();
    for (const row of db
      .select()
      .from(agentHarnesses)
      .where(
        machineId === undefined
          ? undefined
          : eq(agentHarnesses.machineId, machineId)
      )
      .orderBy(sql`rowid`)
      .all()) {
      byMachine.set(row.machineId, [
        ...(byMachine.get(row.machineId) ?? []),
        row.report,
      ]);
    }
    return byMachine;
  };

  /** Each machine's chosen permission mode by harness (schema `chosenModes`). */
  const chosenModesByMachine = (
    machineId?: string
  ): Map<string, Partial<Record<HarnessKind, PermissionMode>>> => {
    const byMachine = new Map<
      string,
      Partial<Record<HarnessKind, PermissionMode>>
    >();
    for (const row of db
      .select()
      .from(chosenModes)
      .where(
        machineId === undefined
          ? undefined
          : eq(chosenModes.machineId, machineId)
      )
      .all()) {
      byMachine.set(row.machineId, {
        ...byMachine.get(row.machineId),
        [row.harness]: row.permissionMode,
      });
    }
    return byMachine;
  };

  /**
   * Machines' rows in the shape everything downstream reads them, each with
   * its tools, harness reports and chosen modes; with `machineId`, the cells
   * of that machine alone are read ({@link DbShape.agentRow}).
   */
  const agentRows = (
    rows: (typeof agents.$inferSelect)[],
    machineId?: string
  ): AgentRow[] => {
    const toolCells = toolsByMachine(machineId);
    const reports = harnessesByMachine(machineId);
    const modes = chosenModesByMachine(machineId);
    return rows.map(
      ({
        fleet,
        fleetSync,
        fleetItems,
        fleetGeneration: _generation,
        fleetFingerprint: _fingerprint,
        build,
        home,
        machineCapabilities,
        pausedUntil,
        pauseStopped,
        ...agent
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one optional field per nullable column, each left out of the row while null
      }) => {
        const harnesses = reports.get(agent.machineId);
        const chosen = modes.get(agent.machineId);
        return {
          ...agent,
          tools: toolCells.get(agent.machineId) ?? {},
          pausedUntil: pausedUntil?.getTime() ?? null,
          pauseStopped: (pauseStopped && stoppedWords(pauseStopped)) || null,
          ...(fleet ? { fleet } : {}),
          ...(fleetSync ? { fleetSync } : {}),
          ...(fleetItems ? { fleetItems } : {}),
          ...(build ? { build } : {}),
          ...(harnesses ? { harnesses } : {}),
          ...(chosen ? { chosenModes: chosen } : {}),
          ...(home ? { home } : {}),
          ...(machineCapabilities ? { machineCapabilities } : {}),
        };
      }
    );
  };

  return {
    machinePathOn: (machineId, raw) => {
      const agent = db
        .select({ home: agents.home, hostname: agents.hostname })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      try {
        return machinePath(agent?.home, raw, agent?.hostname ?? machineId);
      } catch (error) {
        if (error instanceof MachinePathRefused) {
          return error;
        }
        throw error;
      }
    },
    agentHarnesses: (machineId) => harnessesByMachine(machineId).get(machineId),
    chosenMode: (machineId, harness) =>
      db
        .select({ mode: chosenModes.permissionMode })
        .from(chosenModes)
        .where(
          and(
            eq(chosenModes.machineId, machineId),
            eq(chosenModes.harness, harness as HarnessKind)
          )
        )
        .get()?.mode,
    chooseMode: (machineId, harness, mode) => {
      const row = {
        machineId,
        harness,
        permissionMode: mode,
        chosenAt: new Date(),
      };
      db.insert(chosenModes)
        .values(row)
        .onConflictDoUpdate({
          target: [chosenModes.machineId, chosenModes.harness],
          set: { permissionMode: mode, chosenAt: row.chosenAt },
        })
        .run();
    },
    upsertAgent: ({
      machineId,
      hostname,
      os,
      auth,
      build,
      home,
      online = true,
    }) => {
      const lastSeenAt = new Date();
      const status = online ? "online" : "offline";
      db.insert(agents)
        .values({
          machineId,
          hostname,
          os,
          ...(auth ? { auth } : {}),
          status,
          lastSeenAt,
          build,
          home,
        })
        .onConflictDoUpdate({
          target: agents.machineId,
          set: {
            hostname,
            os,
            ...(auth ? { auth } : {}),
            status,
            lastSeenAt,
            ...(build ? { build } : {}),
            ...(home ? { home } : {}),
          },
        })
        .run();
      // A removed machine whose agent starts again is on the fleet again.
      db.delete(removedMachines)
        .where(eq(removedMachines.machineId, machineId))
        .run();
    },
    markAgentReady: (machineId) => {
      db.update(agents)
        .set({ status: "online", lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentCapabilities: (machineId, machineCapabilities) => {
      db.update(agents)
        .set({ machineCapabilities })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentAuth: (machineId, auth) =>
      db
        .update(agents)
        .set({ auth })
        .where(and(eq(agents.machineId, machineId), ne(agents.auth, auth)))
        .returning({ machineId: agents.machineId })
        .all().length > 0,
    // A beat says the machine is there, not that it is ready: only its
    // register (an older contract) or its welcome's answer puts it online.
    touchAgent: (machineId) => {
      db.update(agents)
        .set({ lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    markAgentOffline: (machineId) => {
      db.update(agents)
        .set({ status: "offline", lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    // No `lastSeenAt` here, unlike its single-machine sibling above: that write
    // means "I just heard from it", and starting up is not hearing from anyone.
    markAllAgentsOffline: () => {
      db.update(agents).set({ status: "offline" }).run();
    },
    agentTools: toolsOf,
    // The cells reported replace their own; a tool the report did not name
    // keeps what it had.
    mergeAgentTools: (machineId, statuses) => {
      putToolCells(machineId, statuses);
    },
    // The harnesses reported replace their own rows, read after the ones this
    // report did not name; every other harness stays as it was.
    mergeAgentHarnesses: (machineId, reports) => {
      db.transaction((tx) => {
        if (!machineKept(tx, machineId)) {
          return;
        }
        const latest = [
          ...new Map(
            reports.map((report) => [report.harness, report])
          ).values(),
        ];
        for (const report of latest) {
          tx.delete(agentHarnesses)
            .where(
              and(
                eq(agentHarnesses.machineId, machineId),
                eq(agentHarnesses.harness, report.harness)
              )
            )
            .run();
        }
        if (latest.length > 0) {
          tx.insert(agentHarnesses)
            .values(
              latest.map((report) => ({
                machineId,
                harness: report.harness,
                report,
              }))
            )
            .run();
        }
      });
    },
    setAgentToolCell: (machineId, status) => {
      putToolCells(machineId, [status]);
    },
    // Its id and hostname alone: a machine named in a sentence read every
    // machine's row whole (its fleet, its harnesses, its tools), once per
    // session an account wake named, at each hub start on a copy of the
    // live database.
    namedMachines: () =>
      db
        .select({ machineId: agents.machineId, hostname: agents.hostname })
        .from(agents)
        .orderBy(asc(agents.createdAt), asc(agents.machineId))
        .all(),
    setAgentFleet: (machineId, report) => {
      db.update(agents)
        .set({ fleet: report })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentFleetItems: (machineId, items) => {
      db.update(agents)
        .set({ fleetItems: items })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    agentFleetGeneration: (machineId) => {
      const row = db
        .select({
          generation: agents.fleetGeneration,
          fingerprint: agents.fleetFingerprint,
        })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      return row ?? { generation: 0, fingerprint: null };
    },
    setAgentFleetGeneration: (machineId, generation, fingerprint) => {
      db.update(agents)
        .set({ fleetGeneration: generation, fleetFingerprint: fingerprint })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentFleetSync: (machineId, outcome) => {
      db.update(agents)
        .set({ fleetSync: outcome })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    // A pause moved while it lasts keeps what it stopped already, and adds
    // what it stopped this time.
    setMachinePause: (machineId, until, stopped) => {
      const row = db
        .select({ pauseStopped: agents.pauseStopped })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      if (!row) {
        return false;
      }
      const kept: StoppedCommands = until ? { ...row.pauseStopped } : {};
      for (const [kind, count] of Object.entries(stopped ?? {}) as [
        RunKind,
        number,
      ][]) {
        kept[kind] = (kept[kind] ?? 0) + count;
      }
      db.update(agents)
        .set({
          pausedUntil: until,
          pauseStopped: Object.keys(kept).length > 0 ? kept : null,
        })
        .where(eq(agents.machineId, machineId))
        .run();
      return true;
    },
    listAgents: () =>
      agentRows(
        db
          .select()
          .from(agents)
          // Join order: core `machineCalled` numbers machines that share a name by it.
          .orderBy(asc(agents.createdAt), asc(agents.machineId))
          .all()
      ),
    agentRow: (machineId) => {
      const row = db
        .select()
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      return row ? agentRows([row], machineId)[0] : undefined;
    },
    deleteMachine: (machineId) =>
      db.transaction((tx) => {
        const ids = tx
          .select({ id: instances.id })
          .from(instances)
          .where(eq(instances.machineId, machineId))
          .all()
          .map((row) => row.id);
        // Removing a machine never touches its processes or records end intent.
        tx.update(instances)
          .set({ machineRemoved: true })
          .where(eq(instances.machineId, machineId))
          .run();
        // What it was called and when it went, for the rows that keep its id.
        const named = tx
          .select({ hostname: agents.hostname })
          .from(agents)
          .where(eq(agents.machineId, machineId))
          .get();
        if (named) {
          const removed = {
            machineId,
            hostname: named.hostname,
            removedAt: new Date(),
          };
          tx.insert(removedMachines)
            .values(removed)
            .onConflictDoUpdate({
              target: removedMachines.machineId,
              set: removed,
            })
            .run();
        }
        // A project whose primary checkout was on the machine moves it to
        // its next checkout, the oldest; with none left it has no checkout
        // yet, and its folder on the hub stays where every project's is.
        const orphaned = tx
          .select({ projectId: projectPlaces.projectId })
          .from(projectPlaces)
          .where(
            and(
              eq(projectPlaces.machineId, machineId),
              eq(projectPlaces.isPrimary, true)
            )
          )
          .all();
        tx.delete(projectPlaces)
          .where(eq(projectPlaces.machineId, machineId))
          .run();
        for (const { projectId } of orphaned) {
          const [next] = tx
            .select()
            .from(projectPlaces)
            .where(
              and(
                eq(projectPlaces.projectId, projectId),
                eq(projectPlaces.kind, "checkout")
              )
            )
            .orderBy(asc(projectPlaces.createdAt), asc(projectPlaces.id))
            .limit(1)
            .all();
          if (next) {
            tx.update(projectPlaces)
              .set({ isPrimary: true })
              .where(eq(projectPlaces.id, next.id))
              .run();
          }
        }
        for (const { table, column } of GO_WITH_MACHINE) {
          tx.run(
            sql`DELETE FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${machineId}`
          );
        }
        return { instanceIds: ids };
      }),
    rekeyMachine: (from, to) =>
      db.transaction((tx) => {
        const moved: Record<string, number> = {};
        const note: Moved = (what, count) => {
          if (count > 0) {
            moved[what] = (moved[what] ?? 0) + count;
          }
        };
        moveMachineRow(tx, from, to, note);
        for (const { table, column, rekey } of MACHINE_MOVED) {
          const name = sql.identifier(table);
          const by = sql.identifier(column);
          const before = naming(tx, table, column, from);
          tx.run(
            sql`UPDATE OR IGNORE ${name} SET ${by} = ${to} WHERE ${by} = ${from}`
          );
          if (rekey === "keyed") {
            tx.run(sql`DELETE FROM ${name} WHERE ${by} = ${from}`);
          }
          note(table, before);
        }
        // A bucket's id leads with its machine's (`putUsageBuckets`), so a
        // re-report from the new id lands on the bucket it moved to.
        note("usage_buckets", naming(tx, "usage_buckets", "machine_id", from));
        tx.run(
          sql`UPDATE OR IGNORE usage_buckets SET machine_id = ${to}, id = ${to} || substr(id, ${from.length + 1}) WHERE machine_id = ${from} AND substr(id, 1, ${from.length + 1}) = ${`${from}:`}`
        );
        tx.run(
          sql`UPDATE OR IGNORE usage_buckets SET machine_id = ${to} WHERE machine_id = ${from}`
        );
        tx.run(sql`DELETE FROM usage_buckets WHERE machine_id = ${from}`);
        return moved;
      }),
    removedMachines: () => db.select().from(removedMachines).all(),
  };
};
