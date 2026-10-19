/**
 * The shield (Projects spec §5.11, "Private"): from Take over to Hand back
 * nothing the person types or sees reaches any agent. Take over closes the
 * browser's gate (every agent connection cut with 4423, new ones refused
 * with one sentence), brings the asking workspace's page to the front, and
 * gives the person control: neko's `control/give` to their view's session on
 * the container host, a {@link CdpTakeover} of that page on the local host.
 * Hand back takes control away, loads the front page again by GET (nothing
 * typed survives in a field), empties neko's clipboard on the container host
 * (the local host's headless Chromium has no clipboard the person could
 * fill), opens the gate, and answers the page's origin and nothing else.
 *
 * The person hands back with the button, or by closing every view: with no
 * view open for {@link TAKEOVER_UNWATCHED_MS} the daemon hands back itself
 * and tells the hub ({@link BrowserHandedBackFrame}). A take-over is kept in
 * the browser's dir (`shield.json`, beside its record's `takeover`), so a
 * daemon that restarts mid-take-over holds the gate closed from its first
 * moment, and the hub sends the shield again as the machine registers.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import {
  type BrowserHandback,
  type BrowserHandedBackFrame,
  type BrowserKey,
  type BrowserRow,
  type BrowserShieldArgs,
  isBrowserKey,
  SHIELD_WORDS,
  TAKEOVER_UNWATCHED_MS,
} from "@cawco/core/browser";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { browserRows, startBrowser } from "./browsers";
import {
  CdpLink,
  CdpTakeover,
  type CdpViewer,
  cdpInputOf,
} from "./cdp-takeover";
import { nekoLogin } from "./container-host";
import { gateOf } from "./gate";
import {
  allBrowsers,
  type BrowserRecord,
  browserDir,
  portsOf,
  readBrowser,
  withBrowser,
  writeBrowser,
} from "./state";

/** How often a take-over's views are counted against {@link TAKEOVER_UNWATCHED_MS}. */
const WATCH_MS = 5000;

/** How long neko has to answer a control or clipboard call. */
const NEKO_MS = 5000;

/** A take-over as the browser's dir keeps it. */
interface Kept {
  origin?: string;
  requestId?: string;
  since: number;
  /** The page brought to the front: the one handed back reloads. */
  targetId?: string;
  /** The person's neko session given control (container host). */
  viewer?: string;
  workspaceId?: string;
}

/** A take-over this process holds. */
interface Held extends Kept {
  /** The local host's take-over session. */
  cdp?: CdpTakeover;
  /** Views the hub counts (its sockets for neko or the CDP bridge). */
  hubViewers: number;
  /** Since when no view was open; undefined while one is. */
  unwatchedSince?: number;
}

const held = new Map<BrowserKey, Held>();

let sink: (frame: BrowserHandedBackFrame) => void = () => undefined;
let machineId = "";

/** Where the daemon tells the hub of a take-over it ended itself, and the machine it is. */
export const setShieldSink = (
  id: string,
  send: (frame: BrowserHandedBackFrame) => void
): void => {
  machineId = id;
  sink = send;
};

const shieldFile = (key: BrowserKey): string =>
  join(browserDir(key), "shield.json");

const keep = (key: BrowserKey, take: Held): Promise<void> => {
  const { cdp: _cdp, hubViewers: _h, unwatchedSince: _u, ...kept } = take;
  return writeStateFile(shieldFile(key), `${JSON.stringify(kept, null, 2)}\n`, {
    mode: 0o600,
  });
};

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Who owns which page, as the gate keeps it (gate.ts `gate.json`). */
const pageOwners = async (key: BrowserKey): Promise<Record<string, string>> => {
  const kept = await readRecord<{ targets?: Record<string, string> }>(
    join(browserDir(key), "gate.json")
  ).catch(() => undefined);
  return kept?.targets ?? {};
};

const originOf = (url: string | undefined): string | undefined => {
  if (!(url && URL.canParse(url))) {
    return;
  }
  const { origin } = new URL(url);
  return origin === "null" ? undefined : origin;
};

interface Page {
  targetId: string;
  url: string;
}

