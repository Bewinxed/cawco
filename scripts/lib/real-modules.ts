/**
 * A real `node_modules` folder for one command's run, in a checkout whose
 * `node_modules` is a symlink: a CawCo workspace's, which links into the
 * workspaces' cache so bun hard-links its packages there (agent
 * workspace-modules.ts).
 *
 * WHY. Biome reads a package's types only through a `node_modules` that is a
 * folder of the project. Where `<dir>/node_modules` is a symlink, its
 * resolver follows it to the target (`Ok(PathInfo::Symlink {
 * canonicalized_target }) => Cow::Owned(canonicalized_target)`,
 * biome_resolver `resolve_dependency`), outside the project, and every type a
 * package gives reads as unknown: its type-aware rules said nothing there.
 * At 2.6.3 and 2.6.5 a lint error a package's types make
 * (noUnnecessaryConditions on playwright's `headers()[name] ?? ""`) passed
 * every merge check, run in a workspace, and failed the release's, run in a
 * checkout bun installed into a folder (2026-11-05).
 *
 * HOW. For the command's run alone, `node_modules` is a folder made here:
 * each link bun made (a package, a scope's packages, `.bin`'s commands) is
 * made again with the same words, so it still resolves within the project,
 * through `.bun`; every folder (`.bun`, `.cache`) is a link to the target's.
 * The link is moved aside to {@link LINK} meanwhile, and back once the
 * command ends. A namespace of its own, the command's alone, is refused
 * inside a workspace's boundary ("bwrap: Creating new namespace failed:
 * nesting depth or /proc/sys/user/max_*_namespaces exceeded (ENOSPC)"), and
 * a bind of the cache's folder would be a mount of its own, across which bun
 * cannot hard-link (link(2): EXDEV), so the swap is on the checkout itself.
 *
 * While it stands, every process in the checkout resolves through it, and
 * TypeScript then reads a package at its place in the cache rather than
 * under `node_modules/.bun` (resolution-check failed on `bits-ui`, run beside
 * Biome), so check.ts runs Biome `alone` (lib/checks.ts).
 *
 * Every way back: the run's own end; a guard process in a session of its
 * own, which puts it back once the run's process is gone (killed with its
 * group on a check's time limit); and {@link restoreModules} at the start of
 * the next run, which also waits for another run's swap to end.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { processStart } from "../../packages/core/src/process-identity";
import { identifiedPid, ownPid } from "../../packages/core/src/signal";
import { readRecord } from "../../packages/core/src/state-file";
import { ROOT } from "./repo-files";

const MODULES = join(ROOT, "node_modules");
/**
 * Where the swap keeps what it moves aside: each under a folder named
 * `node_modules`, which every tool walking the tree leaves out (TypeScript's
 * `exclude` default, git's ignore rule, Biome, knip). A link moved to the
 * root as `node_modules.cawco-link` was read as the checkout's own:
 * `golar tsc -b`, running beside Biome, type-checked the packages' examples
 * through it (TS2307 on node_modules.cawco-link/@earendil-works/…).
 */
const HELD = join(ROOT, ".cawco-modules");
/** The link, moved aside while the folder stands. */
const LINK = join(HELD, "link", "node_modules");
/** The folder, while it is made and once it is taken down. */
const SHIM = join(HELD, "made", "node_modules");
/** Whose swap it is: `{ pid, procStart }`. */
const OWNER = join(HELD, "owner.json");
/** A folder whose entries are links bun made, made again one by one. */
const LINK_FOLDER = /^(?:@.+|\.bin)$/u;
const WAIT_MS = 200;

const isLink = (path: string): boolean => {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
};

/** Makes in `to` each of `from`'s entries: a link as its words, a scope's or `.bin`'s folder entry by entry, any other folder or file a link to it. */
const mirror = (from: string, to: string): void => {
  mkdirSync(to);
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const made = join(to, entry.name);
    if (entry.isSymbolicLink()) {
      symlinkSync(readlinkSync(source), made);
    } else if (entry.isDirectory() && LINK_FOLDER.test(entry.name)) {
      mirror(source, made);
    } else {
      symlinkSync(source, made);
    }
  }
};

