/**
 * Files cawco writes into a checkout that are not the project's: kept out of
 * git's status through the checkout's own `info/exclude`.
 */
import { realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative as relativePath,
} from "node:path";
import { SAFE_GIT_ENV, SAFE_GIT_FLAGS } from "@cawco/core/safe-git";
import { writeStateFile } from "@cawco/core/state-file";
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

/** Where CawCo's own lines in a clone's `info/exclude` begin and end: it rewrites what lies between. */
const BLOCK_START =
  "# cawco: the stand-ins it made for the workspace's denied paths";
const BLOCK_END = "# cawco: end of stand-ins";

const LEADING_SLASH = /^\//u;

/**
 * The `info/exclude` of the checkout `dir` lies in, by its absolute path (the
 * common one for a linked worktree); undefined outside a checkout.
 */
export const infoExcludeOf = (dir: string): Promise<string | undefined> =>
  gitIn(dir, [
    "rev-parse",
    "--path-format=absolute",
    "--git-path",
    "info/exclude",
  ]);

/** A clone's own `info/exclude`, by its absolute path. */
const excludeFileOf = async (clone: string): Promise<string> => {
  const exclude = await infoExcludeOf(clone);
  if (!exclude) {
    throw new Error(`${clone} has no git dir to keep its stand-ins out of`);
  }
  return exclude;
};

/** A clone's `info/exclude`: CawCo's block's paths (relative to the clone), and every other line. */
export const readExclude = async (
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

/**
 * CawCo's block in a clone's `info/exclude`, written whole: one anchored line
 * for each of `paths` (relative to the clone), the stand-ins it made there,
 * so git never sees them and nothing else is hidden. Every line outside the
 * block is someone else's and stays as it is. Written only when that changes
 * it.
 */
export const excludeStandIns = async (
  clone: string,
  paths: readonly string[]
): Promise<void> => {
  const exclude = await excludeFileOf(clone);
  const before = await Bun.file(exclude)
    .text()
    .catch(() => "");
  const kept = [...(await readExclude(exclude)).rest];
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
  await writeStateFile(exclude, after);
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
    infoExcludeOf(cwd),
  ]);
  if (!(top && exclude)) {
    return;
  }
  // The path itself is never resolved: a placed skill is a link into its
  // tree store (tree-swap.ts), and the link is what git lists.
  const inside = relativePath(
    await realpath(top),
    join(await realpath(cwd).catch(() => cwd), basename(path))
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
    const lead = current === "" || current.endsWith("\n") ? "" : "\n";
    await writeStateFile(exclude, `${current}${lead}${line}\n`);
  } catch {
    // The hook is registered either way; only the status noise remains.
  }
};
