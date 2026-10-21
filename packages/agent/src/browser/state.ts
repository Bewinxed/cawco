/**
 * Where the machine keeps its browsers, and the one shape both hosts speak.
 *
 * Each browser has a dir of its own under `<data>/browsers/<slug>/`: its
 * record (`record.json`, written whole by core's state-file) and its lock
 * (`lock`, held by whoever starts, stops or removes it: the daemon, or
 * `cawco browser` in a terminal). The record is the truth both read: the
 * daemon's frames, its idle-down and the CLI act on the same file, so
 * neither needs the other running. A record holds neko's passwords, so the
 * dirs are 0700 and the record 0600.
 *
 * On the local host, Chromium's own files (its profile and its output) are
 * under `<data>/chromium/<slug>/` ({@link chromiumDir}), outside the dir the
 * daemon watches for records (browsers.ts `watchBrowsers`): a running
 * Chromium writes its profile many times a second, and on macOS a watch
 * of a dir is an FSEvents stream over everything beneath it, so each of
 * those writes would be queued by fseventsd for the daemon and handed to it.
 */
import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import type { MediaPath } from "@cawco/core/capabilities";
import { lockBy, openLockFile, unlock } from "@cawco/core/flock";
import { cawcoDataDir } from "@cawco/core/paths";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";

/** What a browser's record keeps between processes. */
export interface BrowserRecord {
  /** The container host's: its container, image and volume, what its media port was published for, and neko's two passwords. */
  container?: {
    /** Its slot's address on the runtime's media network (media-network.ts): one made elsewhere is made again. */
    address?: string;
    adminPassword: string;
    id: string;
    image: string;
    /** What its media port was published, and neko's candidates advertised, for. */
    media: MediaPath;
    /**
     * Chromium's `--host-resolver-rules` it was made with: the hub's preview
     * names that resolve to this machine's loopback, mapped to the machine
     * (preview-names.ts). One made for other rules is made again.
     */
    hostRules?: string;
    /** The ports it was published on: one made for other ports is made again. */
    ports?: BrowserPorts;
    /** The runtime it was made on, as the record names it while that runtime is away. */
    runtime?: { endpoint: string; kind: "docker" | "podman" };
    /** The STUN server neko's own ICE servers name (core `stunServer`): one made for another is made again. */
    stun?: string;
    userPassword: string;
    volume: string;
  };
  /**
   * The host it runs on. A browser made for the first time picks it from
   * what answers then; one made on the local host moves into a container
   * once a runtime answers, its sign-ins carried (browsers.ts
   * `moveIntoContainer`), and a container browser stays one for good.
   */
  host: BrowserHostKind;
  key: BrowserKey;
  lastUsedAt: number;
  /** The local host's Chromium, by its identity, so a later process signals only it. */
  local?: { bootId?: string; pid: number; procStart: string };
  name: string;
  /**
   * The stream relay's credential the hub's last `browser.start` brought: a
   * wake by the gate starts with it, so a container made again keeps its
   * relay.
   */
  relay?: BrowserRelay;
  /** When the stream relay's credential the container was started with lapses (ms epoch). */
  relayExpiresAt?: number;
  /** The relay that credential is for, its URLs and its reach (relay-urls.ts `relayKeyOf`). */
  relayKey?: string;
  /**
   * A container browser whose runtime does not answer now: not live, its
   * `why` naming the runtime, started again as soon as the runtime answers.
   * Its container and volume are kept.
   */
  runtimeAway?: true;
  /**
   * Its place in BROWSER_PORTS, taken as it first starts and kept until it is
   * removed. None while it was only reserved for a session's browser tool.
   */
  slot?: number;
  state: BrowserState;
  takeover: BrowserRow["takeover"];
  why?: string;
}

