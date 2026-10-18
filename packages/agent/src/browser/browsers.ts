/**
 * The machine's browsers over both hosts (Projects spec §5.11): a container
 * where the machine's runtime answers, a local Chromium where none does. The
 * runtime is looked for as the agent starts and every 10 minutes while any
 * browser is local, so an install is found without a restart; a local
 * browser moves into a container at its next start (its sign-ins start over
 * there). A browser stops after 30 minutes with no agent connection and no
 * viewer, its profile kept, and wakes on the next need. The daemon tells the
 * hub the whole list on each change ({@link BrowserFrame}); `cawco browser`
 * acts on the same records from a terminal.
 *
 * The daemon serves each browser's DevTools gate (gate.ts) on the browser's
 * gate port, for every browser it keeps a record of, asleep ones too: a
 * session's browser tool connecting wakes its browser, and holds it awake
 * while connected. A browser `cawco browser` started gets its gate at the
 * daemon's next tick.
 */
import type {
  BrowserFrame,
  BrowserKey,
  BrowserRelay,
  BrowserRow,
  BrowserRuntime,
  BrowserStartArgs,
} from "@cawco/core/browser";
import { isBrowserKey } from "@cawco/core/browser";
import { ContainerHost, RELAY_RENEW_MS } from "./container-host";
import { gateOf, serveGate, stopGate } from "./gate";
import { LocalHost } from "./local-host";
import { findRuntime, type Runtime } from "./runtime";
import {
  allBrowsers,
  type BrowserHost,
  type BrowserRecord,
  forgetBrowser,
  type Progress,
  portsOf,
  readBrowser,
  recordFor,
  withBrowser,
  writeBrowser,
} from "./state";

/** How long a browser with no agent connection and no viewer stays up. */
export const BROWSER_IDLE_MS = 30 * 60_000;

/** How often the runtime is looked for again while a browser is local. */
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

/** The host a browser starts on now: the container host wherever a runtime answered. */
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
    ports: portsOf(record),
    lastUsedAt: record.lastUsedAt,
    viewers: 0,
    takeover: record.takeover,
    ...(record.why ? { why: record.why } : {}),
  };
};

/** Every browser of the machine as its records say. */
export const browserRows = async (): Promise<BrowserRow[]> =>
  (await allBrowsers()).sort((a, b) => a.slot - b.slot).map(rowOf);

/** Tells the hub the runtime and every browser, when anything of it changed. */
const tell = async (): Promise<void> => {
  const frame: BrowserFrame = {
    kind: "browsers",
    machineId,
    runtime: runtimeRow(await browserRuntime()),
    browsers: await browserRows(),
  };
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

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Whether this process serves the gates: the daemon's, never a terminal's. */
let servingGates = false;
/** Why a gate did not listen, by key, said once until it does. */
const gateFailed = new Map<BrowserKey, string>();

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

/**
 * `key`'s DevTools address as its host gives it: with `wake`, the browser
 * started or woken first (as the hub's start would, keeping the container's
 * relay); without, only while it runs.
 */
const devtoolsOf = async (
  key: BrowserKey,
  wake: boolean
): Promise<string | undefined> => {
  if (wake) {
    await startBrowser({ key });
  }
  const record = await readBrowser(key);
  if (record?.state !== "live") {
    return;
  }
  const host = await hostOf(record);
  return host && (await host.running(record))
    ? host.devtoolsUrl(record)
    : undefined;
};

/** Serves `record`'s gate on its gate port, when this process serves gates. */
const gateFor = (record: BrowserRecord): void => {
  if (!servingGates) {
    return;
  }
  const { key } = record;
  const port = portsOf(record).gate;
  try {
    serveGate({
      key,
      port,
      machineId: () => machineId,
      devtools: (wake) => devtoolsOf(key, wake),
      used: () => used(key),
    });
    gateFailed.delete(key);
  } catch (error) {
    const said = why(error);
    if (gateFailed.get(key) !== said) {
      gateFailed.set(key, said);
      console.warn(
        `[browser] ${key}'s gate does not listen on 127.0.0.1:${port}: ${said}`
      );
    }
  }
};

/** Stops `record` on the host it ran on, when that host is still here. */
const stopOn = async (record: BrowserRecord): Promise<void> => {
  await (await hostOf(record))?.stop(record);
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
    const host = await hostFor();
    let record = await recordFor(key, key, host.kind);
    if (record.host !== host.kind) {
      console.info(
        `[browser] ${key} moves from the ${record.host} host to the ${host.kind} host; its sign-ins start over there`
      );
      await stopOn(record);
      const { container: _container, local: _local, ...rest } = record;
      record = { ...rest, host: host.kind };
    }
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
      const { why: _why, ...live } = record;
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
      if (!host && record.host === "container") {
        throw new Error(
          `${key}'s profile is a volume of the container runtime, which does not answer now: start it, then remove the browser again.`
        );
      }
      await host?.remove(record);
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
      if (!now || now.state === "asleep" || now.state === "failed") {
        return;
      }
      const host = await hostOf(now);
      const running = host ? await host.running(now) : false;
      if (!running) {
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

/** One tick: the runtime again when due, every browser's gate, the records against their hosts, the idle ones down, and the frame. */
const tick = async (): Promise<void> => {
  const records = await allBrowsers();
  if (
    records.some((record) => record.host === "local") &&
    Date.now() - runtimeAt > RUNTIME_RECHECK_MS
  ) {
    await browserRuntime(true);
  }
  for (const record of records) {
    gateFor(record);
  }
  await readBack();
  await idleDown();
  await tell();
};

/** The daemon's part: the runtime and the records read as it starts, every gate served, then a tick every minute. */
export const watchBrowsers = async (): Promise<void> => {
  servingGates = true;
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
