/**
 * Where an artifact's source is served, read off its row: a workspace
 * preview's server ({@link servedOf}) and a component sheet's place on its
 * workspace's stage ({@link sheetOf}).
 */

import { join } from "node:path";
import { type CanvasSpec, canvasOf } from "@cawco/core/stage";
import type { ArtifactRow } from "../db/artifacts";

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

/** A sheet's place on its workspace's stage (core `PreviewSource`); null for any other artifact. */
export const sheetOf = (
  row: ArtifactRow
): {
  dir: string;
  file: string;
  /** Every states file of the canvas, from the clone's root: a section each. */
  files: string[];
  spec: CanvasSpec;
  workspace: string;
} | null => {
  if (!(
    row.kind === "component" &&
    "port" in row.source &&
    row.source.stage &&
    row.source.workspace
  )) {
    return null;
  }
  const { stage } = row.source;
  const { files, spec } = canvasOf(row.source.path ?? "");
  return {
    ...stage,
    files: (files.length > 0 ? files : [stage.file]).map((one) =>
      join(stage.dir, one)
    ),
    spec,
    workspace: row.source.workspace,
  };
};
