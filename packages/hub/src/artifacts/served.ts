/**
 * Where an artifact's source is served, read off its row: a workspace
 * preview's server ({@link servedOf}) and a component sheet's place on its
 * workspace's stage ({@link sheetOf}). A sheet is served from the
 * workspace's own stage, live with Vite's HMR: the owner's pick on how a
 * design graph follows its agent's code (2026-11-22, "Full hot reload").
 * A served preview and a folder are served from the pin its author handed
 * up ({@link pinnedAt}).
 */

import { join } from "node:path";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import { type CanvasSpec, canvasOf } from "@cawco/core/stage";
import type { ArtifactRow } from "../db/artifacts";

/**
 * An artifact a workspace serves that its retirement still waits on, and
 * why (`servedOwed`): it, or a decision page showing it, stands in a panel
 * (`owed`: service.ts `owedToPerson`), or it is a folder preview he looked
 * at within the half hour a stage stays up unused (`looked`).
 */
export interface ServedOwed {
  row: ArtifactRow;
  why: "looked" | "owed";
}

/** A workspace preview's server (core `ServeSpec`): its workspace, its port, and the pin it runs in (core `PreviewSource.pin`); null for any other artifact. */
export const servedOf = (
  row: Pick<ArtifactRow, "kind" | "source">
): { pin?: string; port: number; workspace: string } | null =>
  row.kind === "preview" &&
  "port" in row.source &&
  row.source.serve &&
  row.source.workspace
    ? {
        port: row.source.port,
        workspace: row.source.workspace,
        ...(row.source.pin === undefined ? {} : { pin: row.source.pin }),
      }
    : null;

/** The pin a machine serves `source` to the person from (core `PreviewSource.pin`); none for a page or a host's port. */
export const servedPin = (source: PreviewSource): string | undefined =>
  "page" in source ? undefined : source.pin;

/**
 * What a machine cuts a pin of for `source`, the version its author handed
 * up that the person is served: a workspace preview's server (the app he
 * tries a flow in) from its workspace's tree, a folder from a copy of it.
 * None for a sheet: its panel shows the workspace's stage live, every save
 * through Vite's HMR (the owner's pick, 2026-11-22). None for a page or a
 * host's port, which have no tree to pin.
 */
export const pinTarget = (
  source: PreviewSource
): { dir: string } | { workspace: string } | null => {
  if ("dir" in source) {
    return { dir: source.dir };
  }
  return "port" in source &&
    source.workspace !== undefined &&
    source.serve !== undefined &&
    source.stage === undefined
    ? { workspace: source.workspace }
    : null;
};

/** `source` served from pin `pin` when a machine pins it ({@link pinTarget}); as it is otherwise. */
export const pinnedAt = (source: PreviewSource, pin: string): PreviewSource =>
  pinTarget(source) && !("page" in source) ? { ...source, pin } : source;

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