/** The browser's pages, as Chromium lists them. */
const pagesOf = async (link: CdpLink): Promise<Page[]> => {
  const { targetInfos } = await link.call("Target.getTargets");
  return (Array.isArray(targetInfos) ? targetInfos : [])
    .filter(
      (info): info is { targetId: string; type: string; url?: string } =>
        !!info &&
        typeof info === "object" &&
        typeof (info as { targetId?: unknown }).targetId === "string" &&
        (info as { type?: unknown }).type === "page"
    )
    .map((info) => ({ targetId: info.targetId, url: info.url ?? "" }));
};

/**
 * The page a take-over brings to the front: the asking workspace's page on
 * the asked origin, else its newest page, else the browser's first page.
 */
const frontPage = async (
  key: BrowserKey,
  link: CdpLink,
  workspaceId: string | undefined,
  origin: string | undefined
): Promise<Page | undefined> => {
  const pages = await pagesOf(link);
  if (workspaceId) {
    const owners = await pageOwners(key);
    const own = pages.filter((page) => owners[page.targetId] === workspaceId);
    const asked = origin
      ? own.find((page) => originOf(page.url) === origin)
      : undefined;
    const chosen = asked ?? own.at(-1);
    if (chosen) {
      return chosen;
    }
  }
  return pages[0];
};

/** Calls neko's REST as the daemon's admin. */
const neko = async (
  record: BrowserRecord,
  path: string,
  body?: unknown
): Promise<void> => {
  const token = await nekoLogin(record, "admin");
  const read = await readWithin(NEKO_MS, (signal) =>
    fetch(`http://127.0.0.1:${portsOf(record).http}/api${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    })
  );
  if (read.kind === "unanswered") {
    throw new Error(`neko did not answer ${path} within ${NEKO_MS / 1000} s.`);
  }
  const response = read.value;
  if (!response.ok) {
    throw new Error(
      `neko refused ${path} (HTTP ${response.status}): ${(await response.text()).trim()}`
    );
  }
  await response.body?.cancel();
};

const rowOf = async (key: BrowserKey): Promise<BrowserRow> => {
  const row = (await browserRows()).find((one) => one.key === key);
  if (!row) {
    throw new Error(`${key} has no record on this machine.`);
  }
  return row;
};

/** Writes the record's `takeover` as the shield holds it now. */
const recordTakeover = (key: BrowserKey, take: Held | undefined) =>
  withBrowser(key, async () => {
    const record = await readBrowser(key);
    if (record) {
      await writeBrowser({
        ...record,
        lastUsedAt: Date.now(),
        takeover: take
          ? {
              by: take.workspaceId ?? null,
              since: take.since,
              ...(take.requestId ? { requestId: take.requestId } : {}),
            }
          : null,
      });
    }
  });

/**
 * Take over: the gate closed, the asking workspace's page in front, control
 * the person's. Sent again for a browser already held (a viewer's neko
 * session now known, or the hub re-sending after this daemon restarted), it
 * keeps the take-over and gives control to the viewer.
 */
export const shieldBrowser = async (
  args: BrowserShieldArgs
): Promise<BrowserRow> => {
  const { key } = args;
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  // Closed before anything else: no agent reads the page from here on.
  gateOf(key)?.closeAll(SHIELD_WORDS);
  await startBrowser({ key });
  const gate = gateOf(key);
  if (!gate) {
    throw new Error(
      `${key}'s gate is not served on this machine, so it could not be closed; nothing was given to the person.`
    );
  }
  gate.closeAll(SHIELD_WORDS);
  const record = await readBrowser(key);
  if (!record) {
    throw new Error(`${key} has no record on this machine.`);
  }
  const before = held.get(key);
  const take: Held = before ?? {
    since: Date.now(),
    hubViewers: 0,
    unwatchedSince: Date.now(),
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    ...(args.origin ? { origin: args.origin } : {}),
    ...(args.requestId ? { requestId: args.requestId } : {}),
  };
  held.set(key, take);
  // Kept before the slow steps: a daemon that restarts in them still holds
  // the gate closed, and the count of views never reads a half-made one.
  await keep(key, take);
  await recordTakeover(key, take);
  if (!take.targetId) {
    const devtools = `http://127.0.0.1:${portsOf(record).devtools}`;
    const link = await CdpLink.open(devtools);
    try {
      const page = await frontPage(key, link, take.workspaceId, take.origin);
      if (page) {
        await link.call("Target.activateTarget", { targetId: page.targetId });
        take.targetId = page.targetId;
      }
    } finally {
      link.close();
    }
  }
  if (record.host === "local" && !take.cdp && take.targetId) {
    take.cdp = await CdpTakeover.start(
      `http://127.0.0.1:${portsOf(record).devtools}`,
      take.targetId
    );
  }
  if (record.host === "container" && args.viewer) {
    await neko(record, `/room/control/give/${encodeURIComponent(args.viewer)}`);
    take.viewer = args.viewer;
  }
  await keep(key, take);
  await recordTakeover(key, take);
  watch();
  console.info(
    `[browser] ${key} taken over${take.workspaceId ? ` for workspace ${take.workspaceId}` : ""}${args.viewer ? `, control given to neko session ${args.viewer}` : ""}`
  );
  return rowOf(key);
};

