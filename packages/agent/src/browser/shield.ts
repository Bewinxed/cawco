/**
 * The shield (Projects spec §5.11, "Private"): from Take over to Hand back
 * nothing the person types or sees reaches any agent. Take over closes the
 * browser's gate (every agent connection cut with 4423, new ones refused
 * with one sentence), brings the asking workspace's page to the front, and
 * gives the person control: a {@link CdpTakeover} of that page on either
 * host, in the layout of the device they hold. neko is the container
 * host's picture only while nobody holds the browser; no viewer ever hosts
 * it (its controls are locked, and only its admin gives them). Hand back
 * ends the take-over's view, whose DevTools link takes the person's layout
 * with it once any sharp picture it asked for has answered, and every page
 * is set to its window's own size (own-size.ts: a link cut mid-picture
 * leaves its page at the picture's size), so the agent's page is the
 * desktop's again before the gate opens,
 * loads the front page again by GET (nothing typed survives in a field),
 * empties neko's clipboard on the container host (the local host's
 * headless Chromium has no clipboard the person could fill), opens the
 * gate, and answers the page's origin and nothing else.
 *
 * The machine is the one truth of a take-over: its record's `takeover`
 * (with `shield.json` beside it for the page), written here
 * alone, and told to the hub on every change. It ends in one place,
 * {@link release}, whichever way it ends:
 *
 * - the person's Hand back (`browser.handback`), answered to the hub's call;
 * - no view open for {@link TAKEOVER_UNWATCHED_MS}: the daemon hands back
 *   itself, and tells the hub ({@link BrowserHandedBackFrame}) before the
 *   record's frame, so the ask's call answers with the page's origin;
 * - the browser stopped (`cawco browser stop`, a stop route, its process or
 *   container gone): the registry clears the record's `takeover`, the watch
 *   below releases it and tells the hub, with no page.
 *
 * A daemon that restarts mid-take-over holds it again from the record
 * ({@link restoreShields}), its gate closed from the registry's first gate
 * (browsers.ts `gateFor`); the hub reads the machine's rows as it registers
 * and sends nothing again. A container runtime that is away ends nothing: the
 * browser is not known to have stopped, so its take-over stands.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import {
  type BrowserAskedPage,
  type BrowserHandback,
  type BrowserHandedBackFrame,
  type BrowserKey,
  type BrowserPageArgs,
  type BrowserRow,
  type BrowserShieldArgs,
  isBrowserKey,
  TAKEOVER_UNWATCHED_MS,
} from "@cawco/core/browser";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { browserAskWords } from "@cawco/core/words/browser";
import { z } from "zod";
import type { AgentPorts } from "../agent-ports";
import { browserRows, browsersChanged, startBrowser } from "./browsers";
import {
  CdpLink,
  CdpTakeover,
  type CdpViewer,
  cdpInputOf,
} from "./cdp-takeover";
import { endWatch, watchView } from "./cdp-watch";
import { nekoLogin } from "./container-host";
import { frontTarget, setFront } from "./front-origin";
import { gateOf } from "./gate";
import { restoreWindows } from "./own-size";
import { extractFidoUri } from "./passkey-qr";
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

/** How long a take-over's view, still starting as the take-over ends, is waited for before the gate opens. Our call. */
const VIEW_START_MS = 5000;

/** How long the browser's pages have to be set to their windows' size before the gate opens: up to three moves of two settled steps (a second each at most) for each of a couple of windows; a healthy browser takes well under one. Our call. */
const RESTORE_MS = 15_000;

/** A take-over as the browser's dir keeps it. */
const KeptSchema = z.object({
  origin: z.string().optional(),
  requestId: z.string().optional(),
  since: z.number(),
  /** The page brought to the front: the one handed back reloads. */
  targetId: z.string().optional(),
  workspaceId: z.string().optional(),
});
type Kept = z.infer<typeof KeptSchema>;

