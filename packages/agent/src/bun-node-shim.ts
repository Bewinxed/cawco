/**
 * Bun's `--bun` node shim, made on the host for every workspace's boundary.
 *
 * `bun --bun` and `bunx --bun` run a package's bin under Bun by putting a dir
 * holding `node` and `bun` links to the running bun first on its children's
 * `PATH`. Bun makes that dir itself, at a path fixed when it is built:
 * `/tmp/bun-node-<sha>` on Linux, `/private/tmp/bun-node-<sha>` on macOS
 * (`RunCommand::BUN_NODE_DIR`, src/install/lib.rs at bun-v1.4.3: "`/tmp/bun-node-<sha>`
 * (or debug variant). Windows builds compute the path at runtime via
 * GetTempPathW"); it reads no `TMPDIR` for it (oven-sh/bun#41435, which would
 * have, was closed unmerged). A boundary lets a command write neither path
 * (Linux: `/tmp` is an empty read-only tmpfs, boundary-policy.ts
 * `srtSettings`; macOS: only the policy's paths are written). There Bun's
 * `mkdir` fails, it keeps `PATH` as it was ("`Err(_) => return Ok(())`"), and
 * the bin runs under the first `node` on `PATH`: `bunx --bun vite build` of a
 * SvelteKit app importing `bun:sqlite` failed with
 * `ERR_UNSUPPORTED_ESM_URL_SCHEME` in every workspace (2026-10-19).
 *
 * So the agent makes that dir on the host, exactly as Bun makes it (`0700`,
 * owned by this user, `node` and `bun` linking to the real path of the bun a
 * workspace's shell finds first on `PATH`, which every session inherits from
 * the agent, core session-env.ts), before a boundary starts and at every
 * look at it. Inside, Bun's `mkdir` and `symlink` meet what is there
 * (EEXIST), its checks pass (a dir of this uid with no group or other write
 * bit; each link already naming its own real path), and it puts the dir on
 * `PATH`. The workspace only reads it: on Linux srt binds it back read-only
 * into the sandbox's `/tmp` (`SrtPlace.bunNode`); on macOS `/private/tmp` is
 * read as it stands. Where the host's dir cannot be Bun's (another user's, or
 * group-writable), there is no shim, as there is none for the host's own bun.
 */
import {
  lstat,
  mkdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { hostEnvironment } from "@cawco/core/session-env";

/** The root of Bun's `BUN_NODE_DIR` on this OS. */
const BUN_NODE_ROOT = process.platform === "darwin" ? "/private/tmp" : "/tmp";

/** `bun --revision`: `1.4.3+c6da4a4d3`, the version and the commit Bun names its dir by. */
const REVISION = /^\S+\+([0-9a-f]+)$/;

/** The shim dir of the bun last looked at, keyed by its real path and its file's change. */
let known: { key: string; dir: string | undefined } | undefined;

/** What was last said of a shim not made, so each reason is logged once. */
let said: string | undefined;

const unmade = (why: string): undefined => {
  if (said !== why) {
    said = why;
    console.info(`[workspace] no bun --bun node shim for workspaces: ${why}`);
  }
};

/** `bun`'s shim dir, as Bun names it: by the commit in its `--revision`. */
const shimDirOf = async (bun: string): Promise<string | undefined> => {
  const ran = await Bun.$`${bun} --revision`
    .env(hostEnvironment())
    .quiet()
    .nothrow();
  const revision = ran.stdout.toString().trim();
  const sha = REVISION.exec(revision)?.[1];
  return sha === undefined
    ? unmade(
        `${bun} --revision said ${JSON.stringify(revision || ran.stderr.toString().trim())}, which names no commit`
      )
    : join(BUN_NODE_ROOT, `bun-node-${sha}`);
};

/** `link` naming `bun`: made, or made again where it names anything else. */
const linked = async (link: string, bun: string): Promise<void> => {
  if ((await readlink(link).catch(() => undefined)) === bun) {
    return;
  }
  await rm(link, { force: true });
  try {
    await symlink(bun, link);
  } catch (error) {
    // The host's own bun made it in between: kept when it names the same bun.
    const raced =
      (error as NodeJS.ErrnoException).code === "EEXIST" &&
      (await readlink(link).catch(() => undefined)) === bun;
    if (!raced) {
      throw error;
    }
  }
};

/**
 * The shim dir of the bun a workspace's commands run, made on the host as
 * Bun makes it, or nothing where there is no such bun or the host's dir is
 * not this user's own.
 */
export const bunNodeShim = async (): Promise<string | undefined> => {
  const found = Bun.which("bun");
  if (!found) {
    return unmade("no bun on the agent's PATH");
  }
  const bun = await realpath(found);
  const file = await stat(bun);
  const key = `${bun}\0${file.mtimeMs}\0${file.size}`;
  if (known?.key !== key) {
    known = { key, dir: await shimDirOf(bun) };
  }
  const { dir } = known;
  if (dir === undefined) {
    return undefined;
  }
  try {
    await mkdir(dir, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") {
        throw error;
      }
    });
    const held = await lstat(dir);
    // biome-ignore lint/suspicious/noBitwiseOperators: the group and other write bits, tested as a mask, as Bun tests them
    const othersWrite = (held.mode & 0o022) !== 0;
    if (!held.isDirectory() || held.uid !== process.getuid?.() || othersWrite) {
      return unmade(
        `${dir} is not a dir of this user's own with no group or other write bit, which Bun refuses too`
      );
    }
    await linked(join(dir, "node"), bun);
    await linked(join(dir, "bun"), bun);
  } catch (error) {
    return unmade(`${dir} could not be made: ${(error as Error).message}`);
  }
  said = undefined;
  return dir;
};
