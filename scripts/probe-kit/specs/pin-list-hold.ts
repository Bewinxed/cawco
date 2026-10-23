/**
 * The Comments list lists every pin the hub holds, and never reads a pin
 * list not read yet as an empty one (owner, 2026-10-19: "for the pins i
 * opened before, they don't show up in the list of comments or resolved
 * comments on the previous pages"). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model) and the built dashboard, an
 * artifact's own tab at the desk (1440, light and dark) and the phone (390),
 * read from the pane's DOM, its computed styles and the hub's `comment_read`
 * route, never from pixels:
 *
 * 1. A page with three pins written in its own doc, as the overlay writes
 *    them: one on its paragraph, two on elements the page doesn't have,
 *    which the overlay moves aside itself (`movedAt`); one of those two
 *    resolved through the hub. The rail's tabs read the hub's counts (Open
 *    2, Resolved 1), the head's Comments drawing no count while the rail
 *    stands; Open lists pin 1 and pin
 *    3, pin 3's row marked moved (its disc recessed) and, like every row,
 *    one button holding no other; Resolved lists pin 2 the same way.
 * 2. The pane's doc held back by a stand-in for its socket (`routeWebSocket`
 *    on `/ws/artifact/`, the hub's messages kept 2.5 s): from the socket's
 *    start until the doc lands no empty state, no row, no tab count and no
 *    head count element is drawn; nothing inside `--dur-wait-grace`, then
 *    skeleton rows at a pin row's height, their fill apart from the list's
 *    surface (The Claim Of Nothing Rule); once the doc lands, the rows of (1)
 *    and the counts in their place.
 * 3. The pane's socket refused before it ever synced (the hub's own terminal
 *    code, 4404, and its reason): the list's RowFault says the comments
 *    couldn't be read with that reason as its own sentence, in ink of 4.5:1
 *    or more on the list's surface, beside Try again; no empty state and no
 *    count; with the socket let through, Try again brings the rows of (1).
 * 4. An artifact with no pins, once read: "No open comments", the tabs and
 *    the head with no count element at 0 (The Earned Count Rule).
 * 5. A write of the pane's the hub would not keep, once synced (the hub's
 *    4400 close, which y-websocket never reopens by itself): the pane says
 *    the hub's reason in its band and joins the hub's doc again, so a pin the
 *    page writes after it is in the list.
 */
