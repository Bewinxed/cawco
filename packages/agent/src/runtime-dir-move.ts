/**
 * The stores the agent kept in the runtime dir moved, once, to disk, as the
 * agent starts: the redaction stores to their own dir (core paths/cawco.ts
 * `redactionStoreDir`, {@link moveRedactionStores}), and each account's
 * OpenCode data home to the harness stores' root (core paths/harnesses.ts
 * `harnessStoresDir`, {@link moveOpencodeAccountHomes}).
 *
 * Until this move both lived in the session credentials' dir (core
 * paths/cawco.ts `sessionIdentityDir`), which on Linux is under
 * `$XDG_RUNTIME_DIR`, a tmpfs: the reboot of 2026-11-11 emptied it, and 32
 * OpenCode sessions went with their account databases. Each runs before
 * anything reads its store; from then on nothing reads the old place.
 */
import { lstatSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { cp, lstat, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { makeFolder, makeFolderSync } from "@cawco/core/folders";
import {
  isRedactionStoreName,
  redactionStoreDir,
  sessionIdentityDir,
} from "@cawco/core/paths/cawco";
import {
  harnessStoresDir,
  opencodeAccountHome,
} from "@cawco/core/paths/harnesses";
import {
  commandLines,
  processArgs,
  processStart,
} from "@cawco/core/process-identity";
import {
  identifiedPid,
  signalGroup,
  signal as signalPid,
} from "@cawco/core/signal";
import { writeStateFileSync } from "@cawco/core/state-file";

/** The database an OpenCode 2.0 data home holds: what makes a home a store. */
const DATABASE = join("opencode", "opencode.db");

/** The credential file 1.x kept in a data home: never carried, as 2.0 takes the credential through its API. */
const LEGACY_CREDENTIAL = join("opencode", "auth.json");

/** How long an old home's server is given to end on SIGTERM, then on SIGKILL, ms: a retired generation's grace (opencode-server.ts `#end`). */
const TERM_GRACE_MS = 15_000;
const KILL_GRACE_MS = 5000;

/**
 * Where a home is copied before it is renamed into place, outside every
 * dir a reader lists: a copy a crash or a reboot cut short is never taken
 * for an account's home, and the next start removes it.
 */
const stagingRoot = (): string => join(harnessStoresDir(), "moving");

/** Whether `path` is there. */
const there = async (path: string): Promise<boolean> =>
  (await lstat(path).catch(unlessGone(undefined))) !== undefined;

/**
 * Every process that runs on data home `home`: its `XDG_DATA_HOME` is that
 * dir. Each is an OpenCode server CawCo started for the account (only its own
 * user's processes say their environment), with its start, so a pid taken
 * since by another process is never signalled.
 */
const serversOn = async (
  home: string
): Promise<{ pid: number; start: string }[]> => {
  const found: { pid: number; start: string }[] = [];
  for (const { pid } of await commandLines()) {
    if (pid === process.pid) {
      continue;
    }
    const data = (await processArgs(pid))?.env
      .find((entry) => entry.startsWith("XDG_DATA_HOME="))
      ?.slice("XDG_DATA_HOME=".length);
    if (data === undefined || resolve(data) !== resolve(home)) {
      continue;
    }
    const start = await processStart(pid);
    if (start) {
      found.push({ pid, start });
    }
  }
  return found;
};

/** Whether the process recorded as `pid` with start `start` still runs. */
const runs = async (pid: number, start: string): Promise<boolean> =>
  (await processStart(pid)) === start;

/** Sends `sig` to the server and its process group (it leads one: its keeper starts every child detached), while it is still the one found. */
const send = async (
  pid: number,
  start: string,
  sig: NodeJS.Signals
): Promise<void> => {
  const identified = await identifiedPid({ pid, procStart: start });
  if (identified === undefined) {
    return;
  }
  signalGroup(identified, sig);
  signalPid(identified, sig);
};

/** Waits up to `ms` for the process to end; whether it did. */
const ended = async (
  pid: number,
  start: string,
  ms: number
): Promise<boolean> => {
  const deadline = Date.now() + ms;
  while (await runs(pid, start)) {
    if (Date.now() >= deadline) {
      return false;
    }
    await Bun.sleep(200);
  }
  return true;
};

/**
 * Every server on `home` ended, so its database is still while it is
 * copied: SIGTERM, then SIGKILL after a grace, as a retired generation is
 * ended. Its sessions' records stay; the agent's start finds the server gone
 * and the next turn starts one on the new home.
 */
const endServersOn = async (home: string, account: string): Promise<void> => {
  for (const { pid, start } of await serversOn(home)) {
    console.info(
      `[opencode] account ${account}'s server ${pid} runs on its data home in the runtime dir; ending it so the home moves still`
    );
    await send(pid, start, "SIGTERM");
    if (await ended(pid, start, TERM_GRACE_MS)) {
      continue;
    }
    await send(pid, start, "SIGKILL");
    if (!(await ended(pid, start, KILL_GRACE_MS))) {
      throw new Error(
        `Account ${account}'s OpenCode server ${pid} on ${home} did not end after SIGKILL, so its data home cannot move.`
      );
    }
  }
};

/** Flushes `path` (a file or a folder) to the disk. */
const flush = async (path: string): Promise<void> => {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
};

/** Flushes every file and folder in `dir`, the folders after what is in them, and `dir` last; links are left as they are. */
const flushTree = async (dir: string): Promise<void> => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await flushTree(path);
    } else if (entry.isFile()) {
      await flush(path);
    }
  }
  await flush(dir);
};