/** A take-over this process holds. */
interface Held extends Kept {
  /** The take-over's view of its page, started once (restore or shield, whichever comes first). */
  cdp?: Promise<CdpTakeover | undefined>;
  /** Views the hub counts (its sockets for neko or the CDP bridge). */
  hubViewers: number;
  /** Since when no view was open; undefined while one is. */
  unwatchedSince?: number;
}

const held = new Map<BrowserKey, Held>();

/** What the shield tells the hub through: the registry's frames, and a take-over it ended itself, each of this machine. */
export type ShieldPorts = Pick<
  AgentPorts,
  "browsers" | "machineId" | "passkeyQr" | "shield"
>;

/** The last FIDO URI emitted per browser key: emit only once per unique URI. */
const lastQr = new Map<BrowserKey, string>();

/** The browsers whose page could not be read for a passkey QR on the last tick, so a streak is said once. */
const qrUnreadable = new Set<BrowserKey>();

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
  const kept = await readRecord(
    join(browserDir(key), "gate.json"),
    z.object({ targets: z.record(z.string(), z.string()).optional() })
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

/**
 * A page the person had open while they held the browser, as the daemon's
 * log, or a hand-back's refusal (the panel's line, the log's "was not
 * handed back"), may name it: its origin (scheme, host and port) and
 * nothing past it. The log is read for diagnosis and quoted into reports, and a sign-in's
 * redirect or popup carries its code, state or token in its query or
 * fragment; nothing the person sees reaches it. An address with no origin
 * says its scheme alone (an `about:` page its name too, never a query), so
 * a `data:` page's content stays out as well.
 */
const pageForLog = (url: string): string => {
  if (!URL.canParse(url)) {
    return "an address that does not parse";
  }
  const parsed = new URL(url);
  if (parsed.origin !== "null") {
    return parsed.origin;
  }
  return parsed.protocol === "about:"
    ? `about:${parsed.pathname}`
    : parsed.protocol;
};

interface Page {
  targetId: string;
  url: string;
}

/** A target of Chromium's list that is a page. */
const PAGE_TARGET = z.object({
  targetId: z.string(),
  type: z.literal("page"),
  url: z.string().optional(),
});

/** The browser's pages, as Chromium lists them. */
const pagesOf = async (link: CdpLink): Promise<Page[]> => {
  const { targetInfos } = await link.call("Target.getTargets");
  return (Array.isArray(targetInfos) ? targetInfos : []).flatMap((info) => {
    const page = PAGE_TARGET.safeParse(info);
    return page.success
      ? [{ targetId: page.data.targetId, url: page.data.url ?? "" }]
      : [];
  });
};

/** A navigation-history entry, as Chromium lists it. */
const HISTORY_ENTRY = z.object({ url: z.string().optional() });

/**
 * The page a take-over brings to the front. A browser ask's is the page it
 * was pinned to as it parked ({@link askedPage}), and a take-over of it is
 * refused once that page is closed. A take-over from a session's panel
 * (no ask) brings the session's newest page, else keeps the page the view
 * shows now (front-origin.ts). Never the browser's first page as it lists
 * them: that is any tab at all (an extension's, another session's).
 */
const frontPage = async (
  key: BrowserKey,
  link: CdpLink,
  args: Pick<BrowserShieldArgs, "targetId" | "workspaceId">
): Promise<string | undefined> => {
  const open = new Set((await pagesOf(link)).map((page) => page.targetId));
  if (args.targetId) {
    if (!open.has(args.targetId)) {
      throw new Error(browserAskWords.pageClosed);
    }
    return args.targetId;
  }
  if (args.workspaceId) {
    const owners = await pageOwners(key);
    const own = Object.keys(owners).filter(
      (target) => owners[target] === args.workspaceId && open.has(target)
    );
    const newest = own.at(-1);
    if (newest) {
      return newest;
    }
  }
  const shown = frontTarget(key);
  return shown && open.has(shown) ? shown : undefined;
};

/**
 * A browser ask as it parks (core `BROWSER_PAGE`): the page of `key` that
 * door `workspaceId` has open on `origin`, the one it drove last when it
 * has several there (gate.ts `drivenBy`), else the newest it opened. The
 * ask is pinned to it, so a take-over shows the page the agent asked about
 * whatever tab opens after (a site's pop-up, an extension's page, another
 * session's). A browser asleep is woken first, as the door's browser tool
 * wakes it (gate.ts `wake`), and the pages it had as it last ended, or as
 * the browser's last run ended, open again (gate.ts `restore`). Refused in
 * the agent's words when it has none open there, and in a failed start's
 * own words when the browser does not start.
 */
export const askedPage = async ({
  key,
  origin,
  workspaceId,
}: BrowserPageArgs): Promise<BrowserAskedPage> => {
  const gate = gateOf(key);
  if (!gate) {
    throw new Error(browserAskWords.noBrowser(origin));
  }
  // Asleep, it is woken as the door's browser tool wakes it as it connects
  // (gate.ts `wake`): a delegate reopened after its browser slept asks
  // about the pages it had all the same.
  const failed = await gate.wake(workspaceId).then(
    () => undefined,
    (error: unknown) => error
  );
  const record = await readBrowser(key);
  if (failed !== undefined || record?.state !== "live") {
    throw new Error(record?.why ?? browserAskWords.noBrowser(origin), {
      cause: failed,
    });
  }
  // A door that ended, or whose browser slept, and came back (a delegate's
  // item reopened, in a clone cut again or not) asks about the pages it
  // had: they open again first.
  await gate.restore(workspaceId);
  const link = await CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  ).catch((error: unknown) => {
    throw new Error(browserAskWords.noBrowser(origin), { cause: error });
  });
  try {
    const at = new Map(
      (await pagesOf(link)).map((page) => [page.targetId, originOf(page.url)])
    );
    const owners = await pageOwners(key);
    const own = Object.keys(owners).filter(
      (target) => owners[target] === workspaceId && at.get(target) === origin
    );
    const driven = gate?.drivenBy(workspaceId);
    const targetId =
      driven && own.includes(driven) ? driven : (own.at(-1) ?? null);
    if (!targetId) {
      throw new Error(browserAskWords.noPage(origin));
    }
    return { targetId };
  } finally {
    link.close();
  }
};

