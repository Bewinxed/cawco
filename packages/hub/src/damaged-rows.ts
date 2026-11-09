/**
 * What a machine says of its damaged records ({@link DamagedRecordReport},
 * on every 15s beat), and how the board says it on the rows they belong to:
 * every session of a damaged workspace's work items (archive the workspace),
 * and a session whose own record is damaged (end it). In memory: the machine
 * says them again on every beat, so the hub holds only its last word.
 */
import type { DamagedRecordReport, DamagedRow } from "@cawco/core/protocol";
import { damagedWords } from "@cawco/core/words/damaged";

export interface DamagedRecords {
  /** Takes a beat's list for `machineId`; answers whether it differs from the last one. */
  heard: (machineId: string, reports: DamagedRecordReport[]) => boolean;
  /**
   * `rows` with each damaged one saying so: `damaged` names the file and the
   * way out. A damaged workspace's row with no running process is `error`
   * too, its `lastError` the same words: it does not run until the workspace
   * is archived. One whose process runs keeps its status, and so does a
   * session whose own record is damaged.
   */
  overlay: <
    Row extends { id: string; status: string; lastError?: string | null },
  >(
    rows: Row[]
  ) => (Row & { damaged?: DamagedRow })[];
}

export const damagedRecordsOf = (
  workItemsIn: (workspaceId: string) => { instanceId: string }[]
): DamagedRecords => {
  const byMachine = new Map<string, DamagedRecordReport[]>();

  /** Each session a damaged record belongs to; a workspace's damage is said first. */
  const byRow = (): Map<string, DamagedRow> => {
    const rows = new Map<string, DamagedRow>();
    const reports = [...byMachine.values()].flat();
    for (const { file, reason, workspaceId } of reports) {
      if (!workspaceId) {
        continue;
      }
      const damaged: DamagedRow = {
        file,
        reason,
        remedy: "archive",
        workspaceId,
      };
      for (const item of workItemsIn(workspaceId)) {
        if (!rows.has(item.instanceId)) {
          rows.set(item.instanceId, damaged);
        }
      }
    }
    for (const { file, reason, instanceId } of reports) {
      if (instanceId && !rows.has(instanceId)) {
        rows.set(instanceId, { file, reason, remedy: "end" });
      }
    }
    return rows;
  };

  return {
    heard(machineId, reports) {
      const moved = !Bun.deepEquals(byMachine.get(machineId) ?? [], reports);
      if (reports.length > 0) {
        byMachine.set(machineId, reports);
      } else {
        byMachine.delete(machineId);
      }
      return moved;
    },
    overlay(rows) {
      if (byMachine.size === 0) {
        return rows;
      }
      const damagedRows = byRow();
      return rows.map((row) => {
        const damaged = damagedRows.get(row.id);
        if (!damaged) {
          return row;
        }
        // A session's own damaged record (its wake-ups) does not stop it: its
        // next turn writes the record whole again. A workspace's does.
        const running = row.status === "running" || row.status === "starting";
        if (damaged.remedy === "end" || running) {
          return { ...row, damaged };
        }
        return {
          ...row,
          damaged,
          status: "error",
          lastError: damagedWords(damaged),
        };
      });
    },
  };
};
