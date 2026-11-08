/**
 * THE RULE FOR A PROPOSAL THAT NO LONGER APPLIES, one for every kind the
 * person approves: a memory or delegate-type proposal (memory.ts), a design
 * proposal (design-system.ts), a proposed block (blocks.ts). Each file a
 * proposal changes keeps what it was proposed against (`before`, "" for a
 * file it makes); its change is merged three ways into the file as it is
 * now (git merge-file), and a file whose own change and the proposal's
 * overlap leaves the proposal no longer applying. It is read where the
 * subject changes (a commit to the files, a write to design/) and once more
 * as Approve carries it out; a proposal that no longer applies closes, and
 * its proposer is told (core `askWords.proposalClosedTold`).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { devNull, tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_LOCALE } from "@cawco/core/safe-git";
import { writeStateFile } from "@cawco/core/state-file";
import type { ProposedFile } from "./db/stored-types";

/** What the proposal writes now, or the first file it no longer applies to. */
export type Applies =
  { writes: { content: string; path: string }[] } | { stale: string };

/**
 * `now` with what `proposed` changed from `base` merged in (git merge-file);
 * undefined when the two changes overlap.
 */
const mergeThree = async (
  now: string,
  base: string,
  proposed: string
): Promise<string | undefined> => {
  const dir = await mkdtemp(join(tmpdir(), "cawco-proposal-"));
  try {
    const [ours, theirs, from] = ["now", "proposed", "base"].map((name) =>
      join(dir, name)
    );
    await Promise.all([
      writeStateFile(ours, now),
      writeStateFile(theirs, proposed),
      writeStateFile(from, base),
    ]);
    const child = Bun.spawn(["git", "merge-file", "-p", ours, from, theirs], {
      env: {
        PATH: process.env.PATH ?? "",
        ...GIT_LOCALE,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: devNull,
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [merged, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return code === 0 ? merged : undefined;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * Whether `files` still apply, each read as it is now by `read`: their
 * writes (each file's change merged into it), or the first file that no
 * longer takes it.
 */
export const appliesNow = async (
  files: readonly ProposedFile[],
  read: (path: string) => Promise<string>
): Promise<Applies> => {
  const writes: { content: string; path: string }[] = [];
  for (const file of files) {
    const now = await read(file.path);
    const next =
      now === file.before
        ? file.content
        : await mergeThree(now, file.before, file.content);
    if (next === undefined) {
      return { stale: file.path };
    }
    writes.push({ path: file.path, content: next });
  }
  return { writes };
};
