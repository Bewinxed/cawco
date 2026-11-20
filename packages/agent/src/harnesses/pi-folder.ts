/**
 * A pi session following a project's folder that moved (harness.ts
 * `FolderCarry`): pi files each session under the folder it ran in, and
 * CawCo finds one only under its row's folder (pi-services.ts
 * `piSessionPath`), so its file moves to the new folder's own session
 * folder, here or on another machine. Proven by run on 1.5.2
 * (docs/advice/conversation-carry-proof.md §4).
 */
import { basename, join } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { fileAt, fileReceived } from "../folder-files";
import type { FolderCarry } from "../harness";
import { removeTree } from "../remove-tree";
import { piSessionPath } from "./pi-services";

/** The folder pi keeps the sessions of `cwd` in. */
const sessionDirOf = (cwd: string): string =>
  SessionManager.create(cwd).getSessionDir();

const noSession = (sessionId: string, cwd: string): Error =>
  new Error(`pi has no conversation ${sessionId} under ${cwd}`);

export const piFolderCarry: FolderCarry = {
  here: async (one) => {
    const file = await piSessionPath(one.sessionId, one.from);
    if (!file) {
      if (await piSessionPath(one.sessionId, one.to)) {
        return;
      }
      throw noSession(one.sessionId, one.from);
    }
    await fileAt(file, join(sessionDirOf(one.to), basename(file)));
  },
  tops: async (one) => {
    const file = await piSessionPath(one.sessionId, one.from);
    if (!file) {
      throw noSession(one.sessionId, one.from);
    }
    return [{ from: file, name: basename(file) }];
  },
  take: (one, mine) =>
    fileReceived(
      mine,
      () => 1,
      (rel) => join(sessionDirOf(one.to), rel)
    ),
  drop: async (one) => {
    const file = await piSessionPath(one.sessionId, one.from);
    if (file) {
      await removeTree(file);
    }
  },
};
