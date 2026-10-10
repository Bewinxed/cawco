/**
 * Files cawco writes into a checkout that are not the project's: kept out of
 * git's status through the checkout's own `info/exclude`.
 */
import { appendFile, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative as relativePath } from "node:path";
import { projectClaudeDir } from "@cawco/core/paths";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
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
    const child = Bun.spawn([git, ...SAFE_GIT_FLAGS, "-C", cwd, ...args], {
      env: { ...toolEnv(), ...SAFE_GIT_ENV },
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
 * What a workspace's sandbox may leave in its clone, as git sees it: for a
 * protected name that does not exist, srt mounts a read-only empty file there
 * for the sandbox's life (its README, "Mandatory Deny Paths"), and `git add
 * -A` then refuses it ("can only add regular files", REPORT.md §5c). srt's own
 * names, unanchored as srt applies them (`DANGEROUS_FILES` and
 * `getDangerousDirectories()` in sandbox-utils.ts at 0.0.79), and the harness
 * project config the workspace's policy denies at the clone's root, which
 * the boundary's host makes as real empty stand-ins before each sandbox
 * (`cloneDenies`), so srt leaves no file of its own there.
 */
const SANDBOX_NAMES = [
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
  ".mcp.json",
  ".vscode",
  ".idea",
  projectClaudeDir("", "commands"),
  projectClaudeDir("", "agents"),
  ...["settings.json", "settings.local.json", "hooks"].map(
    (name) => `/${projectClaudeDir("", name)}`
  ),
  "/opencode.json",
  "/opencode.jsonc",
  "/.opencode",
];

/**
 * Keeps {@link SANDBOX_NAMES} out of a workspace clone's status, through its
 * own `info/exclude`, each line added once. Written before its boundary
 * starts; a tracked file is the project's own and stays tracked.
 */
export const excludeSandboxNames = async (clone: string): Promise<void> => {
  const exclude = await gitIn(clone, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/exclude",
  ]);
  if (!exclude) {
    throw new Error(
      `${clone} has no git dir to keep its sandbox's names out of`
    );
  }
  const current = await Bun.file(exclude)
    .text()
    .catch(() => "");
  const lines = new Set(current.split("\n").map((each) => each.trim()));
  const missing = SANDBOX_NAMES.filter((name) => !lines.has(name));
  if (missing.length === 0) {
    return;
  }
  await mkdir(dirname(exclude), { recursive: true });
  const lead = current === "" || current.endsWith("\n") ? "" : "\n";
  await appendFile(exclude, `${lead}${missing.join("\n")}\n`);
};

/**
 * Keeps a file cawco wrote into a checkout out of its status (a project
 * hook's `.claude/settings.json`): one line
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
