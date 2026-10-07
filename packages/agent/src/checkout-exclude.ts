/**
 * Files cawco writes into a checkout that are not the project's: kept out of
 * git's status through the checkout's own `info/exclude`.
 */
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative as relativePath } from "node:path";
import { resolveBin, toolEnv } from "./tools";

/** One git query in `cwd`, its trimmed stdout; undefined when git fails (not a checkout, no git). */
export const gitIn = async (
  cwd: string,
  args: string[]
): Promise<string | undefined> => {
  const git = resolveBin("git");
  if (!git) {
    return;
  }
  try {
    const child = Bun.spawn([git, "-C", cwd, ...args], {
      env: toolEnv(),
      stdout: "pipe",
      stderr: "ignore",
    });
    const [out, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return code === 0 ? out.trim() : undefined;
  } catch {
    // No git to run, or it could not start: not a checkout cawco can tell.
    return undefined;
  }
};

/**
 * Keeps a file cawco wrote into a checkout out of its status (a project
 * hook's `.claude/settings.json`, a workspace's `opencode.jsonc`): one line
 * in that checkout's `.git/info/exclude` (the common one for a linked
 * worktree), added once. Without it the file is untracked work, and the
 * hub's landing refuses a delegate workspace that carries any. A directory
 * that is not a git checkout is left as it is; a tracked file is the
 * project's own and stays tracked.
 */
export const excludeFromCheckout = async (path: string): Promise<void> => {
  const cwd = dirname(path);
  const [top, exclude] = await Promise.all([
    gitIn(cwd, ["rev-parse", "--show-toplevel"]),
    gitIn(cwd, [
      "rev-parse",
      "--path-format=absolute",
      "--git-path",
      "info/exclude",
    ]),
  ]);
  if (!(top && exclude)) {
    return;
  }
  const inside = relativePath(
    await realpath(top),
    await realpath(path).catch(() => path)
  );
  if (!inside || inside.startsWith("..") || isAbsolute(inside)) {
    return;
  }
  const line = `/${inside}`;
  const current = await Bun.file(exclude)
    .text()
    .catch(() => "");
  if (current.split("\n").some((each) => each.trim() === line)) {
    return;
  }
  try {
    await mkdir(dirname(exclude), { recursive: true });
    const lead = current === "" || current.endsWith("\n") ? "" : "\n";
    await appendFile(exclude, `${lead}${line}\n`);
  } catch {
    // The hook is registered either way; only the status noise remains.
  }
};
