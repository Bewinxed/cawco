/**
 * The machine's browsers over both hosts (Projects spec §5.11): a container
 * where the machine's runtime answers, a local Chromium where it has none. A
 * browser is made on the host that answers as it is first made, and stays
 * there for good: its sign-ins are that host's (a container's volume, a
 * local profile dir), so it is never moved, and nothing of it is removed
 * because a runtime was absent for a while (a Mac's agent starting before
 * Colima does). A container browser whose runtime does not answer is not
 * live, and says which runtime is away; it starts again by itself once that
 * runtime answers. The runtime is looked for as the agent starts, every
 * minute while a browser waits on it, and every 10 minutes while none
 * answers, so a new install is found without a restart. A browser takes its
 * ports as it first starts, not as it is reserved, and stops after 30
 * minutes with no agent connection and no viewer, its profile kept, waking
 * on the next need. The daemon tells the hub the whole list on each change
 * ({@link BrowserFrame}), and answers it whole when the hub asks as the
 * machine registers; `cawco browser` acts on the same records from a
 * terminal.
 *
 * The daemon serves the machine's DevTools gate (gate.ts) on its one port
 * (`BROWSER_GATE_PORT`), with a gate behind it for every browser it keeps a
 * record of, asleep ones and ones only reserved for a session's browser tool
 * too: a session's browser tool connecting wakes its browser (with the stream relay
 * the hub last gave it), and holds it awake while connected. It watches the
 * records' dir, so a browser `cawco browser` starts has its gate as its
 * record is written, and one it removes has none.
 */
import { watch } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  BrowserFrame,
  BrowserKey,
  BrowserRelay,
  BrowserRow,
  BrowserRuntime,
  BrowserStartArgs,
  BrowserViewerSession,
} from "@cawco/core/browser";
import { isBrowserKey, SHIELD_WORDS } from "@cawco/core/browser";
import { openLockFile, tryLock, unlock } from "@cawco/core/flock";
import { ContainerHost, nekoSession, RELAY_RENEW_MS } from "./container-host";
import { gateOf, listenGates, servedGates, serveGate, stopGate } from "./gate";
import { LocalHost } from "./local-host";
import { findRuntime, type Runtime } from "./runtime";
import {
  allBrowsers,
  type BrowserHost,
  type BrowserRecord,
  browserDir,
  browsersDir,
  forgetBrowser,
  type Progress,
  portsOf,
  readBrowser,
  recordFor,
  slotted,
  withBrowser,
  writeBrowser,
} from "./state";

/** How long a browser with no agent connection and no viewer stays up. */
export const BROWSER_IDLE_MS = 30 * 60_000;

/** How often the runtime is looked for again while none answers and no browser waits on it. */
const RUNTIME_RECHECK_MS = 10 * 60_000;

/** How often idle browsers are looked for. */
const TICK_MS = 60_000;

let runtime: Runtime | { missing: string } | undefined;
let runtimeAt = 0;

/** The runtime as last found, looked for again when `fresh` or never yet. */
export const browserRuntime = async (
  fresh = false
): Promise<Runtime | { missing: string }> => {
  if (!runtime || fresh) {
    runtime = await findRuntime();
    runtimeAt = Date.now();
  }
  return runtime;
};

const local = new LocalHost();

/** The host a browser being made for the first time is made on: the container host wherever a runtime answers. */
export const hostFor = async (): Promise<BrowserHost> => {
  const found = await browserRuntime();
  return "missing" in found ? local : new ContainerHost(found);
};

/** The host that runs `record` as it stands (the runtime may have gone since). */
const hostOf = async (
  record: BrowserRecord
): Promise<BrowserHost | undefined> => {
  if (record.host === "local") {
    return local;
  }
  const found = await browserRuntime();
  return "missing" in found ? undefined : new ContainerHost(found);
};

/** What a start says while it runs, by key: the frame shows it until the record does. */
const starting = new Map<BrowserKey, Progress>();

let sink: (frame: BrowserFrame) => void = () => undefined;
let machineId = "";
let lastSent = "";

/** Where the daemon sends its frames, and the machine they are of. */
export const setBrowserSink = (
  id: string,
  send: (frame: BrowserFrame) => void
): void => {
  machineId = id;
  sink = send;
};

const runtimeRow = (found: Runtime | { missing: string }): BrowserRuntime =>
  "missing" in found
    ? { missing: found.missing }
    : { kind: found.kind, endpoint: found.endpoint, version: found.version };