/**
 * The daemon's one admin session in each browser's neko, by its container:
 * every login in neko's multiuser provider is a session of its own
 * (`id := fmt.Sprintf("%s-%s", username, token)`), and neko judges a call by
 * the session it comes as (`HostsOnly`: `session.IsHost()`), so the control
 * the admin takes and the clipboard it empties must be one session's.
 */
const admins = new Map<string, string>();

/** One POST to neko's REST as `token`'s session. */
const nekoPost = async (
  record: BrowserRecord,
  token: string,
  path: string,
  body: unknown
): Promise<Response> => {
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
  return read.value;
};

/** Calls neko's REST as the daemon's admin session, logged in again only when neko no longer knows it (a new container). */
const neko = async (
  record: BrowserRecord,
  path: string,
  body?: unknown
): Promise<void> => {
  const container = record.container?.id ?? record.key;
  let token = admins.get(container);
  if (!token) {
    token = await nekoLogin(record, "admin");
    admins.set(container, token);
  }
  let response = await nekoPost(record, token, path, body);
  if (response.status === 401) {
    await response.body?.cancel();
    token = await nekoLogin(record, "admin");
    admins.set(container, token);
    response = await nekoPost(record, token, path, body);
  }
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

/** Writes the record's `takeover` as the shield holds it now, and tells the hub. */
const recordTakeover = async (
  ports: ShieldPorts,
  key: BrowserKey,
  take: Held | undefined
) => {
  await withBrowser(key, async () => {
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
  browsersChanged(ports);
};

/**
 * The take-over's view of its page, on either host: started once, whoever
 * asks first. The page it shows is the address's (a sign-in's popup while
 * it stands).
 */
const viewFor = (
  key: BrowserKey,
  record: BrowserRecord,
  take: Held
): Promise<CdpTakeover | undefined> | undefined => {
  if (!take.targetId) {
    return;
  }
  take.cdp ??= CdpTakeover.start(
    `http://127.0.0.1:${portsOf(record).devtools}`,
    take.targetId
  ).then(
    (view) => {
      view.onShown = (targetId) => setFront(key, targetId);
      return view;
    },
    (error: unknown): undefined => {
      console.warn(
        `[browser] ${key}'s take-over view did not start: ${why(error)}`
      );
    }
  );
  return take.cdp;
};

/**
 * Take over: the gate closed, the asking workspace's page in front, control
 * the person's. Sent again for a browser already held, it keeps the
 * take-over as it stands.
 */
export const shieldBrowser = async (
  ports: ShieldPorts,
  args: BrowserShieldArgs
): Promise<BrowserRow> => {
  const { key } = args;
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  // Closed before anything else: no agent reads the page from here on.
  gateOf(key)?.closeAll();
  const before = held.get(key);
  // A take-over this daemon holds already (sent again) keeps its browser
  // as it runs: it is never started again under the person.
  if (!before) {
    await startBrowser(ports, { key });
  }
  const gate = gateOf(key);
  if (!gate) {
    throw new Error(
      `${key}'s gate is not served on this machine, so it could not be closed; nothing was given to the person.`
    );
  }
  gate.closeAll();
  const record = await readBrowser(key);
  if (!record) {
    throw new Error(`${key} has no record on this machine.`);
  }
  // The page to bring forward, found before anything is held: an ask's page
  // closed since it parked refuses the take-over, and the agents have the
  // browser back as they had it.
  const front = before
    ? undefined
    : await (async () => {
        const link = await CdpLink.open(
          `http://127.0.0.1:${portsOf(record).devtools}`
        );
        try {
          const targetId = await frontPage(key, link, args);
          if (targetId) {
            await link.call("Target.activateTarget", { targetId });
          }
          return targetId;
        } finally {
          link.close();
        }
      })().catch((error: unknown) => {
        gate.open();
        throw error;
      });
  const take: Held = before ?? {
    since: Date.now(),
    hubViewers: 0,
    unwatchedSince: Date.now(),
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    ...(args.origin ? { origin: args.origin } : {}),
    ...(args.requestId ? { requestId: args.requestId } : {}),
    ...(front ? { targetId: front } : {}),
  };
  held.set(key, take);
  await keep(key, take);
  await recordTakeover(ports, key, take);
  // The band names the page in front, the one the person sees.
  if (take.targetId) {
    setFront(key, take.targetId);
  }
  // The views watching the page while nobody held it open again on the
  // take-over's own screencast.
  endWatch(key, "The person took the browser over.");
  await viewFor(key, record, take);
  await keep(key, take);
  await recordTakeover(ports, key, take);
  watch(ports);
  console.info(
    `[browser] ${key} taken over${take.workspaceId ? ` for workspace ${take.workspaceId}` : ""}`
  );
  return rowOf(key);
};

/**
 * The front page made new: what the person typed is gone, and the page is
 * asked for again by GET; answers its origin.
 *
 * The page is cleared first with `about:blank`, which commits inside the
 * browser, no site involved, so nothing typed survives in any field however
 * the site answers (or whether it does): `Page.navigate` answers only once a
 * navigation commits, which for a site's URL waits on its response. The
 * page's own URL is then asked for by GET (never a reload, so a page a form
 * posted to is not posted again), and its answer is the site's to give: the
 * hand-back does not wait on it, and the agent's tool sees it load. A clear
 * that does not commit means the page itself is stuck, and the hand-back
 * fails with what the page was.
 */
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
    const index =
      typeof history.currentIndex === "number" ? history.currentIndex : -1;
    const current = Array.isArray(history.entries)
      ? HISTORY_ENTRY.safeParse(history.entries[index]).data
      : undefined;
    const url = current?.url ?? page.url;
    if (!url || url === "about:blank") {
      return null;
    }
    await link
      .call("Page.navigate", { url: "about:blank" }, session)
      .catch((error: unknown) => {
        throw new Error(
          `the page at ${pageForLog(url)} did not clear (${why(error)})`,
          { cause: error }
        );
      });
    link.post("Page.navigate", { url }, session);
    return originOf(url) ?? null;
  } finally {
    link.close();
  }
};

/**
 * Hand back: the take-over's view ended (the person's input and layout
 * gone with its DevTools link), the front page loaded again by GET, the
 * clipboard emptied, the gate open; answers the page's origin.
 *
 * On the container host the clipboard is the headful Chromium's own, which
 * a page's copy (a code's Copy button, the person's own copy) fills while
 * the person holds it. neko serves it only to its host (its room routes
 * are `HostsOnly`), so the daemon's admin takes control (`control/take`),
 * empties it, and gives control up again (`control/reset`), leaving nobody
 * hosting. A step that fails is said in the log and answered to the hub,
 * and the gate stays closed: the private period ends only whole.
 */
export const handBackBrowser = async (
  ports: ShieldPorts,
  key: BrowserKey,
  /** How it came to be handed back: the person's Hand back, or the daemon's own. */
  said: BrowserHandedBackFrame["why"] = "person"
): Promise<BrowserHandback> => {
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  const take = held.get(key) ?? (await keptOf(key));
  const record = await readBrowser(key);
  let origin: string | null = null;
  if (record && take) {
    const step = async <T>(
      what: string,
      work: () => Promise<T>
    ): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        const failure = `${key} was not handed back: ${what} failed (${why(error)}); its gate stays closed.`;
        console.warn(`[browser] ${failure}`);
        throw new Error(failure, { cause: error });
      }
    };
    // The view's DevTools link closed first: the person's input stops,
    // and the layout it set goes with it, so the page the agent gets back
    // is laid out as the desktop's.
    await endView(take);
    origin = await step("loading the page again", () =>
      reloadFront(record, take.targetId)
    );
    if (record.host === "container") {
      await step("taking neko's control to reach its clipboard", () =>
        neko(record, "/room/control/take")
      );
      await step("emptying the clipboard", () =>
        neko(record, "/room/clipboard", { text: "" })
      );
      await step("leaving the browser with no host", () =>
        neko(record, "/room/control/reset")
      );
    }
  }
  const answer: BrowserHandback = {
    key,
    origin,
    ...(take?.requestId ? { requestId: take.requestId } : {}),
  };
  await release(ports, key, answer, said);
  console.info(
    `[browser] ${key} handed back${origin ? ` on ${origin}` : ""}, its gate open`
  );
  return answer;
};

