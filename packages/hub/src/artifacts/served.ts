/**
 * Where an artifact's source is served, read off its row: a workspace
 * preview's server ({@link servedOf}) and a component sheet's place on its
 * workspace's stage ({@link sheetOf}). Both are served live from what
 * their workspace or place runs: a sheet from its stage with Vite's HMR
 * (the owner's pick on 2026-11-22, "Full hot reload"), a served preview
 * from the one server its author runs, its edits reaching the open page
 * through that server's own reload (the owner's pick on 2026-11-22, "The
 * agent's live app"). Only a folder preview is served from a copy its
 * author handed up ({@link pinnedAt}).
 */

import { join } from "node:path";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import { type CanvasSpec, canvasOf } from "@cawco/core/stage";
import type { ArtifactRow } from "../db/artifacts";

/**
 * A served preview's server (core `ServeSpec`) as its source names it:
 * the workspace or place it runs in and its port, the one stage the
 * person and its author are both served (agent stage.ts `ensureServed`);
 * null for any other source.
 */
export const serverOf = (
  source: PreviewSource
): { port: number; workspace: string } | null =>
  "port" in source && source.serve && source.workspace && !source.stage
    ? { port: source.port, workspace: source.workspace }
    : null;

/** A workspace preview's server ({@link serverOf}); null for any other artifact. */
export const servedOf = (
  row: Pick<ArtifactRow, "kind" | "source">
): { port: number; workspace: string } | null =>
  row.kind === "preview" ? serverOf(row.source) : null;

/** The pin a machine serves a folder preview to the person from (core `PreviewSource.pin`); none for any other source. */
export const servedPin = (source: PreviewSource): string | undefined =>
  "dir" in source ? source.pin : undefined;

/** Folder `source` served from pin `pin`, the copy its machine made of it; any other source as it is. */
export const pinnedAt = (source: PreviewSource, pin: string): PreviewSource =>
  "dir" in source ? { ...source, pin } : source;

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
