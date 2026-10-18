/**
 * Where the machine keeps its browsers, and the one shape both hosts speak.
 *
 * Each browser has a dir of its own under `<data>/browsers/<slug>/`: its
 * record (`record.json`, written whole by core's state-file), its lock
 * (`lock`, held by whoever starts, stops or removes it: the daemon, or
 * `cawco browser` in a terminal), and on the local host its profile. The
 * record is the truth both read: the daemon's frames, its idle-down and the
 * CLI act on the same file, so neither needs the other running. A record
 * holds neko's passwords, so the dirs are 0700 and the record 0600.
 */
import { mkdir, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import {
  BROWSER_SLOTS,
  type BrowserHostKind,
  type BrowserKey,
  type BrowserPorts,
  type BrowserRelay,
  type BrowserRow,
  type BrowserState,
  browserPorts,
  browserSlug,
  isBrowserKey,
} from "@cawco/core/browser";
import { openLockFile, tryLock, unlock } from "@cawco/core/flock";
import { cawcoDataDir } from "@cawco/core/paths";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";

/** What a browser's record keeps between processes. */
export interface BrowserRecord {
  /** The container host's: its container, image and volume, whether its media port was published for UDP, and neko's two passwords. */
  container?: {
    adminPassword: string;
    id: string;
    image: string;
    /** Published, and advertised, for UDP as well as TCP. */
    udp: boolean;
    userPassword: string;
    volume: string;
  };
  host: BrowserHostKind;
  key: BrowserKey;
  lastUsedAt: number;
  /** The local host's Chromium, by its identity, so a later process signals only it. */
  local?: { bootId?: string; pid: number; procStart: string };
  name: string;
  /** When the stream relay's credential the container was started with lapses (ms epoch). */
  relayExpiresAt?: number;
  /** The stream relay's URLs that credential is for. */
  relayUrls?: string[];
  /** Its place in BROWSER_PORTS, kept until it is removed. */
  slot: number;
  state: BrowserState;
  takeover: BrowserRow["takeover"];
  why?: string;
}

/** A host's part of a browser: the container's or the local Chromium's lifecycle. */
export interface BrowserHost {
  /** The DevTools address the gate (and nothing else) connects to. */
  devtoolsUrl: (record: BrowserRecord) => string;
  readonly kind: BrowserHostKind;
  /** Stops it and deletes its profile. */
  remove: (record: BrowserRecord) => Promise<void>;
  /** Whether the record's browser runs now, read from the runtime or the process. */
  running: (record: BrowserRecord) => Promise<boolean>;
  /** Starts (or wakes) it and answers the record once it is live. */
  start: (
    record: BrowserRecord,
    options: { relay?: BrowserRelay; progress: (row: Progress) => void }
  ) => Promise<BrowserRecord>;
  /** Stops it, keeping its profile. */
  stop: (record: BrowserRecord) => Promise<void>;
  readonly viewer: "neko" | "cdp";
}

/** A start's word while it pulls or builds the image. */
export type Progress = Pick<BrowserRow, "state" | "progress">;

/** Every browser's dir. */
export const browsersDir = (): string => join(cawcoDataDir(), "browsers");

/** One browser's dir. */
export const browserDir = (key: BrowserKey): string =>
  join(browsersDir(), browserSlug(key));

const recordFile = (key: BrowserKey): string =>
  join(browserDir(key), "record.json");

/** The record of `key`, or undefined when it has none (or it is damaged, said once in the log). */
export const readBrowser = async (
  key: BrowserKey
): Promise<BrowserRecord | undefined> => {
  try {
    return await readRecord<BrowserRecord>(recordFile(key));
  } catch (error) {
    if (isDamagedRecord(error)) {
      console.warn(`[browser] ${error.message}; ${key} starts afresh`);
      return;
    }
    throw error;
  }
};

/** Writes `record` whole. */
export const writeBrowser = async (record: BrowserRecord): Promise<void> => {
  await mkdir(browserDir(record.key), { recursive: true, mode: 0o700 });
  await writeStateFile(
    recordFile(record.key),
    `${JSON.stringify(record, null, 2)}\n`,
    { mode: 0o600 }
  );
};

/** Deletes `key`'s dir: its record, its lock and its local profile. */
export const forgetBrowser = (key: BrowserKey): Promise<void> =>
  rm(browserDir(key), { recursive: true, force: true });

/** Every browser this machine keeps a record of. */
export const allBrowsers = async (): Promise<BrowserRecord[]> => {
  const names = await readdir(browsersDir()).catch(() => [] as string[]);
  const keys = names
    .map((name) => name.replace("-", ":"))
    .filter((key): key is BrowserKey => isBrowserKey(key));
  const records = await Promise.all(keys.map(readBrowser));
  return records.filter((record): record is BrowserRecord => !!record);
};

/** How long a caller waits for a lock another holds before it says so. */
const LOCK_WAIT_MS = 15 * 60_000;
const LOCK_POLL_MS = 100;

/**
 * Runs `work` holding the lock at `path`: a start takes minutes the first
 * time (the image), so a second caller waits for it rather than racing it.
 */
const holding = async <T>(
  path: string,
  what: string,
  work: () => Promise<T>
): Promise<T> => {
  const fd = openLockFile(path, true);
  try {
    const until = Date.now() + LOCK_WAIT_MS;
    while (!tryLock(fd)) {
      if (Date.now() > until) {
        throw new Error(
          `${what} is held by another process of this machine for over ${LOCK_WAIT_MS / 60_000} minutes.`
        );
      }
      // biome-ignore lint/performance/noAwaitInLoops: polling a lock another process holds.
      await Bun.sleep(LOCK_POLL_MS);
    }
    return await work();
  } finally {
    unlock(fd);
  }
};

/** Runs `work` as the one process acting on `key`'s browser. */
export const withBrowser = async <T>(
  key: BrowserKey,
  work: () => Promise<T>
): Promise<T> => {
  await mkdir(browserDir(key), { recursive: true, mode: 0o700 });
  return holding(join(browserDir(key), "lock"), `The browser ${key}`, work);
};

/** Whether nothing on this machine listens on 127.0.0.1:`port` now. */
const portFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });

