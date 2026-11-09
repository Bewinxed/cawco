import type { ArtifactRow } from "../../db/artifacts";

/** A workspace preview's server (core `ServeSpec`): its workspace and port; null for any other artifact. */
export const servedOf = (
  row: Pick<ArtifactRow, "kind" | "source">
): { port: number; workspace: string } | null =>
  row.kind === "preview" &&
  "port" in row.source &&
  row.source.serve &&
  row.source.workspace
    ? { port: row.source.port, workspace: row.source.workspace }
    : null;