/** The front page loaded again by GET; its origin. */
const reloadFront = async (
  record: BrowserRecord,
  targetId: string | undefined
): Promise<string | null> => {
  const link = await CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const pages = await pagesOf(link);
    const page = pages.find((one) => one.targetId === targetId) ?? pages[0];
    if (!page) {
      return null;
    }
    const session = await link.attach(page.targetId);
    const history = await link.call("Page.getNavigationHistory", {}, session);
    const entries = Array.isArray(history.entries)
      ? (history.entries as { url?: string }[])
      : [];
    const index =
      typeof history.currentIndex === "number" ? history.currentIndex : -1;
    const url = entries[index]?.url ?? page.url;
    // A navigation, not a reload: a page a form posted to is asked for again
    // by GET, so nothing the person typed is sent or survives in a field.
    if (url && url !== "about:blank") {
      await link.call("Page.navigate", { url }, session);
    }
    return originOf(url) ?? null;
  } finally {
    link.close();
  }
};

/**
 * Hand back: control taken from the person, the front page loaded again by
 * GET, the clipboard emptied, the gate open; answers the page's origin.
 */
export const handBackBrowser = async (
  key: BrowserKey
): Promise<BrowserHandback> => {
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  const take = held.get(key) ?? (await keptOf(key));
  const record = await readBrowser(key);
  let origin: string | null = null;
  if (record && take) {
    if (record.host === "container") {
      await neko(record, "/room/control/reset");
    } else {
      await take.cdp?.stop();
    }
    origin = await reloadFront(record, take.targetId);
    if (record.host === "container") {
      await neko(record, "/room/clipboard", { text: "" });
    }
  }
  await release(key);
  console.info(`[browser] ${key} handed back${origin ? ` on ${origin}` : ""}`);
  return {
    key,
    origin,
    ...(take?.requestId ? { requestId: take.requestId } : {}),
  };
};

/** The take-over over: forgotten here and in the browser's dir, the gate open. */
const release = async (key: BrowserKey): Promise<void> => {
  held.delete(key);
  await rm(shieldFile(key), { force: true });
  await recordTakeover(key, undefined).catch((error: unknown) =>
    console.warn(`[browser] ${key}'s take-over was not cleared: ${why(error)}`)
  );
  gateOf(key)?.open();
};

const keptOf = async (key: BrowserKey): Promise<Held | undefined> => {
  const kept = await readRecord<Kept>(shieldFile(key)).catch(() => undefined);
  return kept ? { ...kept, hubViewers: 0 } : undefined;
};

/** How many views of `key`'s take-over the hub counts now. */
export const browserViewers = (key: BrowserKey, count: number): void => {
  const take = held.get(key);
  if (take) {
    take.hubViewers = Math.max(0, count);
  }
};

/**
 * A view of the local host's take-over (the machine's preview listener's
 * `/__cawco/browser/<key>/cdp`): frames to it, its input onto the page.
 * Undefined when `key` is not taken over on the local host.
 */
export const cdpView = async (
  key: BrowserKey,
  viewer: CdpViewer
): Promise<
  { input: (text: string) => void; leave: () => void } | undefined
