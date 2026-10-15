/**
 * Where a project's memory documents are placed in each of its folders, and
 * how a session working in one reads them (core fleet.ts `MemoryScope`).
 * fleet.ts writes them; the OpenCode and pi harnesses hand them to their
 * sessions, as Claude Code reads them there itself.
 */
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { projectClaudeDir } from "@cawco/core/paths";

/**
 * A folder's `.claude/rules/cawco/`: Claude Code loads every rule file under
 * `.claude/rules/` at a session's launch ("All `.md` files are discovered
 * recursively", code.claude.com/docs/en/memory).
 */
export const placedMemoryDir = (cwd: string): string =>
  projectClaudeDir(cwd, "rules", "cawco");

/** Every markdown file under `root`, by its path there, in path order; none when it is no folder. */
const markdownUnder = async (root: string, prefix = ""): Promise<string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        markdownUnder(join(root, entry.name), `${prefix}${entry.name}/`)
      )
  );
  return [
    ...nested.flat(),
    ...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `${prefix}${entry.name}`),
  ].sort();
};

/**
 * The project's memory documents placed for a session working in `cwd`:
 * those of the nearest folder at or above it that holds
 * `.claude/rules/cawco/`, each by its path there and its file, in path
 * order. None when no folder above it holds any.
 */
export const placedMemoryIn = async (
  cwd: string
): Promise<{ path: string; file: string; content: string }[]> => {
  for (let dir = cwd; ; dir = dirname(dir)) {
    const root = placedMemoryDir(dir);
    // biome-ignore lint/performance/noAwaitInLoops: one folder up at a time, stopping at the first that holds any
    const paths = await markdownUnder(root);
    if (paths.length > 0) {
      return await Promise.all(
        paths.map(async (path) => ({
          path,
          file: join(root, path),
          content: await Bun.file(join(root, path)).text(),
        }))
      );
    }
    if (dirname(dir) === dir) {
      return [];
    }
  }
};