import type { Frame, Page, WebSocketRoute } from "playwright-core";
import { commonWords } from "../../../packages/core/src/words/common";
import { until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
/** The Comments rail (DESIGN.md, The Comments rail). */
const LIST = '[data-slot="comment-rail"]';
type Theme = "light" | "dark";
/** Each leg: where it runs and in which scheme. */
const LEGS: { theme: Theme; view: "desk" | "phone" }[] = [
  { view: "desk", theme: "light" },
  { view: "desk", theme: "dark" },
  { view: "phone", theme: "light" },
];
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pins</title></head><body><h1>Pins</h1><p id="here">The paragraph pin 1 stands on.</p></body></html>';
const REFUSAL = "probe refuses the link";
const WRITE_REFUSAL = "probe refuses the write";
/** How long the stand-in keeps the hub's first messages from the pane. */
const HOLD_MS = 2500;
/** A tab's label carrying a count, as the recorder writes it. */
const COUNTED = /tabs=Open \d/;

interface HubPin {
  id: string;
  movedAt?: string;
  number: number;
  resolvedAt?: string;
}

/** What the list draws now: its tabs, the rows under the tab on show, its states, and the inks they stand in. */
interface Drawn {
  /** The head's Comments' accessible name. */
  commentsLabel: string | null;
  count: string | null;
  empty: boolean;
  failed: string | null;
  /** The fault's reason ink against the list's surface, as a WCAG ratio. */
  faultContrast: number | null;
  moved: number[];
  reading: boolean;
  /** A pin row's height and each skeleton row's, px. */
  rowHeight: number | null;
  rows: number[];
  skeletonFillApart: boolean | null;
  skeletonHeights: number[];
  tabs: string[];
  tryAgain: boolean;
}

const drawn = (page: Page): Promise<Drawn> =>
  page
    .evaluate(
      ({ list, pane }) => {
        const root = document.querySelector(list);
        const numbers = (selector: string, attribute: string) =>
          [...(root?.querySelectorAll<HTMLElement>(selector) ?? [])].map((el) =>
            Number(el.getAttribute(attribute))
          );
        const failed = root?.querySelector("[data-pin-list-failed]");
        /** A CSS colour as sRGB bytes, by a canvas (it takes oklch and color() alike). */
        const rgba = (css: string) => {
          const ctx = document.createElement("canvas").getContext("2d");
          if (!ctx) {
            return [0, 0, 0, 0];
          }
          ctx.fillStyle = css;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data];
        };
        const luminance = ([r, g, b]: number[]) => {
          const lin = (c: number) => {
            const v = c / 255;
            return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          };
          return (
            0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0)
          );
        };
        /** The first solid background from `el` up: the surface it stands on. */
        const surfaceOf = (el: Element | null | undefined) => {
          for (let at = el; at; at = at.parentElement) {
            const bg = rgba(getComputedStyle(at).backgroundColor);
            if (bg[3] === 255) {
              return bg;
            }
          }
          return rgba("white");
        };
        const reason = failed?.querySelector('[data-slot="reason"]');
        const surface = surfaceOf(root);
        const ratio = (a: number[], b: number[]) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
        };
        const skeleton = root?.querySelector('[data-slot="skeleton"]');
        const heightOf = (el: Element | null | undefined) =>
          el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null;
        return {
          commentsLabel:
            document
              .querySelector(`${pane} [data-slot="comments"]`)
              ?.getAttribute("aria-label") ?? null,
          count:
            document.querySelector(`${pane} [data-slot="count"]`)
              ?.textContent ?? null,
          faultContrast: reason
            ? Math.round(
                ratio(rgba(getComputedStyle(reason).color), surface) * 100
              ) / 100
            : null,
          skeletonFillApart: skeleton
            ? rgba(getComputedStyle(skeleton).backgroundColor).join() !==
              surface.join()
            : null,
          skeletonHeights: [
            ...(root?.querySelectorAll('[data-slot="skeleton-row"]') ?? []),
          ].map((row) => heightOf(row) ?? 0),
          rowHeight: heightOf(root?.querySelector('[data-slot="pin-row"]')),
          tabs: [...(root?.querySelectorAll('[role="tab"]') ?? [])].map(
            (tab) => tab.textContent?.trim() ?? ""
          ),
          rows: numbers("[data-pin-row]:not([data-moved])", "data-pin-row"),
          moved: numbers("[data-pin-row][data-moved]", "data-pin-row"),
          empty: !!root?.querySelector('[data-slot="pin-list-empty"]'),
          reading: !!root?.querySelector('[data-slot="pin-list-reading"]'),
          failed: reason?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        };
      },
      { list: LIST, pane: PANE }
    )
    .then(async (read) => ({
      ...read,
      // By its accessible name: a kit Button's text holds its pending words too.
      tryAgain:
        (await page
          .locator(`${LIST} [data-pin-list-failed]`)
          .getByRole("button", { name: commonWords.tryAgain, exact: true })
          .count()) > 0,
    }));

/** Whether pin `pin`'s row is a button, and how many buttons stand inside it (none: the row is the press). */
const rowPress = (page: Page, pin: number) =>
  page
    .locator(`${LIST} [data-pin-row="${pin}"]`)
    .evaluate((row) => ({
      button: row.tagName === "BUTTON",
      inside: row.querySelectorAll("button").length,
    }))
    .catch(() => ({ button: false, inside: -1 }));

const pageFrame = async (page: Page): Promise<Frame> =>
  (await until(
    "the page in the pane",
    async () =>
      (await (await page.locator(FRAME).elementHandle())?.contentFrame()) ??
      null,
    Boolean,
    60_000
  )) as Frame;

/** The list opens with the pane (its kept state), on every view, the head's control in More or not. */
const listOpenFor = (page: Page, session: string) =>
  page.addInitScript((key) => {
    localStorage.setItem(key, "open");
  }, `cawco-preview-comments:${session}`);