/** What in `dir` {@link mirror} did not make: neither a link nor a folder of links it made. */
const foreign = (dir: string, under = ""): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = `${under}${entry.name}`;
    if (entry.isSymbolicLink()) {
      return [];
    }
    if (entry.isDirectory() && LINK_FOLDER.test(entry.name) && !under) {
      return foreign(join(dir, entry.name), `${name}/`);
    }
    return [name];
  });

/** Puts the link back where a swap left it (none is a no-op). */
const putBack = (): void => {
  if (!isLink(LINK)) {
    rmSync(HELD, { recursive: true, force: true });
    return;
  }
  if (existsSync(MODULES) && !isLink(MODULES)) {
    // The folder holds links alone; anything a command wrote at its top
    // while it stood would go with it, and is said.
    const target = readlinkSync(LINK);
    for (const entry of foreign(MODULES)) {
      console.error(
        `real-modules: node_modules/${entry} was written while node_modules was a folder for one run, and is not kept: write it to ${target} instead`
      );
    }
    renameSync(MODULES, SHIM);
  }
  renameSync(LINK, MODULES);
  // Links alone are left in it: a recursive removal takes no link's target.
  rmSync(HELD, { recursive: true, force: true });
};

const OwnerShape = z.object({ pid: z.number(), procStart: z.string() });

/** The live process whose swap stands; undefined when none, or its process is gone. */
const ownerOf = async (): Promise<number | undefined> => {
  const record = await readRecord(OWNER, OwnerShape).catch(() => undefined);
  return record ? await identifiedPid(record) : undefined;
};

/**
 * Leaves the checkout as its install made it: waits while another live run's
 * swap stands, and puts back one whose run is gone.
 */
const restoreModules = async (): Promise<void> => {
  while (isLink(LINK) || existsSync(SHIM)) {
    const owner = await ownerOf();
    if (owner === undefined || owner === process.pid) {
      putBack();
      return;
    }
    await Bun.sleep(WAIT_MS);
  }
};

/**
 * Runs `run` with `node_modules` a folder of the project; where it is one
 * already (a release's checkout, a person's clone), as it is. `guard` is
 * started, in a session of its own, with this process's pid, to put the link
 * back should this process be killed before it can.
 */
export const withRealModules = async <T>(
  run: () => Promise<T>,
  guard: (pid: number) => void
): Promise<T> => {
  await restoreModules();
  if (!isLink(MODULES)) {
    return run();
  }
  const target = realpathSync(MODULES);
  const procStart = await processStart(ownPid());
  if (procStart === undefined) {
    throw new Error(
      "real-modules: this process's start could not be read, so no guard could tell its swap from another's, and node_modules is left a link: Biome would not read a package's types"
    );
  }
  mkdirSync(join(HELD, "link"), { recursive: true });
  mkdirSync(join(HELD, "made"), { recursive: true });
  writeFileSync(OWNER, JSON.stringify({ pid: process.pid, procStart }));
  try {
    mirror(target, SHIM);
    renameSync(MODULES, LINK);
    renameSync(SHIM, MODULES);
  } catch (error) {
    putBack();
    throw new Error(
      `real-modules: node_modules could not be made a folder for this run, so Biome would not read a package's types: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
  guard(process.pid);
  process.on("exit", putBack);
  try {
    return await run();
  } finally {
    process.off("exit", putBack);
    putBack();
  }
};

/** The guard's side: waits for `pid` to end, then puts back what its swap left. */
export const guardModules = async (pid: number): Promise<void> => {
  while ((await ownerOf()) === pid) {
    await Bun.sleep(WAIT_MS);
  }
  if ((await ownerOf()) === undefined) {
    await restoreModules();
  }
};
