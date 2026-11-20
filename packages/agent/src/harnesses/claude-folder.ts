/**
 * A Claude session's conversation following a project's folder that moved
 * (harness.ts `FolderCarry`): Claude Code files each conversation under its
 * folder's name in `projects/` of the session's config dir, and CawCo
 * resumes one only from under its own folder's name (claude.ts
 * `conversationGone`). Proven by run on 2.1.326, on one machine and into
 * another config dir (docs/advice/conversation-carry-proof.md §2).
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { FolderCarrySession } from "@cawco/core/folder-move";
import { projectSlug, sessionConfigDir } from "@cawco/core/paths/claude";
import { sessionEntriesIn, transcriptIn } from "../claude-sessions";
import { fileAt, fileReceived, stands } from "../folder-files";
import type { FolderCarry } from "../harness";
import { removeTree } from "../remove-tree";

const configOf = (one: FolderCarrySession): string =>
  sessionConfigDir({ accountId: one.accountId });

/** An entry's place in `config` for the folder `to`: one under `projects/<slug>/` goes under the new folder's name. */
const filedFor = (config: string, rel: string, to: string): string => {
  const [root, , ...rest] = rel.split("/");
  return root === "projects"
    ? join(config, "projects", projectSlug(to), ...rest)
    : join(config, rel);
};

export const claudeFolderCarry: FolderCarry = {
  /**
   * The transcript, its side folder and its set-aside copies filed again
   * under the new folder's name, in the same config dir; the folder's own
   * memory follows the first conversation that moves.
   */
  here: async (one) => {
    const config = configOf(one);
    const into = join(config, "projects", projectSlug(one.to));
    const transcript = await transcriptIn(config, one.sessionId, one.from);
    if (!transcript) {
      throw new Error(
        `Claude Code has no conversation ${one.sessionId} in ${config}`
      );
    }
    const from = dirname(transcript);
    if (from === into) {
      return;
    }
    for (const name of await readdir(from)) {
      if (name.startsWith(one.sessionId)) {
        await fileAt(join(from, name), join(into, name));
      }
    }
    if (
      (await stands(join(from, "memory"))) &&
      !(await stands(join(into, "memory")))
    ) {
      await fileAt(join(from, "memory"), join(into, "memory"));
    }
  },
  /** Every entry its config dir holds of the session, by its path there. */
  tops: async (one) => {
    const config = configOf(one);
    return (await sessionEntriesIn(config, one.sessionId)).map((rel) => ({
      from: join(config, rel),
      name: rel,
    }));
  },
  /** Filed in its account's config dir here, under the new folder's name; an account never signed in here takes none. */
  take: async (one, mine) => {
    const config = configOf(one);
    if (!(await stands(config))) {
      throw new Error(
        `its account was never signed in on this machine (${config})`
      );
    }
    await fileReceived(
      mine,
      (rel) => (rel.startsWith("projects") ? 3 : 2),
      (rel) => filedFor(config, rel, one.to)
    );
  },
  drop: async (one) => {
    const config = configOf(one);
    for (const rel of await sessionEntriesIn(config, one.sessionId)) {
      await removeTree(join(config, rel));
    }
  },
};