/**
 * Ends a take-over's view: its DevTools link closed at once, which takes
 * the person's layout with it, whether Chromium answers or the link is
 * already gone ({@link CdpTakeover.stop} waits on nothing). A view still
 * starting is waited for {@link VIEW_START_MS}; one that has not started
 * by then has had no view attached, so it laid nothing out, and the gate
 * need not wait on it: it is ended as soon as it starts.
 */
const endView = async (take: Held): Promise<void> => {
  const starting = take.cdp;
  if (!starting) {
    return;
  }
  const read = await readWithin(VIEW_START_MS, () => starting);
  if (read.kind === "answered") {
    await read.value?.stop();
    return;
  }
  starting.then((view) => view?.stop()).catch(() => undefined);
};

/**
 * Every page of `key`'s browser at its window's own size before the gate
 * opens (own-size.ts): a take-over's link that closed while its sharp
 * picture was being taken, which no stop can rule out (a dropped
 * connection, a daemon that died), leaves the page laid out at the
 * picture's size. Within {@link RESTORE_MS}; a browser that stopped has no
 * page to set right.
 */
const restorePages = async (key: BrowserKey): Promise<void> => {
  const record = await readBrowser(key);
  if (record?.state !== "live") {
    return;
  }
  const read = await readWithin(RESTORE_MS, () =>
    restoreWindows(`http://127.0.0.1:${portsOf(record).devtools}`)
  ).catch((error: unknown) => {
    console.warn(
      `[browser] ${key}'s pages were not set to their windows' size: ${why(error)}`
    );
  });
  if (!read) {
    return;
  }
  if (read.kind === "unanswered") {
    console.warn(
      `[browser] ${key}'s pages were not set to their windows' size within ${RESTORE_MS / 1000} s`
    );
    return;
  }
  const { stuck, again, loaded } = read.value;
  if (stuck.length > 0) {
    // Each page by its origin alone (pageForLog): the restore answers full
    // addresses, and what the person had open stays out of the log.
    const pages = (urls: string[]) =>
      urls.length > 0
        ? `${urls.length} (${urls.map(pageForLog).join(", ")})`
        : "none";
    console.info(
      `[browser] ${key}: off their window's size after the take-over: ${pages(stuck)}; moved again: ${again.length > 0 ? `${again.length} (${again.map((one) => `${pageForLog(one.url)}, ${one.moves} moves`).join("; ")})` : "none"}; loaded again: ${pages(loaded)}`
    );
  }
};