/** Records, from the page's own clock, when the pane's artifact socket opened and every state the list drew after it. */
const recorder = () => {
  const seen: { at: number; state: string }[] = [];
  let socketAt = 0;
  const Native = window.WebSocket;
  window.WebSocket = class extends Native {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      if (String(url).includes("/ws/artifact/") && !socketAt) {
        socketAt = performance.now();
      }
    }
  } as typeof WebSocket;
  const look = () => {
    if (!socketAt) {
      return;
    }
    const list = document.querySelector('[data-slot="comment-rail"]');
    if (!list) {
      return;
    }
    const tabs = [...list.querySelectorAll('[role="tab"]')]
      .map((tab) => tab.textContent?.trim())
      .join("|");
    const state = [
      `tabs=${tabs}`,
      list.querySelector('[data-slot="pin-list-empty"]') ? "empty" : "",
      list.querySelector('[data-slot="pin-list-reading"]') ? "reading" : "",
      list.querySelector("[data-pin-row]") ? "rows" : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (seen.at(-1)?.state !== state) {
      seen.push({ at: Math.round(performance.now() - socketAt), state });
    }
  };
  new MutationObserver(look).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  Object.defineProperty(window, "probeListSeen", {
    value: () => ({ seen, socketAt }),
  });
};

/** The pane's artifact socket through the spec: held, refused, or let through. */
interface Stand {
  mode: "hold" | "refuse" | "through";
  /** Closes the socket open now as the hub closes one whose write it would not keep (4400). */
  refuseWrite: () => void;
  release: () => void;
}

const standIn = async (page: Page): Promise<Stand> => {
  const held: (() => void)[] = [];
  let releasing = false;
  let current: WebSocketRoute | null = null;
  const stand: Stand = {
    mode: "through",
    refuseWrite: () => {
      current?.close({ code: 4400, reason: WRITE_REFUSAL });
      current = null;
    },
    release: () => {
      releasing = true;
      for (const send of held.splice(0)) {
        send();
      }
    },
  };
  await page.routeWebSocket(
    (url) => url.pathname.startsWith("/ws/artifact/"),
    (ws: WebSocketRoute) => {
      if (stand.mode === "refuse") {
        ws.close({ code: 4404, reason: REFUSAL });
        return;
      }
      current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (stand.mode === "hold" && !releasing) {
          held.push(() => ws.send(message));
          return;
        }
        ws.send(message);
      });
    }
  );
  return stand;
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const session = await fleet.spawn("claude", "Pins held", fleet.repo);
  const { id } = await fleet.api<{ id: string }>(
    `/api/instances/${session}/artifacts`,
    {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: "pins-held",
      html: PAGE,
    }
  );
  const at = { base, fleet, id, kit, session };
  const hub = await pinned(at);
  for (const leg of LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one leg after the other
    await counts(at, leg, hub);
    await heldBack(at, leg);
    await refused(at, leg);
  }
  const none = await fleet.api<{ id: string }>(
    `/api/instances/${session}/artifacts`,
    {
      kind: "page",
      does: "judge",
      ask: "Judge this page: pin anything that reads wrong",
      name: "pins-none",
      html: PAGE,
    }
  );
  await nothing({ ...at, id: none.id });
  await rejoined(at);
};

interface Leg {
  theme: Theme;
  view: "desk" | "phone";
}

const pageFor = (at: At, leg: Leg) =>
  at.kit.page(leg.view, { theme: leg.theme });

interface At {
  base: string;
  fleet: KitFleet;
  id: string;
  kit: Kit;
  session: string;
}

/** The hub's pins on the artifact. */
const hubPins = async ({ fleet, id, session }: At): Promise<HubPin[]> =>
  (
    await fleet.api<{ artifacts: { id: string; pins: HubPin[] }[] }>(
      `/api/instances/${session}/artifacts/comments?artifact=${id}&filter=all`
    )
  ).artifacts.find((one) => one.id === id)?.pins ?? [];

