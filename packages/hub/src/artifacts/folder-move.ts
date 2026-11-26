/**
 * The move of folder previews made before the hub kept their files
 * (preview-folder.ts) onto the files it keeps. Until 2026-11-22 a folder
 * preview was served from a pin: a copy of its folder its machine cut each
 * time its author handed it up, kept in the pin's state dir there (agent
 * stage-clone.ts, `~/.cawco/workspaces/<pin>/folder`), its row naming the
 * pin (schema.ts `artifacts.sourcePin`). As each machine registers, and on
 * each workspace sweep, every such row on it has its pin's copy read off
 * the machine and written under its artifact's folder, and names its pin no
 * more; a row whose copy is not there any more names it no more either,
 * and is marked as one that can't be shown again (doc `meta.sourceGone`),
 * which takes it out of Needs you and gives its panel the gone cover's
 * words (preview-server/serve.ts `serveFolder`). Then the machine is sent
 * the pins still to move, and lets every other go (core `STAGE_PINS`). A
 * machine away, silent or with no home folder recorded leaves its rows as
 * they stand, for its next register.
 */
import { join } from "node:path";
import { detach } from "@cawco/core/detach";
import { workspacesDirUnder } from "@cawco/core/paths/workspace";
import { shortId } from "@cawco/core/short-id";
import { previewWords } from "@cawco/core/words/preview";
import { ElysiaStatus } from "elysia";
import type { ArtifactsDb } from "../db/artifacts";
import type { createDesignFiles } from "./design-files";
import type { DesignFile } from "./design-folder";
import { FOLDER_LIMITS } from "./preview-folder";

/** Where a pin's copy stood in its state dir (agent stage-clone.ts). */
const PINNED_FOLDER = "folder";

/** The status a folder read refused by its machine answers with (design-files.ts `unread`): the copy can't be read, and never will be. */
const REFUSED = 400;

export interface FolderMoveDeps {
  db: Pick<ArtifactsDb, "folderMoved" | "foldersOn" | "foldersToMove">;
  folderFiles: ReturnType<typeof createDesignFiles>;
  /** Folder preview `id` can't be shown again, `why` in the person's words; null: it can. */
  gone: (id: string, why: string | null) => void;
  /** Machine `machineId` told the pins still to move: it lets every other go (core `STAGE_PINS`). */
  keepPins: (machineId: string, pins: string[]) => void;
  /** Whether folder preview `id` has its files where the hub serves them (page-store.ts `hasFolder`). */
  kept: (id: string) => boolean;
  machineHome: (machineId: string) => string | null;
  /** Machine `machineId`'s name as the person reads it. */
  machineName: (machineId: string) => string;
  /** Folder preview `id`'s files written where the hub serves them (page-store.ts `writeFolder`). */
  write: (id: string, files: readonly DesignFile[]) => void;
}

export const createFolderMove = (deps: FolderMoveDeps) => {
  /** The machines whose move runs now: one at a time each. */
  const moving = new Set<string>();
  /** The machines whose folder previews with no files and no pin were looked at since the hub started ({@link unkept}). */
  const looked = new Set<string>();

  /**
   * Each folder preview on machine `machineId` that names no pin and has
   * no files here, marked as one that can't be shown again: one made
   * before folder previews were pinned, served from its folder itself,
   * which the hub never held. Once per machine while the hub runs.
   */
  const unkept = (machineId: string): void => {
    if (looked.has(machineId)) {
      return;
    }
    looked.add(machineId);
    for (const id of deps.db.foldersOn(machineId)) {
      if (!deps.kept(id)) {
        deps.gone(
          id,
          previewWords.goneWhy.filesLost(deps.machineName(machineId))
        );
      }
    }
  };

  /** Each folder preview on machine `machineId` still to move, moved or marked gone; then its pins squared. */
  const moveOn = async (machineId: string): Promise<void> => {
    unkept(machineId);
    const rows = deps.db.foldersToMove(machineId);
    const home = rows.length > 0 ? deps.machineHome(machineId) : null;
    let moved = 0;
    let lost = 0;
    for (const { id, pin } of home === null ? [] : rows) {
      const copy = join(workspacesDirUnder(home ?? ""), pin, PINNED_FOLDER);
      const files = await deps.folderFiles({ machineId }, copy, FOLDER_LIMITS);
      if (files instanceof ElysiaStatus) {
        if (files.status !== REFUSED) {
          // Away, silent or failing: the next register tries again.
          console.warn(
            `[artifacts] folder preview ${shortId(id)}'s files were not moved in from ${deps.machineName(machineId)} now: ${String(files.response.detail)}`
          );
          break;
        }
        console.warn(
          `[artifacts] folder preview ${shortId(id)} can't be shown again: its pin ${shortId(pin)} on ${deps.machineName(machineId)} wasn't read (${String(files.response.detail)})`
        );
        deps.gone(
          id,
          previewWords.goneWhy.filesLost(deps.machineName(machineId))
        );
        deps.db.folderMoved(id);
        lost += 1;
        continue;
      }
      deps.write(id, files);
      deps.db.folderMoved(id);
      deps.gone(id, null);
      moved += 1;
    }
    if (moved + lost > 0) {
      console.info(
        `[artifacts] ${deps.machineName(machineId)}: ${moved} folder preview(s) moved into the hub's keeping, ${lost} whose files were gone`
      );
    }
    deps.keepPins(
      machineId,
      deps.db.foldersToMove(machineId).map((row) => row.pin)
    );
  };

  return {
    /**
     * Machine `machineId` registered, or the workspace sweep looked at it
     * (workspace-retire.ts): its folder previews still to move moved
     * ({@link moveOn}), one run at a time per machine. Never throws.
     */
    pinsBack: (machineId: string): void => {
      if (moving.has(machineId)) {
        return;
      }
      moving.add(machineId);
      detach(
        moveOn(machineId).finally(() => moving.delete(machineId)),
        "folder previews moved in"
      );
    },
  };
};
