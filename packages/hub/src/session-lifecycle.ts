/** Stored decisions own lifetime; connection-local work is only delivery. */
import type {
  InstanceRow,
  NamedStop,
  SessionCustody,
  SessionEndIntent,
} from "@cawco/core";
import type { DbShape } from "./db";

interface Snapshot {
  attached: string[];
  custody: SessionCustody;
}

export const createSessionLifecycle = (ports: {
  db: DbShape;
  send: (machineId: string, payload: NamedStop) => boolean;
  restore: (row: InstanceRow) => void;
  deleteTranscript: (row: InstanceRow) => Promise<boolean>;
  confirmed: (row: ReturnType<DbShape["sessionOwnership"]>[number]) => void;
  /** The rows this reconcile read (db `ownedToReconcile`): the machine's removed opencode sessions among them are recovered. */
  recoverRemoved: (
    machineId: string,
    rows: ReturnType<DbShape["sessionOwnership"]>
  ) => void;
  changed: (machineId: string, removed?: string) => void;
  refresh: (machineId: string) => void;
}) => {
  const snapshots = new Map<string, Snapshot>();
  const attaching = new Map<string, { at: number; attempts: number }>();
  const deleting = new Set<string>();
  const issued = new Map<string, { generation: string; sequence: number }>();
  const delivering = new Map<string, string>();
  const requests = new Map<string, { id: string; generation: string }>();
  const unavailable = new Set<string>();
  const preservedUnattached = new Set<string>();
  let sequence = 0;
  const generation = (row: ReturnType<DbShape["sessionOwnership"]>[number]) =>
    JSON.stringify([row.id, row.spawnedAt]);

  const finishTranscript = (
    row: ReturnType<DbShape["sessionOwnership"]>[number]
  ) => {
    if (
      deleting.has(row.id) ||
      (row.endRetryAt && row.endRetryAt.getTime() > Date.now())
    ) {
      return;
    }
    deleting.add(row.id);
    ports
      .deleteTranscript(row)
      .then((done) => {
        const current = ports.db.ownedInstance(row.id, row.machineId);
        if (!done) {
          throw new Error("The machine refused to delete the transcript.");
        }
        if (
          done &&
          current?.endIntent === "delete-transcript" &&
          current.endConfirmedAt &&
          generation(current) === generation(row)
        ) {
          ports.db.finishTranscriptDelete(row.id);
          ports.changed(row.machineId, row.id);
        }
      })
      .catch((error: unknown) => {
        ports.db.noteEndFailure(
          row.id,
          error instanceof Error ? error.message : String(error)
        );
        ports.changed(row.machineId);
      })
      .finally(() => deleting.delete(row.id));
  };

  const reconcile = (
    machineId: string,
    fresh?: Snapshot,
    confirmAbsent = true
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: total keep/end decision table reads current durable rows on every run, with positive custody required for absence
  ): void => {
    if (fresh) {
      snapshots.set(machineId, fresh);
    }
    const snapshot = snapshots.get(machineId);
    if (snapshot?.custody.state !== "available") {
      return;
    }
    const held = new Set(snapshot.custody.instances);
    const attached = new Set(snapshot.attached);
    const pending = new Set(snapshot.custody.pending ?? []);
    // The rows this can act on, never the machine's every row: thousands of
    // ended sessions read whole, at every heartbeat and register, held the
    // hub's thread past its updater's 3 s probe (hub-restart-load, 2026-10-23).
    const rows = ports.db.ownedToReconcile(machineId, [
      ...held,
      ...attached,
      ...pending,
    ]);
    ports.recoverRemoved(machineId, rows);
    for (const row of rows) {
      if (row.machineRemoved) {
        continue;
      }
      if (row.endIntent) {
        attaching.delete(row.id);
        const sent = issued.get(row.id);
        const postStopRead =
          sent?.generation === generation(row) &&
          snapshot.custody.stopSequence !== undefined &&
          snapshot.custody.stopSequence >= sent.sequence;
        if (row.endConfirmedAt) {
          if (fresh && (held.has(row.id) || attached.has(row.id))) {
            ports.db.clearEndConfirmation(row.id);
            row.endConfirmedAt = null;
            issued.delete(row.id);
            delivering.delete(row.id);
          } else {
            if (row.endIntent === "delete-transcript") {
              finishTranscript(row);
            }
            continue;
          }
        }
        // Only a new machine reading can prove absence, never a cached one.
        if (
          fresh &&
          confirmAbsent &&
          postStopRead &&
          row.harness !== "opencode" &&
          !held.has(row.id) &&
          !attached.has(row.id) &&
          !pending.has(row.id) &&
          (row.endIntent !== "discard" || row.status === "discarded")
        ) {
          ports.db.confirmInstanceEnd(row.id);
          ports.confirmed(row);
          issued.delete(row.id);
          ports.changed(
            machineId,
            row.endIntent === "delete" ? row.id : undefined
          );
          if (row.endIntent === "delete-transcript") {
            finishTranscript(row);
          }
          continue;
        }
        if (delivering.get(row.id) === generation(row)) {
          continue;
        }
        const requestIds = [...requests].flatMap(([requestId, request]) =>
          request.id === row.id && request.generation === generation(row)
            ? [requestId]
            : []
        );
        for (const requestId of requestIds.length ? requestIds : [undefined]) {
          sequence += 1;
          const delivered = ports.send(machineId, {
            ...(requestId ? { requestId } : {}),
            stopSequence: sequence,
            instanceId: row.id,
            ...(row.scratchWorktree
              ? { scratchWorktree: row.scratchWorktree }
              : {}),
            processGeneration: generation(row),
            harness: row.harness,
            ...(row.sessionId ? { sessionId: row.sessionId } : {}),
            cwd: row.cwd,
            ...(row.harness === "opencode"
              ? {
                  claimedSessionIds: rows.flatMap((owner) =>
                    owner.id !== row.id &&
                    owner.harness === "opencode" &&
                    owner.sessionId &&
                    (!row.sessionId ||
                      ["running", "starting"].includes(owner.status) ||
                      attached.has(owner.id) ||
                      pending.has(owner.id) ||
                      attaching.has(owner.id))
                      ? [owner.sessionId]
                      : []
                  ),
                }
              : {}),
            discard: row.endIntent === "discard" && row.status !== "discarded",
            ...(row.endIntent === "delete" ||
            row.endIntent === "delete-transcript"
              ? { forget: true as const }
              : {}),
          });
          if (delivered) {
            issued.set(row.id, { generation: generation(row), sequence });
          }
          if (delivered) {
            delivering.set(row.id, generation(row));
          }
        }
        continue;
      }
      issued.delete(row.id);
      delivering.delete(row.id);
      // A row the machine has a spawn or attach in flight for (`pending`) is
      // the machine's to finish: a restore sent into that window raced the
      // spawn it was reading.
      if (attached.has(row.id)) {
        attaching.delete(row.id);
      } else if (
        held.has(row.id) &&
        !pending.has(row.id) &&
        !unavailable.has(row.id) &&
        !preservedUnattached.has(row.id)
      ) {
        const prior = attaching.get(row.id);
        if (!prior || Date.now() >= prior.at) {
          const attempts = (prior?.attempts ?? 0) + 1;
          attaching.set(row.id, {
            attempts,
            at:
              Date.now() +
              Math.min(30_000, 1000 * 2 ** Math.min(attempts - 1, 5)),
          });
          ports.restore(row);
        }
      }
    }
  };

  const oweEndSession = (
    instanceId: string,
    intent: SessionEndIntent
  ): void => {
    const before = ports.db.ownedInstance(instanceId)?.endIntent;
    const row = ports.db.endInstance(instanceId, intent);
    // A new end (a delete of a stopped session) is owed its own stop, which
    // tells the machine what the end is (`forget`): the last stop's delivery
    // stands for the end it was sent for alone.
    if (row && row.endIntent !== before) {
      delivering.delete(instanceId);
      issued.delete(instanceId);
    }
    if (row) {
      ports.changed(
        row.machineId,
        row.endIntent === "delete" && row.endConfirmedAt ? row.id : undefined
      );
      reconcile(row.machineId);
      ports.refresh(row.machineId);
    }
  };

  const endSession = (
    instanceId: string,
    intent: SessionEndIntent,
    requestId?: string
  ): void => {
    const owner = ports.db.ownedInstance(instanceId);
    if (requestId && !owner) {
      throw new Error(
        "This session is no longer recorded. Refresh, then retry."
      );
    }
    if (owner && requestId) {
      requests.set(requestId, {
        id: instanceId,
        generation: generation(owner),
      });
      delivering.delete(instanceId);
    }
    oweEndSession(instanceId, intent);
  };

  const confirm = (
    machineId: string,
    id: string,
    payload: {
      discard?: boolean;
      processGeneration?: string;
      ended?: {
        harness: string;
        sessionId?: string;
        resourcesClosed: boolean;
        reason?: string;
      };
    }
  ): boolean => {
    const row = ports.db.ownedInstance(id, machineId);
    if (
      !(row?.endIntent && payload.ended?.resourcesClosed) ||
      payload.ended.harness !== row.harness ||
      payload.processGeneration !== generation(row) ||
      (row.endIntent === "discard" &&
        row.status !== "discarded" &&
        !payload.discard)
    ) {
      return false;
    }
    if (
      row.harness === "opencode" &&
      !(
        payload.ended?.harness === "opencode" &&
        (payload.ended.sessionId === row.sessionId ||
          (!row.sessionId &&
            payload.ended.reason?.startsWith(
              `no unclaimed runner in ${row.cwd} at `
            ))) &&
        payload.ended.resourcesClosed
      )
    ) {
      return false;
    }
    ports.db.confirmInstanceEnd(id, payload.ended.reason);
    ports.confirmed(row);
    issued.delete(id);
    delivering.delete(id);
    ports.changed(machineId, row.endIntent === "delete" ? id : undefined);
    if (row.endIntent === "delete-transcript") {
      finishTranscript(row);
    }
    return true;
  };

  return {
    /**
     * Whether the machine's last custody reading has a process for `id`:
     * held, attached, or a spawn or attach in flight. False when the machine
     * has no reading (it is away) or cannot read its custody.
     */
    holds: (machineId: string, id: string): boolean => {
      const snapshot = snapshots.get(machineId);
      return (
        snapshot?.custody.state === "available" &&
        (snapshot.custody.instances.includes(id) ||
          snapshot.attached.includes(id) ||
          (snapshot.custody.pending ?? []).includes(id))
      );
    },
    preserveUnattached: (id: string) => preservedUnattached.add(id),
    restoring: (id: string) => {
      const prior = attaching.get(id);
      if (!prior) {
        attaching.set(id, { at: Date.now() + 1000, attempts: 1 });
      }
      unavailable.delete(id);
    },
    unavailable: (id: string) => {
      unavailable.add(id);
      attaching.delete(id);
    },
    endSession,
    answered: (requestId: string, ok: boolean) => {
      const request = requests.get(requestId);
      requests.delete(requestId);
      if (request && !ok) {
        delivering.delete(request.id);
      }
    },
    oweEndSession,
    reconcile,
    confirm,
    deliveryFailed: (id: string) => delivering.delete(id),
    disconnect: (machineId: string) => {
      snapshots.delete(machineId);
      for (const id of ports.db.sessionIdsOn(machineId)) {
        delivering.delete(id);
        issued.delete(id);
        attaching.delete(id);
        unavailable.delete(id);
        preservedUnattached.delete(id);
      }
    },
  };
};