const rowOf = (record: BrowserRecord): BrowserRow => {
  const now = starting.get(record.key);
  return {
    key: record.key,
    name: record.name,
    host: record.host,
    state: now?.state ?? record.state,
    ...(now?.progress ? { progress: now.progress } : {}),
    ...(record.slot === undefined ? {} : { ports: portsOf(record) }),
    lastUsedAt: record.lastUsedAt,
    viewers: 0,
    takeover: record.takeover,
    ...(record.why ? { why: record.why } : {}),
  };
};

/** Every browser of the machine as its records say. */
export const browserRows = async (): Promise<BrowserRow[]> =>
  (await allBrowsers())
    .sort(
      (a, b) =>
        (a.slot ?? Number.POSITIVE_INFINITY) -
        (b.slot ?? Number.POSITIVE_INFINITY)
    )
    .map(rowOf);

/** The runtime and every browser of the machine, whole, as its records hold them now. */
export const browserFrame = async (): Promise<BrowserFrame> => ({
  kind: "browsers",
  machineId,
  runtime: runtimeRow(await browserRuntime()),
  browsers: await browserRows(),
});

/** Tells the hub the runtime and every browser, when anything of it changed. */
const tell = async (): Promise<void> => {
  const frame = await browserFrame();
  const text = JSON.stringify(frame);
  if (text !== lastSent) {
    lastSent = text;
    sink(frame);
  }
};

const told = (): void => {
  tell().catch((error: unknown) =>
    console.warn(`[browser] the frame was not sent: ${String(error)}`)
  );
};

/** A record changed outside the registry (the shield's take-over): the hub is told. */
export const browsersChanged = (): void => told();

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Whether this process serves the gates: the daemon's, never a terminal's. */
let servingGates = false;

/** Writes `key`'s last use as now: a gate connection opened or closed. */
const used = (key: BrowserKey): void => {
  withBrowser(key, async () => {
    const record = await readBrowser(key);
    if (record) {
      await writeBrowser({ ...record, lastUsedAt: Date.now() });
    }
  })
    .then(told)
    .catch((error: unknown) =>
      console.warn(`[browser] ${key}'s last use was not kept: ${why(error)}`)
    );
};

/** Whether `relay`'s credential holds past the renewal window (its username is `<expiry, s>:<who>`). */
const relayHolds = (relay: BrowserRelay): boolean => {
  const seconds = Number(relay.username.split(":")[0]);
  return (
    Number.isFinite(seconds) && seconds * 1000 > Date.now() + RELAY_RENEW_MS
  );
};

/**
 * `key`'s DevTools address as its host gives it: with `wake`, the browser
 * started or woken first, with the stream relay the hub last gave it while
 * that credential holds (a container made again keeps its relay); without,
 * only while it runs.
 */
const devtoolsOf = async (
  key: BrowserKey,
  wake: boolean
): Promise<string | undefined> => {
  const record = wake ? await wakeBrowser(key) : await readBrowser(key);
  if (record?.state !== "live") {
    return;
  }
  const host = await hostOf(record);
  return host && (await host.running(record))
    ? host.devtoolsUrl(record)
    : undefined;
};

/**
 * `key` started or woken, with the stream relay the hub last gave it while
 * that credential holds (a container made again keeps its relay): its record
 * as it stands then.
 */
export const wakeBrowser = async (
  key: BrowserKey
): Promise<BrowserRecord | undefined> => {
  const kept = (await readBrowser(key))?.relay;
  await startBrowser({
    key,
    ...(kept && relayHolds(kept) ? { relay: kept } : {}),
  });
  return readBrowser(key);
};

/**
 * A neko session of its own for one viewer of `key` (core
 * `BROWSER_VIEWER_TOKEN`), the browser woken first when it sleeps.
 */
export const viewerSession = async (
  key: BrowserKey
): Promise<BrowserViewerSession> => {
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  const before = await readBrowser(key);
  const record = before?.state === "live" ? before : await wakeBrowser(key);
  if (!record) {
    throw new Error(`${key} has no record on this machine.`);
  }
  if (record.host !== "container") {
    throw new Error(
      `${key} runs as a local Chromium on this machine: it has no neko session to give a viewer.`
    );
  }
  const { id, token } = await nekoSession(record, "viewer");
  return { session: id, token };
};

