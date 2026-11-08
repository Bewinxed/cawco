/**
 * Whether a folder's `.git` is a repository, by git's own test
 * (`is_git_directory` in git's setup.c): a `HEAD`, an `objects` dir and a
 * `refs` dir. A `.git` that fails it is no repository git can read: a
 * workspace's clone deleted and refilled with nothing but CawCo's deny
 * stand-ins (`.git/hooks`, `.git/modules`) is one (stand-ins.ts in the
 * agent). Dependency-free: the boundary's srt host imports it.
 */
import { statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";

const PARTS = [
  ["HEAD", "file"],
  ["objects", "dir"],
  ["refs", "dir"],
] as const;

/** Whether `gitDir` (a clone's `.git`) is a repository by git's test. */
export const isGitDirSync = (gitDir: string): boolean =>
  PARTS.every(([name, kind]) => {
    try {
      const found = statSync(join(gitDir, name));
      return kind === "dir" ? found.isDirectory() : found.isFile();
    } catch {
      // Not there: no repository.
      return false;
    }
  });

/** {@link isGitDirSync}, read without blocking. */
export const isGitDir = async (gitDir: string): Promise<boolean> =>
  (
    await Promise.all(
      PARTS.map(async ([name, kind]) => {
        const found = await stat(join(gitDir, name)).catch(() => undefined);
        return kind === "dir" ? found?.isDirectory() : found?.isFile();
      })
    )
  ).every(Boolean);