/** Writes the three pins in the page's own doc, lets the overlay move two aside, and resolves one through the hub. */
const pinned = async (at: At): Promise<HubPin[]> => {
  const page = await at.kit.page("desk");
  await open(
    page,
    `${at.base}/artifact/${at.id}`,
    `${PANE} [data-slot="comments"]`
  );
  const frame = await pageFrame(page);
  await frame.waitForFunction(
    () =>
      !!document.querySelector("#here") &&
      !!(window as unknown as { cawcoArtifact?: { doc?: unknown } })
        .cawcoArtifact?.doc
  );
  await frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
            transact: (f: () => void) => void;
          };
        };
      }
    ).cawcoArtifact;
    const pin = (number: number, selector: string, text: string) => ({
      id: `probe-pin-${number}`,
      number,
      kind: "comment",
      anchor: { selector, text },
      at: new Date().toISOString(),
      by: "person",
      elements: [],
      point: { x: 0.5, y: 0.5 },
      thread: [
        {
          id: `probe-entry-${number}`,
          by: "person",
          text: `Pin ${number}`,
          at: new Date().toISOString(),
        },
      ],
    });
    doc.transact(() => {
      const pins = doc.getMap("pins");
      pins.set(
        "probe-pin-1",
        pin(1, "#here", "The paragraph pin 1 stands on.")
      );
      pins.set("probe-pin-2", pin(2, "#gone-two", "A card the page dropped"));
      pins.set("probe-pin-3", pin(3, "#gone-three", "Another card it dropped"));
    });
  });
  const moved = await until(
    "the overlay moving pins 2 and 3 aside",
    () => hubPins(at),
    (now) =>
      now
        .filter((pin) => pin.movedAt)
        .map((pin) => pin.number)
        .join() === "2,3",
    30_000
  ).catch(() => hubPins(at));
  at.kit.check(
    "1: the hub holds pin 1 placed and pins 2 and 3 moved by the overlay",
    moved.length === 3 &&
      moved
        .filter((pin) => pin.movedAt)
        .map((pin) => pin.number)
        .join() === "2,3",
    JSON.stringify(moved)
  );
  await at.fleet.api(
    `/api/instances/${at.session}/artifacts/comments/probe-pin-2/resolve`,
    {}
  );
  const resolved = await until(
    "pin 2 resolved on the hub",
    () => hubPins(at),
    (now) => !!now.find((pin) => pin.number === 2)?.resolvedAt,
    15_000
  ).catch(() => hubPins(at));
  await page.close();
  return resolved;
};

/** 1. The tabs and the head read the hub's counts; moved pins under their own tab, each row one button. */
const counts = async (at: At, leg: Leg, hub: HubPin[]) => {
  const { view } = leg;
  const check = (name: string, ok: boolean, detail: string) =>
    at.kit.check(`${view} ${leg.theme}: ${name}`, ok, detail);
  const openOnHub = hub.filter((pin) => !pin.resolvedAt).length;
  const resolvedOnHub = hub.filter((pin) => pin.resolvedAt).length;
  const page = await pageFor(at, leg);
  await listOpenFor(page, at.session);
  await openTab(page, at);
  const onOpen = await until(
    "the list's rows",
    () => drawn(page),
    (now) => now.rows.length + now.moved.length > 0,
    30_000
  ).catch(() => drawn(page));
  check(
    `1: the tabs read the hub's counts (Open ${openOnHub}, Resolved ${resolvedOnHub}); the head's Comments draws no count while the rail stands, its Open tab saying it`,
    onOpen.tabs.join("|") === `Open ${openOnHub}|Resolved ${resolvedOnHub}` &&
      onOpen.count === null,
    JSON.stringify(onOpen)
  );
  const openPress = await rowPress(page, 3);
  check(
    "1: Open lists pin 1, and pin 3 marked moved, its row one button holding none",
    onOpen.rows.join() === "1" &&
      onOpen.moved.join() === "3" &&
      openPress.button &&
      openPress.inside === 0,
    `${JSON.stringify(onOpen)}; pin 3's row: ${JSON.stringify(openPress)}`
  );
  await page.locator(`${LIST} [role="tab"]`, { hasText: "Resolved" }).click();
  const onResolved = await until(
    "the Resolved tab's rows",
    () => drawn(page),
    (now) => now.moved.includes(2) || now.empty,
    10_000
  ).catch(() => drawn(page));
  const resolvedPress = await rowPress(page, 2);
  check(
    "1: Resolved lists pin 2, moved and resolved, its row one button holding none",
    onResolved.rows.length === 0 &&
      onResolved.moved.join() === "2" &&
      resolvedPress.button &&
      resolvedPress.inside === 0 &&
      !onResolved.empty,
    `${JSON.stringify(onResolved)}; pin 2's row: ${JSON.stringify(resolvedPress)}`
  );
  await page.close();
};

