/** A machine artifact's row: one a machine serves (a port or a folder), never a page the hub serves itself. */
import type { MachineSource } from "@cawco/core/preview/upstream";
import type { ArtifactRow } from "./db/artifacts";

export type MachineRow = ArtifactRow & {
  machineId: string;
  source: MachineSource;
};

/** Whether a machine serves artifact `row` ({@link MachineRow}). */
export const servedByMachine = (row: ArtifactRow): row is MachineRow =>
  row.machineId !== null && !("page" in row.source);
