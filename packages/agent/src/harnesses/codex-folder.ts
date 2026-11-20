/**
 * A Codex thread following a project's folder that moved (harness.ts
 * `FolderCarry`): Codex takes the folder at each resume (`cwd`), so on one
 * machine nothing of it moves; to another machine its rollout file is
 * copied whole into that machine's store under `sessions/` and resumed by
 * id there, never by `path`, and the copy left here is removed so no two
 * copies fork under one id. Proven by run on 0.169.0
 * (docs/advice/conversation-carry-proof.md §1).
 */
import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { codexStoreDir } from "@cawco/core/paths/harnesses";
import { fileReceived } from "../folder-files";
import type { FolderCarry } from "../harness";
import { removeTree } from "../remove-tree";

const sessionsDir = (): string => join(codexStoreDir(), "sessions");

/** A thread's rollout file in this machine's store, by its id: its path under `sessions/`. */
const rolloutOf = async (
  threadId: string,
  dir = sessionsDir(),
  under = ""
): Promise<string | undefined> => {
  const entries = await readdir(dir, { withFileTypes: true }).catch(
    unlessGone<Dirent[]>([])
  );
  for (const entry of entries) {
    const rel = under ? `${under}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const found = await rolloutOf(threadId, join(dir, entry.name), rel);
      if (found) {
        return found;
      }
    } else if (entry.name.endsWith(`${threadId}.jsonl`)) {
      return rel;
    }
  }
};

export const codexFolderCarry: FolderCarry = {
  here: () => Promise.resolve(),
  tops: async (one) => {
    const rel = await rolloutOf(one.sessionId);
    if (!rel) {
      throw new Error(`Codex has no thread ${one.sessionId} on this machine`);
    }
    return [{ from: join(sessionsDir(), ...rel.split("/")), name: rel }];
  },
  take: (_one, mine) =>
    fileReceived(
      mine,
      () => Number.POSITIVE_INFINITY,
      (rel) => join(sessionsDir(), rel)
    ),
  drop: async (one) => {
    const rel = await rolloutOf(one.sessionId);
    if (rel) {
      await removeTree(join(sessionsDir(), ...rel.split("/")));
    }
  },
};