/**
 * `from` moved to `to`: copied whole into the staging dir, flushed to the
 * disk, renamed into place and its parent flushed, then `from` removed. The
 * runtime dir is a tmpfs and the stores' root is on disk, so no rename
 * crosses them. A crash before the rename leaves `from` whole and the next
 * start copies again; after it, `to` is whole and holds the database, and the
 * next start finds it there. Links are copied as links (the account's
 * `snapshot`, the machine's own snapshot dir); `auth.json` is not copied.
 */
const moveHome = async (
  account: string,
  from: string,
  to: string
): Promise<void> => {
  const staging = join(stagingRoot(), account);
  await makeFolder(stagingRoot());
  await makeFolder(dirname(to));
  await cp(from, staging, {
    recursive: true,
    verbatimSymlinks: true,
    preserveTimestamps: true,
    filter: (source) => resolve(source) !== resolve(from, LEGACY_CREDENTIAL),
  });
  await flushTree(staging);
  await rm(to, { recursive: true, force: true });
  await rename(staging, to);
  await flush(dirname(to));
  await rm(from, { recursive: true, force: true });
};

/**
 * Each account's OpenCode data home in the runtime dir that holds a database,
 * moved to {@link opencodeAccountHome} when no database is there: its servers
 * ended first, then copied, flushed and removed ({@link moveHome}), one line
 * said for each. A home with no database moves nothing; one whose new place
 * already holds a database is left where it is, said. Run once, as the agent
 * starts, before anything can start a harness server; a home that cannot
 * move fails the start, so no server ever starts on an empty home while the
 * account's sessions are elsewhere.
 */
export const moveOpencodeAccountHomes = async (): Promise<void> => {
  await rm(stagingRoot(), { recursive: true, force: true });
  const old = join(sessionIdentityDir(), "opencode-accounts");
  const accounts = await readdir(old).catch(unlessGone([]));
  for (const account of accounts) {
    const from = join(old, account);
    if (!(await there(join(from, DATABASE)))) {
      continue;
    }
    const to = opencodeAccountHome(account);
    if (await there(join(to, DATABASE))) {
      console.warn(
        `[opencode] account ${account}'s data home is at ${to} already; the copy left at ${from} is not read`
      );
      continue;
    }
    await endServersOn(from, account);
    await moveHome(account, from, to);
    console.info(
      `[opencode] moved account ${account}'s data home from ${from} to ${to}`
    );
  }
};

/**
 * Each hub's redaction store in the runtime dir moved to
 * {@link redactionStoreDir} when none is there: written whole, owner-only and
 * flushed (core state-file.ts `writeStateFileSync`: a temporary file, fsync,
 * rename, the dir flushed), then the old file removed, one line said for
 * each. One whose new place already holds a store is left where it is, said.
 *
 * Synchronous, and the first thing the agent does (daemon.ts `runDaemon`):
 * the redaction module reads its store once, at the first line it redacts,
 * and keeps what it read, so the store is in its new place before the first
 * log line, or the agent would redact with none of the values and write its
 * next value over the moved store.
 */
export const moveRedactionStores = (): void => {
  const old = sessionIdentityDir();
  const names = (
    lstatSync(old, { throwIfNoEntry: false })?.isDirectory()
      ? readdirSync(old)
      : []
  ).filter(isRedactionStoreName);
  for (const name of names) {
    const from = join(old, name);
    const to = join(redactionStoreDir(), name);
    if (lstatSync(to, { throwIfNoEntry: false })) {
      console.warn(
        `[redaction] the store ${name} is at ${to} already; the copy left at ${from} is not read`
      );
      continue;
    }
    makeFolderSync(redactionStoreDir(), { mode: 0o700 });
    writeStateFileSync(to, readFileSync(from), { mode: 0o600 });
    rmSync(from, { force: true });
    console.info(`[redaction] moved the store ${name} from ${from} to ${to}`);
  }
};
