/** A machine artifact's row: one a machine serves (a port), never a page or a folder preview the hub serves itself. */
import type { MachineSource } from "@cawco/core/preview/upstream";
import type { ArtifactRow } from "./db/artifacts";

export type MachineRow = ArtifactRow & {
  machineId: string;
  source: MachineSource;
};

/** Whether a machine serves artifact `row` ({@link MachineRow}). */
export const servedByMachine = (row: ArtifactRow): row is MachineRow =>
  row.machineId !== null && "port" in row.source;

/** A folder preview's row: its files kept and served by the hub (artifacts/preview-folder.ts). */
export type FolderRow = ArtifactRow & {
  source: Extract<ArtifactRow["source"], { dir: string }>;
};

/** Whether artifact `row` is a folder preview ({@link FolderRow}). */
export const isFolderRow = (row: ArtifactRow): row is FolderRow =>
  "dir" in row.source;

/**
 * Whether artifact `row` is served on an origin of its own (schema.ts
 * `artifacts.origin`): a machine's preview, relayed to its machine, or a
 * folder preview, its files served by the hub's preview server.
 */
export const hasOwnOrigin = (row: ArtifactRow): boolean =>
  servedByMachine(row) || isFolderRow(row);
