/**
 * THE ONE READ OF WHETHER A PREVIEW CAN BE SHOWN, from what the hub holds:
 * the artifact's row, its machine's presence and pause, the workspace its
 * server runs in, and a folder preview's files. Every record a surface
 * frames a preview from carries it (core frames.ts `PreviewFrame`, a
 * decision page's media `DecisionMedia`), so a surface draws what the hub
 * knows (dashboard FrameDown.svelte) and loads no frame for it; a frame's
 * load then meets only what the hub can't know before it (its server down,
 * the page's error, the way to it failing midway), which the proxy's own
 * page says (core `PreviewDown`). A record is told again as what this reads
 * moves (server.ts `previewsMoved`).
 */

import type { PreviewUnavailable } from "@cawco/core/preview/protocol";
import { workspaceIdKindOf } from "@cawco/core/workspace-id";
import { servedOf, sheetOf } from "./artifacts/served";
import type { ArtifactRow } from "./db/artifacts";
import { goneDownOf } from "./design-revive";
import {
  type FolderRow,
  isFolderRow,
  type MachineRow,
  servedByMachine,
} from "./preview-machine";
import type { GoneWhy } from "./workspaces";

/** What the read reads of the hub. */
export interface PreviewUnavailableDeps {
  /** Whether machine `machineId`'s agent is connected now. */
  connected: (machineId: string) => boolean;
  /** Folder preview `id`'s files: kept where the hub serves them, or why they can't be shown again (doc `meta.sourceGone`). */
  folder: (id: string) => { gone: string | null; kept: boolean };
  /** Machine `machineId` as a sentence names it. */
  machineName: (machineId: string) => string;
  /** Why machine `machineId` is not connected, the cause alone. */
  offline: (machineId: string) => string;
  /** Why machine `machineId` starts nothing now (its pause), or undefined. */
  paused: (machineId: string) => string | undefined;
  /** Whether workspace `id` is archived now: nothing runs in it. */
  retired: (id: string) => boolean;
  /** Why what workspace `id` served can't come back as it is opened; null when it can (workspaces.ts `wontComeBack`). */
  wontComeBack: (id: string) => GoneWhy | null;
}

export const createPreviewUnavailable = (deps: PreviewUnavailableDeps) => {
  /** Machine `machineId` away or paused: nothing of its starts or answers. */
  const machineDown = (machineId: string): PreviewUnavailable | null => {
    if (!deps.connected(machineId)) {
      return {
        down: "machine",
        machine: deps.machineName(machineId),
        why: deps.offline(machineId),
      };
    }
    const paused = deps.paused(machineId);
    return paused
      ? { down: "machine", machine: deps.machineName(machineId), why: paused }
      : null;
  };

  /** A folder preview: its files kept, lost, or still on its machine. */
  const folderDown = (row: FolderRow): PreviewUnavailable | null => {
    const files = deps.folder(row.id);
    if (files.kept) {
      return null;
    }
    if (files.gone !== null) {
      return { down: "gone", why: files.gone };
    }
    return row.machineId === null ? null : machineDown(row.machineId);
  };

  /** A machine's preview whose server runs in a workspace (a clone): that workspace retired. */
  const workspaceDown = (
    row: MachineRow,
    workspace: string
  ): PreviewUnavailable | null => {
    if (!(sheetOf(row) || servedOf(row))) {
      return deps.retired(workspace) ? { down: "workspace", why: null } : null;
    }
    const why = deps.wontComeBack(workspace);
    if (!why) {
      return null;
    }
    const gone = goneDownOf(why);
    return gone.down === "machine"
      ? { ...gone, machine: deps.machineName(row.machineId) }
      : gone;
  };

  /**
   * Why artifact `row` can't be shown now, as far as the hub knows; null
   * when nothing it holds stands in the way. A row gone is `closed`. A page,
   * a canvas or a browser the hub serves or streams itself has nothing in
   * its way here. A folder preview whose files the hub keeps has none
   * either; one whose files were lost is `gone`, and one whose files are
   * still to be moved in waits on its machine (`machine`, while it is
   * away). A machine's preview waits on its machine (`machine`, away or
   * paused); its workspace retired is `gone` when the version can't be cut
   * again (workspaces.ts `wontComeBack`), and nothing when it can (an open
   * cuts it again, design-revive.ts); an unrecorded port preview's (no
   * stage, no server CawCo runs) is `workspace`: nothing there serves it
   * until a session runs there again.
   */
  return (row: ArtifactRow | undefined): PreviewUnavailable | null => {
    if (!row) {
      return { down: "closed", why: null };
    }
    if (isFolderRow(row)) {
      return folderDown(row);
    }
    if (!servedByMachine(row)) {
      return null;
    }
    const { workspace } = row.source;
    return (
      machineDown(row.machineId) ??
      (workspace && workspaceIdKindOf(workspace) === "clone"
        ? workspaceDown(row, workspace)
        : null)
    );
  };
};

export type PreviewUnavailableOf = ReturnType<typeof createPreviewUnavailable>;
