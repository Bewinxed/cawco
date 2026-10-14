import type {
  FleetMcpChange,
  FleetMcpChangeKind,
  FleetMcpServer,
} from "@cawco/core";

/** What a machine's sessions can tell apart about one server, as the hub last announced it. */
interface Seen {
  /** It reaches machines at all: enabled, and its sign-in has not failed (`FleetMcp.syncConfig`). */
  live: boolean;
  /** Where a harness dials it and for whom: a change here is a new connection. */
  shape: string;
  signedIn: boolean;
}

const seen = (row: FleetMcpServer): Seen => ({
  live: row.enabled && row.auth?.state !== "failed",
  shape: JSON.stringify([
    row.config,
    (row as { projectId?: string }).projectId ?? null,
    row.auth?.mode ?? null,
  ]),
  signedIn: row.auth?.mode !== "oauth" || row.auth.state === "signed-in",
});

const kindOf = (
  before: Seen | undefined,
  after: Seen | undefined
): FleetMcpChangeKind | undefined => {
  if (!before) {
    return after?.live ? "added" : undefined;
  }
  if (!after) {
    return before.live ? "removed" : undefined;
  }
  if (before.live !== after.live) {
    return after.live ? "enabled" : "disabled";
  }
  if (!after.live) {
    return;
  }
  if (before.shape !== after.shape) {
    return "config";
  }
  if (before.signedIn !== after.signedIn) {
    return after.signedIn ? "signed-in" : "signed-out";
  }
};

/** A sign-in landing on a server a session has yet to take whole changes nothing about what it must take. */
const NEW_CONNECTION: ReadonlySet<FleetMcpChangeKind> = new Set([
  "config",
  "added",
  "enabled",
]);

const merged = (
  older: FleetMcpChangeKind | undefined,
  newer: FleetMcpChangeKind
): FleetMcpChangeKind =>
  older &&
  NEW_CONNECTION.has(older) &&
  (newer === "signed-in" || newer === "signed-out")
    ? older
    : newer;

type Pending = Map<string, { kind: FleetMcpChangeKind; seq: number }>;

/** The changes one fleet sync carries: each as it was when the sync read the fleet. */
export type RidingChanges = ReadonlyMap<
  string,
  { kind: FleetMcpChangeKind; seq: number }
>;

/**
 * Fleet MCP changes on their way to each machine's live sessions. The hub
 * announces every change of its MCP servers (a write, a sign-in, a sign-out
 * after a refused refresh or a 401, a re-probe that changed its auth) through
 * one call; each announcement is diffed against the last into one change per
 * server, kept for every machine the hub knows until a fleet sync that read
 * it has landed there. A session takes a change only after its machine's
 * files hold it: a server added at the hub is read from the files the sync
 * wrote, and a server removed is gone from them.
 *
 * A sync that was overtaken, failed, or never answered lands nothing; its
 * changes stay and ride the next sync, which reads the fleet after them.
 */
export class FleetMcpChanges {
  #seen: Map<string, Seen>;
  readonly #pending = new Map<string, Pending>();
  #seq = 0;

  constructor(rows: readonly FleetMcpServer[]) {
    this.#seen = new Map(rows.map((row) => [row.name, seen(row)]));
  }

  /** The servers as they are now, against the last announcement: each change queued for every machine named. */
  note(
    rows: readonly FleetMcpServer[],
    machineIds: readonly string[]
  ): FleetMcpChange[] {
    const now = new Map(rows.map((row) => [row.name, seen(row)]));
    const changes: FleetMcpChange[] = [];
    for (const name of new Set([...this.#seen.keys(), ...now.keys()])) {
      const kind = kindOf(this.#seen.get(name), now.get(name));
      if (kind) {
        changes.push({ name, kind });
      }
    }
    this.#seen = now;
    for (const machineId of machineIds) {
      const pending = this.#pending.get(machineId) ?? new Map();
      for (const { name, kind } of changes) {
        this.#seq += 1;
        pending.set(name, {
          kind: merged(pending.get(name)?.kind, kind),
          seq: this.#seq,
        });
      }
      if (pending.size > 0) {
        this.#pending.set(machineId, pending);
      }
    }
    return changes;
  }

  /** What a sync to this machine carries: taken as it reads the fleet. */
  ride(machineId: string): RidingChanges {
    return new Map(this.#pending.get(machineId));
  }

  /**
   * A sync that read `riding` has written its files on this machine: the
   * changes it carried that nothing has overtaken since, now the sessions'
   * to take. One a later change replaced waits for the sync that read it.
   */
  landed(machineId: string, riding: RidingChanges): FleetMcpChange[] {
    const pending = this.#pending.get(machineId);
    if (!pending) {
      return [];
    }
    const landed: FleetMcpChange[] = [];
    for (const [name, change] of riding) {
      if (pending.get(name)?.seq === change.seq) {
        pending.delete(name);
        landed.push({ name, kind: change.kind });
      }
    }
    if (pending.size === 0) {
      this.#pending.delete(machineId);
    }
    return landed;
  }
}
