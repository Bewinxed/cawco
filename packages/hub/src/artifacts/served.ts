/**
 * Where an artifact's source is served, read off its row: a workspace
 * preview's server ({@link servedOf}) and a component sheet's place on its
 * workspace's stage ({@link sheetOf}).
 */

import { join } from "node:path";
import type { PreviewSource } from "@cawco/core/preview/protocol";
import { type CanvasSpec, canvasOf } from "@cawco/core/stage";
import type { ArtifactRow } from "../db/artifacts";

/**
 * An artifact a workspace serves that its retirement still waits on, and
 * why (`servedOwed`): the person is still owed it or a page showing it
 * (`owed`: not seen yet, or waiting on him), or it is a folder preview he
 * looked at within the half hour a stage stays up unused (`looked`).
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
 * `source` served from pin `pin`, a source a machine pins (a sheet, a
 * workspace preview, a folder); as it is for any other (a page, a host's
 * port, whose server is the session's own).
 */
export const pinnedAt = (source: PreviewSource, pin: string): PreviewSource => {
  if ("dir" in source) {
    return { ...source, pin };
  }
  return "port" in source &&
    source.workspace !== undefined &&
    (source.stage !== undefined || source.serve !== undefined)
    ? { ...source, pin }
    : source;
};

/** A sheet's place on its workspace's stage (core `PreviewSource`); null for any other artifact. */
export const sheetOf = (
  row: ArtifactRow
): {
  dir: string;
  file: string;
  /** Every states file of the canvas, from the clone's root: a section each. */
  files: string[];
  /** The pin the person is served it from (core `PreviewSource.pin`). */
  pin?: string;
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
    ...(row.source.pin === undefined ? {} : { pin: row.source.pin }),
    workspace: row.source.workspace,
  };
};