const openTab = (page: Page, at: At) =>
  open(page, `${at.base}/artifact/${at.id}`, `${PANE} iframe[title="Preview"]`);

/** 2. The first sync held back: nothing said in the grace, then the reading line, never an empty list or a zero. */
const heldBack = async (at: At, leg: Leg) => {
  const { view } = leg;
  const check = (name: string, ok: boolean, detail: string) =>
    at.kit.check(`${view} ${leg.theme}: ${name}`, ok, detail);
  const page = await pageFor(at, leg);
  await listOpenFor(page, at.session);
  await page.addInitScript(recorder);
  const stand = await standIn(page);
  stand.mode = "hold";
  await openTab(page, at);
  const grace = await page.evaluate(() =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--dur-wait-grace"
      )
    )
  );
  const graceMs = grace < 10 ? grace * 1000 : grace;
  const socketAt = await until(
    "the pane's artifact socket",
    () =>
      page.evaluate(
        () =>
          (
            window as unknown as { probeListSeen: () => { socketAt: number } }
          ).probeListSeen().socketAt
      ),
    (start) => start > 0,
    30_000
  );
  const heldFor = await page.evaluate(
    (start) => performance.now() - start,
    socketAt
  );
  await Bun.sleep(Math.max(0, HOLD_MS - heldFor));
  const during = await drawn(page);
  stand.release();
  const after = await until(
    "the rows once the doc lands, the skeleton's cross-fade done",
    () => drawn(page),
    (now) => now.rows.length + now.moved.length > 0 && !now.reading,
    15_000
  ).catch(() => drawn(page));
  const { seen } = await page.evaluate(() =>
    (
      window as unknown as {
        probeListSeen: () => { seen: { at: number; state: string }[] };
      }
    ).probeListSeen()
  );
  const beforeRows = seen.filter((one) => !one.state.includes("rows"));
  const counted = beforeRows.filter((one) => COUNTED.test(one.state));
  const empties = beforeRows.filter((one) => one.state.includes("empty"));
  const firstReading = seen.find((one) => one.state.includes("reading"));
  const said = JSON.stringify({ graceMs, seen });
  check(
    "2: while the doc is held, no empty state, no tab count and no head count element is drawn",
    empties.length === 0 &&
      counted.length === 0 &&
      beforeRows.length > 0 &&
      during.count === null &&
      (view === "phone" || during.commentsLabel === "Comments"),
    `${said}; at ${HOLD_MS} ms: ${JSON.stringify(during)}`
  );
  check(
    `2: nothing inside --dur-wait-grace (${graceMs} ms), then skeleton rows, their fill apart from the list's surface`,
    !!firstReading &&
      firstReading.at >= graceMs - 50 &&
      during.reading &&
      during.skeletonHeights.length === 3 &&
      during.skeletonFillApart === true &&
      !during.empty &&
      during.rows.length + during.moved.length === 0,
    `${said}; at ${HOLD_MS} ms: ${JSON.stringify(during)}`
  );
  check(
    "2: each skeleton row stands at a pin row's height",
    after.rowHeight !== null &&
      during.skeletonHeights.every(
        (height) => Math.abs(height - (after.rowHeight ?? 0)) <= 1
      ),
    `skeleton ${JSON.stringify(during.skeletonHeights)}; pin row ${after.rowHeight}`
  );
  check(
    "2: once the doc lands, its rows and counts replace the skeleton",
    !after.reading &&
      after.rows.join() === "1" &&
      after.moved.join() === "3" &&
      after.tabs.join("|") === "Open 2|Resolved 1",
    JSON.stringify(after)
  );
  await page.close();
};