/** Serves `record`'s gate behind the machine's one gate port, when this process serves gates. */
const gateFor = (record: BrowserRecord): void => {
  if (!servingGates) {
    return;
  }
  const { key } = record;
  const made = !gateOf(key);
  const gate = serveGate({
    key,
    devtools: (wake) => devtoolsOf(key, wake),
    used: () => used(key),
  });
  // A gate made while the person holds the browser (the daemon restarted
  // mid-take-over, its record read back) starts closed, as the shield
  // closed it: no agent connects until the hand-back opens it.
  if (made && record.takeover) {
    gate.closeAll(SHIELD_WORDS);
  }
};

/** Every record's gate served, and the gate of a browser no record keeps any more stopped. */
const gatesNow = async (): Promise<void> => {
  const records = await allBrowsers();
  for (const record of records) {
    gateFor(record);
  }
  const kept = new Set(records.map((record) => record.key));
  for (const key of servedGates()) {
    if (!kept.has(key)) {
      stopGate(key);
    }
  }
};

let gating: Promise<void> | undefined;
let gateAgain = false;

/** {@link gatesNow} as a record is written: one at a time, once more if one was written meanwhile. */
const gatesAsWritten = (): void => {
  if (gating) {
    gateAgain = true;
    return;
  }
  gating = gatesNow()
    .catch((error: unknown) =>
      console.warn(`[browser] the gates were not served: ${why(error)}`)
    )
    .finally(() => {
      gating = undefined;
      if (gateAgain) {
        gateAgain = false;
        gatesAsWritten();
      }
    });
};

/** Stops `record` on the host it ran on, when that host is still here. */
const stopOn = async (record: BrowserRecord): Promise<void> => {
  await (await hostOf(record))?.stop(record);
};

/**
 * Why a container browser cannot start now: its runtime does not answer, in
 * the person's words (WORDS, the error formula): what happened, why, the fix,
 * and what is safe and comes next.
 */
const runtimeAwayWhy = (record: BrowserRecord): string => {
  const madeOn = record.container?.runtime;
  const named = madeOn
    ? `${madeOn.kind === "podman" ? "Podman" : "Docker"} at ${madeOn.endpoint}`
    : "its container runtime";
  return `This browser runs in a container, and ${named} isn't answering, so it can't start. Start the container runtime; the browser starts again by itself, with its sign-ins kept.`;
};

/**
 * `record` whose runtime does not answer, written so (once, while that
 * stays so): not live, its `why` naming the runtime, everything else of it
 * kept (a take-over the person holds included), started again once the
 * runtime answers. Answers that `why`.
 */
const markAway = async (record: BrowserRecord): Promise<string> => {
  const away = runtimeAwayWhy(record);
  if (!(record.runtimeAway && record.why === away)) {
    await writeBrowser({
      ...record,
      state: "failed",
      runtimeAway: true,
      why: away,
    });
    console.info(
      `[browser] ${record.key}: its container runtime does not answer; kept as it is until it does`
    );
    told();
  }
  return away;
};

/**
 * Starts the browser of `key`, or wakes it, on the host this machine has
 * now, and answers its row once it is live.
 */
export const startBrowser = (args: BrowserStartArgs): Promise<BrowserRow> => {
  const { key, relay } = args;
  if (!isBrowserKey(key)) {
    return Promise.reject(new Error(`${String(key)} is no browser key.`));
  }
  return withBrowser(key, async () => {
    // Made on the host that answers now; kept on the host it was made on.
    let record =
      (await readBrowser(key)) ??
      (await recordFor(key, key, (await hostFor()).kind));
    const host = await hostOf(record);
    if (!host) {
      throw new Error(await markAway(record));
    }
    if (relay) {
      record = { ...record, relay };
    }
    record = await slotted(record);
    if (
      record.state === "live" &&
      (await host.running(record)) &&
      !relayDue(record, relay)
    ) {
      record = { ...record, lastUsedAt: Date.now() };
      await writeBrowser(record);
      told();
      return rowOf(record);
    }
    starting.set(key, { state: "starting" });
    told();
    try {
      record = await host.start(record, {
        ...(relay ? { relay } : {}),
        progress: (progress) => {
          starting.set(key, progress);
          told();
        },
      });
      const { why: _why, runtimeAway: _away, ...live } = record;
      record = { ...live, state: "live", lastUsedAt: Date.now() };
      await writeBrowser(record);
      console.info(`[browser] ${key} live on the ${host.kind} host`);
      gateFor(record);
      starting.delete(key);
      return rowOf(record);
    } catch (error) {
      record = { ...record, state: "failed", why: why(error) };
      await writeBrowser(record);
      console.warn(`[browser] ${key} failed to start: ${record.why}`);
      throw error;
    } finally {
      starting.delete(key);
      told();
    }
  });
};

