/**
 * Files cawco writes into a checkout that are not the project's: kept out of
 * git's status through the checkout's own `info/exclude`.
 */
import { appendFile, mkdir, realpath, writeFile } from "node:fs/promises";
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
 * The fixed lines earlier builds kept every deny name out of a clone's status
 * with, whoever made the file: srt's own names, unanchored, and the harness
 * project config at the root. They hid a user's own untracked `.vscode` or
 * `.mcp.json` too; each stand-in CawCo made is listed by its own anchored
 * line in CawCo's block now ({@link excludeStandIns}), and these go.
 */
const RETIRED_LINES = new Set([
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
]);

/** Where CawCo's own lines in a clone's `info/exclude` begin and end: it rewrites what lies between. */
const BLOCK_START =
  "# cawco: the stand-ins it made for the workspace's denied paths";
const BLOCK_END = "# cawco: end of stand-ins";

const LEADING_SLASH = /^\//;

/** A clone's own `info/exclude`, by its absolute path. */
const excludeFileOf = async (clone: string): Promise<string> => {
  const exclude = await gitIn(clone, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/exclude",
  ]);
  if (!exclude) {
    throw new Error(`${clone} has no git dir to keep its stand-ins out of`);
  }
  return exclude;
};

/** A clone's `info/exclude`: CawCo's block's paths (relative to the clone), and every other line. */
const readExclude = async (
  exclude: string
): Promise<{ readonly listed: string[]; readonly rest: string[] }> => {
  const text = await Bun.file(exclude)
    .text()
    .catch(() => "");
  const listed: string[] = [];
  const rest: string[] = [];
  let inside = false;
  for (const line of text.split("\n")) {
    if (line === BLOCK_START) {
      inside = true;
    } else if (line === BLOCK_END) {
      inside = false;
    } else if (inside) {
      listed.push(line.replace(LEADING_SLASH, ""));
    } else {
      rest.push(line);
    }
  }
  return { listed, rest };
};

/** The stand-ins a clone's `info/exclude` lists in CawCo's block, as last written, relative to the clone. */
export const excludedStandIns = async (clone: string): Promise<string[]> =>
  (await readExclude(await excludeFileOf(clone))).listed.filter(Boolean);

/**
 * CawCo's block in a clone's `info/exclude`, written whole: one anchored line
 * for each of `paths` (relative to the clone), the stand-ins it made there,
 * so git never sees them and nothing else is hidden. The lines earlier builds
 * kept fixed ({@link RETIRED_LINES}) go; every other line stays as it is.
 * Written only when that changes it.
 */
export const excludeStandIns = async (
  clone: string,
  paths: readonly string[]
): Promise<void> => {
  const exclude = await excludeFileOf(clone);
  const before = await Bun.file(exclude)
    .text()
    .catch(() => "");
  const { rest } = await readExclude(exclude);
  const kept = rest.filter((line) => !RETIRED_LINES.has(line.trim()));
  while (kept.length > 0 && kept.at(-1) === "") {
    kept.pop();
  }
  const block =
    paths.length > 0
      ? [
          BLOCK_START,
          ...[...new Set(paths)].map((path) => `/${path}`),
          BLOCK_END,
        ]
      : [];
  const lines = [...kept, ...block];
  const after = lines.length > 0 ? `${lines.join("\n")}\n` : "";
  if (after === before) {
    return;
  }
  await mkdir(dirname(exclude), { recursive: true });
  await writeFile(exclude, after);
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