/** 3. A socket refused before it synced: why, as its own sentence, and Try again bringing the rows. */
const refused = async (at: At, leg: Leg) => {
  const { view } = leg;
  const check = (name: string, ok: boolean, detail: string) =>
    at.kit.check(`${view} ${leg.theme}: ${name}`, ok, detail);
  const page = await pageFor(at, leg);
  await listOpenFor(page, at.session);
  const stand = await standIn(page);
  stand.mode = "refuse";
  await openTab(page, at);
  const failed = await until(
    "the list saying the comments couldn't be read",
    () => drawn(page),
    (now) => now.failed !== null,
    15_000
  ).catch(() => drawn(page));
  check(
    "3: a refused first sync says the comments couldn't be read, the hub's reason its own sentence, in ink of 4.5:1 on the list, with Try again; no empty state, no count",
    failed.failed === `The comments couldn't be read. ${REFUSAL}.` &&
      failed.tryAgain &&
      (failed.faultContrast ?? 0) >= 4.5 &&
      !failed.empty &&
      failed.count === null &&
      failed.tabs.join("|") === "Open|Resolved",
    JSON.stringify(failed)
  );
  stand.mode = "through";
  await settle(page);
  await page
    .locator(`${LIST} [data-pin-list-failed]`)
    .getByRole("button", { name: commonWords.tryAgain })
    .click();
  const back = await until(
    "the rows after Try again",
    () => drawn(page),
    (now) => now.rows.length + now.moved.length > 0,
    15_000
  ).catch(() => drawn(page));
  check(
    "3: Try again with the socket let through brings the rows and counts",
    back.failed === null &&
      back.rows.join() === "1" &&
      back.moved.join() === "3" &&
      back.tabs.join("|") === "Open 2|Resolved 1",
    JSON.stringify(back)
  );
  await page.close();
};

/** 4. No pins, once read: the empty state, and no count element anywhere at 0. */
const nothing = async (at: At) => {
  const page = await pageFor(at, { view: "desk", theme: "light" });
  await listOpenFor(page, at.session);
  await openTab(page, at);
  const now = await until(
    "the empty state once read",
    () => drawn(page),
    (state) => state.empty,
    30_000
  ).catch(() => drawn(page));
  at.kit.check(
    "4: no pins, once read: No open comments, the tabs and the head with no count at 0",
    now.empty &&
      now.tabs.join("|") === "Open|Resolved" &&
      now.count === null &&
      now.commentsLabel === "Comments",
    JSON.stringify(now)
  );
  await page.close();
};

/** 5. A refused write once synced: the hub's reason in the band, and the pane joined again, a new pin in its list. */
const rejoined = async (at: At) => {
  const page = await pageFor(at, { view: "desk", theme: "light" });
  await listOpenFor(page, at.session);
  const stand = await standIn(page);
  await openTab(page, at);
  await until(
    "the list's rows",
    () => drawn(page),
    (now) => now.rows.length > 0,
    30_000
  ).catch(() => drawn(page));
  stand.refuseWrite();
  const band = page.locator(`${PANE} [data-slot="failure"][role="alert"] p`);
  const said = await until(
    "the band saying the hub's reason",
    async () => ((await band.count()) ? await band.textContent() : null),
    (text) => !!text,
    10_000
  ).catch(() => null);
  const frame = await pageFrame(page);
  await frame.evaluate(() => {
    const { doc } = (
      window as unknown as {
        cawcoArtifact: {
          doc: {
            getMap: (n: string) => { set: (k: string, v: object) => void };
          };
        };
      }
    ).cawcoArtifact;
    doc.getMap("pins").set("probe-pin-4", {
      id: "probe-pin-4",
      number: 4,
      kind: "comment",
      anchor: { selector: "#here", text: "The paragraph pin 1 stands on." },
      at: new Date().toISOString(),
      by: "person",
      elements: [],
      point: { x: 0.2, y: 0.5 },
      thread: [
        {
          id: "probe-entry-4",
          by: "person",
          text: "Pin 4",
          at: new Date().toISOString(),
        },
      ],
    });
  });
  const after = await until(
    "pin 4 in the pane's list",
    () => drawn(page),
    (now) => now.rows.includes(4),
    20_000
  ).catch(() => drawn(page));
  at.kit.check(
    "5: a refused write once synced: the hub's reason in the band, and the pane joined again, pin 4 written after it in its list",
    said === `${WRITE_REFUSAL}.` && after.rows.includes(4),
    `band ${JSON.stringify(said)}; ${JSON.stringify(after)}`
  );
  await page.close();
};

const spec: Spec = { name: "pin-list-hold", run };
export default spec;