/** How long a reservation waits for another process making the same key's record. */
const RESERVE_MS = 10_000;
const RESERVE_POLL_MS = 100;

/**
 * `key`'s record, made when it has none, without starting its browser. A
 * start holds the key's lock for minutes while an image builds, but writes
 * the record first: the record is read again rather than the lock waited
 * on, so a reservation never waits on a build.
 */
const reserved = async (key: BrowserKey): Promise<BrowserRecord> => {
  const kept = await readBrowser(key);
  if (kept) {
    return kept;
  }
  await mkdir(browserDir(key), { recursive: true, mode: 0o700 });
  const fd = openLockFile(join(browserDir(key), "lock"), true);
  const until = Date.now() + RESERVE_MS;
  try {
    while (!tryLock(fd)) {
      // biome-ignore lint/performance/noAwaitInLoops: waiting for the holder to write the record.
      await Bun.sleep(RESERVE_POLL_MS);
      const made = await readBrowser(key);
      if (made) {
        return made;
      }
      if (Date.now() > until) {
        throw new Error(
          `The browser ${key} is held by another process of this machine, which made no record of it in ${RESERVE_MS / 1000} s.`
        );
      }
    }
    return (
      (await readBrowser(key)) ??
      (await recordFor(key, key, (await hostFor()).kind))
    );
  } finally {
    unlock(fd);
  }
};

/**
 * `key`'s record kept, and its gate served behind the machine's gate port,
 * starting no browser and taking no ports: what a session's browser tool is
 * launched toward (door.ts). The gate wakes the browser as the tool first
 * connects, and the browser takes its ports then.
 */
export const reserveBrowser = async (key: BrowserKey): Promise<void> => {
  gateFor(await reserved(key));
};

/** Whether a live container's relay credential is near its end and a fresh one came. */
const relayDue = (
  record: BrowserRecord,
  relay: BrowserRelay | undefined
): boolean =>
  !!relay &&
  record.host === "container" &&
  (record.relayUrls?.join(" ") !== relay.urls.join(" ") ||
    (record.relayExpiresAt ?? 0) < Date.now() + RELAY_RENEW_MS);

/** Stops the browser of `key`, keeping its profile. */
export const stopBrowser = async (
  key: BrowserKey
): Promise<BrowserRow | null> => {
  // A key this machine never kept gets no dir of its own for asking.
  if (!(await readBrowser(key))) {
    return null;
  }
  return withBrowser(key, async () => {
    const record = await readBrowser(key);
    if (!record) {
      return null;
    }
    starting.set(key, { state: "stopping" });
    told();
    try {
      await stopOn(record);
      const asleep: BrowserRecord = {
        ...record,
        state: "asleep",
        takeover: null,
      };
      await writeBrowser(asleep);
      console.info(`[browser] ${key} asleep`);
      starting.delete(key);
      return rowOf(asleep);
    } finally {
      starting.delete(key);
      told();
    }
  });
};

/** Stops the browser of `key` and deletes its profile and record. */
export const removeBrowser = async (key: BrowserKey): Promise<void> => {
  if (!(await readBrowser(key))) {
    return;
  }
  await withBrowser(key, async () => {
    const record = await readBrowser(key);
    if (record) {
      const host = await hostOf(record);
      if (!host) {
        throw new Error(
          `${key}'s profile is a volume of the container runtime, which does not answer now: start it, then remove the browser again.`
        );
      }
      await host.remove(record);
    }
  });
  stopGate(key);
  await forgetBrowser(key);
  console.info(`[browser] ${key} removed`);
  told();
};

/**
 * Reads every record against its host: a browser that is not running is
 * asleep, whatever its record last said (an agent restart ends a local
 * Chromium; a machine restart, a container).
 */