/**
 * The one place a take-over ends: forgotten here and in the browser's dir,
 * the gate open, and the hub told. The hand-back is told first, whoever
 * ended it (`said`), so the ask's call answers with the page's origin; then
 * the record, whose frame every screen follows. The take-over's view is
 * ended and every page set to its window's size before the gate opens,
 * whichever way it ends: the layout its DevTools link set dies with the
 * link, a page a cut link left at its sharp picture's size is set right,
 * and no agent meets the person's.
 */
const release = async (
  ports: ShieldPorts,
  key: BrowserKey,
  answer: BrowserHandback,
  said: BrowserHandedBackFrame["why"]
): Promise<void> => {
  const take = held.get(key);
  tellHub(ports, answer, said);
  held.delete(key);
  if (take) {
    await endView(take);
  }
  await restorePages(key);
  lastQr.delete(key);
  qrUnreadable.delete(key);
  setFront(key, null);
  await rm(shieldFile(key), { force: true });
  await recordTakeover(ports, key, undefined).catch((error: unknown) =>
    console.warn(`[browser] ${key}'s take-over was not cleared: ${why(error)}`)
  );
  gateOf(key)?.open();
};

const keptOf = async (key: BrowserKey): Promise<Held | undefined> => {
  const kept = await readRecord(shieldFile(key), KeptSchema).catch(
    () => undefined
  );
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
 * A view of a browser (the machine's preview listener's
 * `/__cawco/browser/<key>/cdp`): while the person holds it, the take-over's
 * frames and their input onto the page, on either host; while nobody does,
 * the local host's page in front's frames alone, its input dropped
 * (cdp-watch.ts), the container host's being neko's. Undefined when `key`
 * is no live browser held here or local, or shows no page.
 */
export const cdpView = async (
  key: BrowserKey,
  viewer: CdpViewer
): Promise<
  { input: (text: string) => void; leave: () => void } | undefined
> => {
  const take = held.get(key);
  if (!take) {
    const record = await readBrowser(key);
    if (!(record?.host === "local" && record.state === "live")) {
      return;
    }
    const leave = await watchView(
      key,
      `http://127.0.0.1:${portsOf(record).devtools}`,
      viewer
    );
    return leave ? { input: () => undefined, leave } : undefined;
  }
  const cdp = await take.cdp;
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
const watch = (ports: ShieldPorts): void => {
  watching ??= setInterval(() => {
    watchOnce(ports).catch((error: unknown) =>
      console.warn(`[browser] take-overs not counted: ${why(error)}`)
    );
  }, WATCH_MS);
  watching.unref?.();
};

const watchOnce = async (ports: ShieldPorts): Promise<void> => {
  if (held.size === 0 && watching) {
    clearInterval(watching);
    watching = undefined;
    return;
  }
  const now = Date.now();
  for (const [key, take] of held) {
    const record = await readBrowser(key);
    // The browser stopped (Stop, its machine, its container), and the
    // registry cleared its take-over: answered as a hand-back with no page.
    if (!record?.takeover) {
      await release(
        ports,
        key,
        {
          key,
          origin: null,
          ...(take.requestId ? { requestId: take.requestId } : {}),
        },
        "stopped"
      );
      continue;
    }
    // While the take-over stands, check for a passkey QR on the page.
    pollPasskeyQr(ports, key, take).catch(() => undefined);
    const views = Math.max(take.hubViewers, (await take.cdp)?.viewers ?? 0);
    if (views > 0) {
      take.unwatchedSince = undefined;
      continue;
    }
    take.unwatchedSince ??= now;
    if (now - take.unwatchedSince >= TAKEOVER_UNWATCHED_MS) {
      console.info(
        `[browser] ${key}: no view of its take-over for ${TAKEOVER_UNWATCHED_MS / 60_000} minutes: handed back`
      );
      // A step that fails leaves the gate closed (handBackBrowser says
      // which); the next count tries the hand-back again.
      await handBackBrowser(ports, key, "unwatched").catch(() => undefined);
    }
  }
};

/**
 * Attempts to extract a FIDO URI from the page the person is looking at
 * during a take-over. When a new URI is found (one not already emitted for
 * this browser), it is sent to the hub as a `passkey_qr` frame.
 */
const pollPasskeyQr = async (
  { machineId, passkeyQr }: ShieldPorts,
  key: BrowserKey,
  take: Held
): Promise<void> => {
  if (!take.targetId) {
    return;
  }
  const record = await readBrowser(key);
  if (!record) {
    return;
  }
  let link: CdpLink | undefined;
  try {
    link = await CdpLink.open(`http://127.0.0.1:${portsOf(record).devtools}`);
    const session = await link.attach(take.targetId);
    const uri = await extractFidoUri(link, session);
    if (uri && uri !== lastQr.get(key)) {
      lastQr.set(key, uri);
      passkeyQr({
        kind: "passkey_qr",
        machineId,
        key,
        fidoUri: uri,
        raisedAt: Date.now(),
      });
      console.info(`[browser] ${key}: passkey QR extracted`);
    }
    qrUnreadable.delete(key);
  } catch (error) {
    // The browser may not be reachable: this tick reads nothing, and the
    // first of a streak says why.
    if (!qrUnreadable.has(key)) {
      qrUnreadable.add(key);
      console.info(`[browser] ${key}: passkey QR not read: ${why(error)}`);
    }
  } finally {
    link?.close();
  }
};

const tellHub = (
  { machineId, shield }: ShieldPorts,
  answer: BrowserHandback,
  said: BrowserHandedBackFrame["why"]
): void => {
  shield({
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
 * again (its `shield.json`, else what its record's `takeover` says), with
 * its view of its page started again, until the person hands back.
 * Its gate starts closed: the registry closes a gate it makes for a record
 * that holds a take-over (browsers.ts `gateFor`). A browser that stopped
 * meanwhile has its take-over released by the watch.
 */
export const restoreShields = async (ports: ShieldPorts): Promise<void> => {
  const keys: BrowserKey[] = [];
  for (const record of await allBrowsers()) {
    const kept = await keptOf(record.key);
    if (!record.takeover) {
      if (kept) {
        await rm(shieldFile(record.key), { force: true });
      }
      continue;
    }
    const { by, since, requestId } = record.takeover;
    const take: Held = {
      since,
      ...(by ? { workspaceId: by } : {}),
      ...(requestId ? { requestId } : {}),
      ...kept,
      hubViewers: 0,
      unwatchedSince: Date.now(),
    };
    held.set(record.key, take);
    viewFor(record.key, record, take);
    keys.push(record.key);
  }
  if (keys.length === 0) {
    return;
  }
  console.info(
    `[browser] held privately across the restart: ${keys.join(", ")}`
  );
  watch(ports);
};