/**
 * The record of `key`, made with the lowest slot of BROWSER_PORTS no other
 * record keeps and whose ports are free now, when it has none.
 */
export const recordFor = async (
  key: BrowserKey,
  name: string,
  host: BrowserHostKind
): Promise<BrowserRecord> => {
  const kept = await readBrowser(key);
  if (kept) {
    return kept;
  }
  await mkdir(browsersDir(), { recursive: true, mode: 0o700 });
  return holding(
    join(browsersDir(), "slots.lock"),
    "The browser ports",
    async () => {
      const taken = new Set((await allBrowsers()).map((record) => record.slot));
      for (let slot = 0; slot < BROWSER_SLOTS; slot += 1) {
        if (taken.has(slot)) {
          continue;
        }
        const ports = Object.values(browserPorts(slot));
        // biome-ignore lint/performance/noAwaitInLoops: the first free slot, in order.
        const free = await Promise.all(ports.map(portFree));
        if (free.every(Boolean)) {
          const record: BrowserRecord = {
            key,
            name,
            host,
            slot,
            state: "asleep",
            lastUsedAt: Date.now(),
            takeover: null,
          };
          await writeBrowser(record);
          return record;
        }
      }
      throw new Error(
        `Every browser port of this machine (${ports(0).http}–${ports(BROWSER_SLOTS - 1).media}) is taken: stop or remove a browser first.`
      );
    }
  );
};

const ports = browserPorts;

/** The ports `record`'s host uses: DevTools and the gate on the local host, all four in a container. */
export const portsOf = (record: BrowserRecord): BrowserPorts => {
  const all = browserPorts(record.slot);
  return record.host === "container"
    ? all
    : { devtools: all.devtools, gate: all.gate };
};

/** Whether `url` answers 2xx within `ms` (a server that is starting, or one asked whether it is up). */
export const httpAnswers = async (
  url: string,
  ms: number
): Promise<boolean> => {
  const read = await readWithin(ms, (signal) =>
    fetch(url, { signal }).then(
      async (response) => {
        await response.body?.cancel();
        return response.ok;
      },
      () => false
    )
  );
  return read.kind === "answered" && read.value;
};