> => {
  const cdp = held.get(key)?.cdp;
  if (!cdp) {
    return;
  }
  const leave = await cdp.attach(viewer);
  return {
    input: (text) => {
      const input = cdpInputOf(text);
      if (input) {
        cdp
          .input(input)
          .catch((error: unknown) =>
            console.warn(
              `[browser] ${key}: an input did not land: ${why(error)}`
            )
          );
      }
    },
    leave,
  };
};

let watching: ReturnType<typeof setInterval> | undefined;

/** Counts every take-over's views; one unwatched for two minutes, or whose browser stopped, is handed back. */
const watch = (): void => {
  watching ??= setInterval(() => {
    watchOnce().catch((error: unknown) =>
      console.warn(`[browser] take-overs not counted: ${why(error)}`)
    );
  }, WATCH_MS);
  watching.unref?.();
};

const watchOnce = async (): Promise<void> => {
  if (held.size === 0 && watching) {
    clearInterval(watching);
    watching = undefined;
    return;
  }
  const now = Date.now();
  for (const [key, take] of held) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time.
    const record = await readBrowser(key);
    // The browser stopped (Stop, its machine, its container) and its
    // take-over with it: answered as a hand-back with no page.
    if (!record?.takeover || record.state !== "live") {
      await take.cdp?.stop();
      await release(key);
      tellHub({ key, origin: null, requestId: take.requestId }, "stopped");
      continue;
    }
    const views = Math.max(take.hubViewers, take.cdp?.viewers ?? 0);
    if (views > 0) {
      take.unwatchedSince = undefined;
      continue;
    }
    take.unwatchedSince ??= now;
    if (now - take.unwatchedSince >= TAKEOVER_UNWATCHED_MS) {
      console.info(
        `[browser] ${key}: no view of its take-over for ${TAKEOVER_UNWATCHED_MS / 60_000} minutes: handed back`
      );
      const answer = await handBackBrowser(key).catch(
        async (error: unknown) => {
          console.warn(
            `[browser] ${key} was not handed back cleanly: ${why(error)}`
          );
          await release(key);
          return { key, origin: null, requestId: take.requestId };
        }
      );
      tellHub(answer, "unwatched");
    }
  }
};

const tellHub = (
  answer: BrowserHandback,
  said: BrowserHandedBackFrame["why"]
): void => {
  sink({
    kind: "browser_handback",
    machineId,
    key: answer.key,
    origin: answer.origin,
    ...(answer.requestId ? { requestId: answer.requestId } : {}),
    why: said,
  });
};

/**
 * The daemon starting: every browser its records say is taken over is held
 * again (its `shield.json`, else what its record's `takeover` says), until
 * the hub sends the shield again or the person hands back. Its gate starts
 * closed: the registry closes a gate it makes for a record that holds a
 * take-over (browsers.ts `gateFor`). A browser that stopped meanwhile has
 * its take-over forgotten.
 */
export const restoreShields = async (): Promise<void> => {
  const keys: BrowserKey[] = [];
  for (const record of await allBrowsers()) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser's dir at a time.
    const kept = await keptOf(record.key);
    if (!record.takeover) {
      if (kept) {
        await rm(shieldFile(record.key), { force: true });
      }
      continue;
    }
    const { by, since, requestId } = record.takeover;
    held.set(record.key, {
      since,
      ...(by ? { workspaceId: by } : {}),
      ...(requestId ? { requestId } : {}),
      ...kept,
      hubViewers: 0,
      unwatchedSince: Date.now(),
    });
    keys.push(record.key);
  }
  if (keys.length === 0) {
    return;
  }
  console.info(
    `[browser] held privately across the restart: ${keys.join(", ")}`
  );
  // The local host's view of each, at its front page again.
  await Promise.all(
    keys.map(async (key) => {
      const take = held.get(key);
      const record = await readBrowser(key);
      if (take && record?.host === "local" && take.targetId) {
        take.cdp = await CdpTakeover.start(
          `http://127.0.0.1:${portsOf(record).devtools}`,
          take.targetId
        ).catch((error: unknown): undefined => {
          console.warn(
            `[browser] ${key}'s take-over view did not resume: ${why(error)}`
          );
        });
      }
    })
  );
  watch();
};

/** Whether `key` is taken over on this machine now. */
export const shielded = (key: BrowserKey): boolean => held.has(key);
