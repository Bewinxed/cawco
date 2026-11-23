/**
 * An OpenCode session following a project's folder that moved (harness.ts
 * `FolderCarry`): its folder is the session's location in its server. On
 * one machine OpenCode's own `session.move`, once the old folder is gone,
 * records the move and runs no turn; while the old folder still stands
 * (what a removal left), the session is exported, kept on disk, removed
 * and imported at the new folder. To another machine it is exported here
 * and imported there at the new folder, each read back to as many messages
 * as were sent. Proven by run on 2.3.0 (docs/advice/conversation-carry-proof.md §3).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isRecord } from "@cawco/core/is-record";
import { writeStateFile } from "@cawco/core/state-file";
import { carryDir, stands } from "../folder-files";
import type { FolderCarry } from "../harness";

/** A session as OpenCode exports it whole: its info and its messages. */
interface Exported {
  info: { id: string };
  messages: unknown[];
}

/** What a move of a folder asks of the OpenCode harness here (opencode.ts `folders`). */
export interface OpencodeFolders<T extends Exported> {
  exportTree: (sessionId: string) => Promise<T[]>;
  homeOf: (sessionId: string) => Promise<string>;
  importTree: (
    sent: readonly T[],
    directory: string,
    home?: string
  ) => Promise<void>;
  move: (sessionId: string, directory: string) => Promise<void>;
  removeTree: (sessionId: string) => Promise<void>;
}

const EXPORT_NAME = "export.json";

/** The carry for the harness whose folders `folders` are; `isExported` holds a read file to what was exported. */
export const opencodeFolderCarry = <T extends Exported>(
  folders: OpencodeFolders<T>,
  isExported: (value: unknown) => value is T[]
): FolderCarry => {
  const kept = (jobId: string, sessionId: string): string =>
    join(carryDir(jobId), `opencode-${sessionId}.json`);
  const read = async (file: string): Promise<T[]> => {
    const value: unknown = JSON.parse(await readFile(file, "utf8"));
    if (!isExported(value)) {
      throw new Error(`${file} holds no OpenCode export.`);
    }
    return value;
  };
  return {
    here: async (one, jobId) => {
      if (!(await stands(one.from))) {
        await folders.move(one.sessionId, one.to);
        return;
      }
      const home = await folders.homeOf(one.sessionId);
      const file = kept(jobId, one.sessionId);
      await writeStateFile(
        file,
        JSON.stringify(await folders.exportTree(one.sessionId))
      );
      const sent = await read(file);
      await folders.removeTree(one.sessionId);
      await folders.importTree(sent, one.to, home);
    },
    tops: async (one, jobId) => {
      const file = kept(jobId, one.sessionId);
      await writeStateFile(
        file,
        JSON.stringify(await folders.exportTree(one.sessionId))
      );
      return [{ from: file, name: EXPORT_NAME }];
    },
    take: async (one, mine) => {
      await folders.importTree(await read(join(mine, EXPORT_NAME)), one.to);
    },
    drop: (one) => folders.removeTree(one.sessionId),
  };
};

/** Whether `value` is a list of OpenCode exports: each an info with its id and messages. */
export const isExportList = (value: unknown): value is Exported[] =>
  Array.isArray(value) &&
  value.every(
    (one) =>
      isRecord(one) &&
      isRecord(one.info) &&
      typeof one.info.id === "string" &&
      Array.isArray(one.messages)
  );