const readBack = async (): Promise<void> => {
  for (const record of await allBrowsers()) {
    if (starting.has(record.key)) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one record at a time, each under its own lock.
    await withBrowser(record.key, async () => {
      const now = await readBrowser(record.key);
      if (
        !now ||
        now.state === "asleep" ||
        (now.state === "failed" && !now.runtimeAway)
      ) {
        return;
      }
      const host = await hostOf(now);
      // Its runtime does not answer: not known to run or to have stopped.
      if (!host) {
        await markAway(now);
        return;
      }
      if (!(await host.running(now))) {
        await writeBrowser({ ...now, state: "asleep", takeover: null });
      }
    }).catch((error: unknown) =>
      console.warn(`[browser] ${record.key} was not read back: ${why(error)}`)
    );
  }
};

/**
 * Stops the browsers nobody has used for {@link BROWSER_IDLE_MS}, and those
 * whose relay credential runs out; never one an agent is connected to.
 */
const idleDown = async (): Promise<void> => {
  const now = Date.now();
  for (const record of await allBrowsers()) {
    if (
      record.state !== "live" ||
      record.takeover ||
      gateOf(record.key)?.held
    ) {
      continue;
    }
    const idle = now - record.lastUsedAt > BROWSER_IDLE_MS;
    const lapsing =
      record.relayExpiresAt !== undefined &&
      record.relayExpiresAt < now + RELAY_RENEW_MS;
    if (idle || lapsing) {
      console.info(
        `[browser] ${record.key} ${idle ? "idle for 30 minutes" : "relay credential near its end"}: stopping`
      );
      // biome-ignore lint/performance/noAwaitInLoops: one browser at a time.
      await stopBrowser(record.key).catch((error: unknown) =>
        console.warn(`[browser] ${record.key} did not stop: ${why(error)}`)
      );
    }
  }
};

/**
 * The browsers that waited on their runtime, started again now that it
 * answers: each as it was, its container and volume kept.
 */
const backFromAway = async (records: BrowserRecord[]): Promise<void> => {
  for (const record of records) {
    if (!record.runtimeAway) {
      continue;
    }
    console.info(
      `[browser] ${record.key}: its container runtime answers again; starting it`
    );
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time, each under its own lock.
    await wakeBrowser(record.key).catch((error: unknown) =>
      console.warn(`[browser] ${record.key} did not start again: ${why(error)}`)
    );
  }
};

/** One tick: the runtime again when due, every browser's gate, the records against their hosts, those that waited on the runtime started again, the idle ones down, and the frame. */
const tick = async (): Promise<void> => {
  const records = await allBrowsers();
  const waiting = records.some((record) => record.runtimeAway);
  const missing = "missing" in (await browserRuntime());
  if (waiting || (missing && Date.now() - runtimeAt > RUNTIME_RECHECK_MS)) {
    await browserRuntime(true);
  }
  await gatesNow();
  await readBack();
  if (!("missing" in (await browserRuntime()))) {
    await backFromAway(await allBrowsers());
  }
  await idleDown();
  await tell();
};

/**
 * The daemon's part: the runtime and the records read as it starts, every
 * gate served and served again as any record is written (a terminal's
 * `cawco browser start` among them), then a tick every minute.
 */
export const watchBrowsers = async (): Promise<void> => {
  servingGates = true;
  await mkdir(browsersDir(), { recursive: true, mode: 0o700 });
  // Every kept browser's gate made before the port answers, so a connection
  // as the agent starts meets its gate as its record says: closed under a
  // take-over the daemon restarted in (`gateFor`), never the no-browser 404.
  await gatesNow();
  listenGates();
  watch(browsersDir(), { recursive: true }, (_event, name) => {
    if (name?.endsWith("record.json")) {
      gatesAsWritten();
    }
  }).unref();
  const found = await browserRuntime(true);
  console.info(
    "missing" in found
      ? "[browser] no container runtime: browsers run as local Chromium"
      : `[browser] runtime ${found.kind} ${found.version} (API ${found.api}${found.rootless ? ", rootless" : ""}) at ${found.endpoint}`
  );
  await tick();
  // A tick waits on a browser's lock while a start holds it (an image build
  // takes minutes): the next one is skipped rather than stacked behind it.
  let ticking = false;
  setInterval(() => {
    if (ticking) {
      return;
    }
    ticking = true;
    tick()
      .catch((error: unknown) =>
        console.warn(`[browser] tick failed: ${why(error)}`)
      )
      .finally(() => {
        ticking = false;
      });
  }, TICK_MS).unref();
};