/** A host's part of a browser: the container's or the local Chromium's lifecycle. */
export interface BrowserHost {
  /** The DevTools address the gate (and nothing else) connects to. */
  devtoolsUrl: (record: BrowserRecord) => string;
  /** The slots another agent's browsers hold on this host's runtime, running or stopped; none where the host shares nothing. */
  heldSlots?: () => Promise<ReadonlySet<number>>;
  readonly kind: BrowserHostKind;
  /** Stops it and deletes its profile. */
  remove: (record: BrowserRecord) => Promise<void>;
  /**
   * Whether the record's container was made with other preview-name rules
   * than the hub wants now (container-host.ts); none on a host that maps no
   * names.
   */
  rulesDue?: (record: BrowserRecord) => Promise<boolean>;
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

/** The file in a browsers dir naming the agent that keeps them. */
const OWNER_FILE = "owner";

/**
 * This agent's mark on what it makes on a container runtime (its containers'
 * and volumes' names and owner label, container-host.ts): a random id kept
 * in its browsers dir beside the records, made once (an exclusive create, so
 * the daemon and `cawco browser` agree on it). A machine's id is every
 * agent's on it (core machine-id.ts hashes `/etc/machine-id` or the Mac's
 * IOPlatformUUID with the host's name), so two agents of one machine on one
 * runtime (two users of a rootful Docker, two scratch fleets) keep the same
 * keys; their owners are their own.
 */
export const browserOwner = async (): Promise<string> => {
  const kept = await keptBrowserOwner(browsersDir());
  if (kept) {
    return kept;
  }
  await mkdir(browsersDir(), { recursive: true, mode: 0o700 });
  const made = randomBytes(6).toString("hex");
  try {
    await writeFile(join(browsersDir(), OWNER_FILE), `${made}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return made;
  } catch (error) {
    const first = await keptBrowserOwner(browsersDir());
    if ((error as { code?: string }).code === "EEXIST" && first) {
      return first;
    }
    throw error;
  }
};

/** The owner the browsers dir `dir` names, or undefined while its agent has made none. */
export const keptBrowserOwner = async (
  dir: string
): Promise<string | undefined> =>
  (await readFile(join(dir, OWNER_FILE), "utf8").catch(() => "")).trim() ||
  undefined;

/** One browser's dir. */
export const browserDir = (key: BrowserKey): string =>
  join(browsersDir(), browserSlug(key));

/** One local browser's Chromium files: its profile and its output, beside no record. */
export const chromiumDir = (key: BrowserKey): string =>
  join(cawcoDataDir(), "chromium", browserSlug(key));

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

/** Deletes `key`'s dirs: its record, its lock, and its local Chromium's profile and output. */
export const forgetBrowser = async (key: BrowserKey): Promise<void> => {
  await Promise.all(
    [browserDir(key), chromiumDir(key)].map((dir) =>
      rm(dir, { recursive: true, force: true })
    )
  );
};

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
    if (!(await lockBy(fd, Date.now() + LOCK_WAIT_MS))) {
      throw new Error(
        `${what} is held by another process of this machine for over ${LOCK_WAIT_MS / 60_000} minutes.`
      );
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
 * The record of `key`, made when it has none: asleep, holding no ports until
 * it first starts ({@link slotted}).
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
  const record: BrowserRecord = {
    key,
    name,
    host,
    state: "asleep",
    lastUsedAt: Date.now(),
    takeover: null,
  };
  await writeBrowser(record);
  return record;
};

/**
 * `record` with its ports: the lowest slot of BROWSER_PORTS no other record
 * keeps, none of `held` (the slots another agent's browsers hold on the same
 * runtime, running or stopped: their ports and their media network address,
 * container-host.ts `heldSlots`), and whose ports are free now, taken and
 * written as it first starts. A kept slot another agent's browser holds is
 * given up for a free one, so no two browsers on one runtime share ports or
 * an address.
 */
export const slotted = async (
  record: BrowserRecord,
  held: ReadonlySet<number> = new Set()
): Promise<BrowserRecord & { slot: number }> => {
  const { slot: kept } = record;
  if (kept !== undefined && !held.has(kept)) {
    return { ...record, slot: kept };
  }
  await mkdir(browsersDir(), { recursive: true, mode: 0o700 });
  return holding(
    join(browsersDir(), "slots.lock"),
    "The browser ports",
    async () => {
      const taken = new Set((await allBrowsers()).map((one) => one.slot));
      for (let slot = 0; slot < BROWSER_SLOTS; slot += 1) {
        if (taken.has(slot) || held.has(slot)) {
          continue;
        }
        const ports = Object.values(browserPorts(slot));
        // biome-ignore lint/performance/noAwaitInLoops: the first free slot, in order.
        const free = await Promise.all(ports.map(portFree));
        if (free.every(Boolean)) {
          const placed = { ...record, slot };
          await writeBrowser(placed);
          return placed;
        }
      }
      throw new Error(
        `Every browser port of this machine (${browserPorts(0).http}–${browserPorts(BROWSER_SLOTS - 1).media}) is taken by a browser that has run: stop and remove one first.`
      );
    }
  );
};

/** The ports `record`'s host uses: DevTools on the local host, all three in a container. Only a browser that has started has any. */
export const portsOf = (record: BrowserRecord): BrowserPorts => {
  if (record.slot === undefined) {
    throw new Error(`${record.key} has not started yet, so it has no ports.`);
  }
  const all = browserPorts(record.slot);
  return record.host === "container" ? all : { devtools: all.devtools };
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
