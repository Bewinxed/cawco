/**
 * The Comments list lists every pin the hub holds, and never reads a pin
 * list not read yet as an empty one (owner, 2026-10-19: "for the pins i
 * opened before, they don't show up in the list of comments or resolved
 * comments on the previous pages"). On a scratch fleet (real hub, agent and
 * sessiond; Claude Code against the mock model) and the built dashboard, an
 * artifact's own tab at the desk (1440, light and dark; and light on WebKit)
 * and the phone (390), read from the pane's DOM, its computed styles and the hub's `comment_read`
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
 *    head count element is drawn; nothing inside `--dur-wait-grace` from when
 *    the pane's grace timer started (the timer itself, caught as it fires,
 *    never the socket's start, which an effect may follow), then
 *    skeleton rows at the common row's height (place and age, words), their fill apart from the list's
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
 *    refusal frame on the pane's socket, hub artifacts/sync.ts `refusal`):
 *    the pane says the hub's reason in its band and goes on in a fresh doc
 *    of the hub's, so a pin the page writes after it is in the list.
 * 6. The dashboard behind the owner's outpost proxy (`outpost.bewinxed.com`,
 *    cloudflare-front `outpostTo`, as `~/.outpost/tunnel-proxy.ts` forwards),
 *    on Chromium and WebKit: the pane's doc socket syncs through it, and the
 *    rail lists the pins of (1), never stuck on its skeleton.
 *
 * The tabs read are Open and Resolved; To check, which leads them, is read by
 * its own specs.
 */
import type { Frame, Page, WebSocketRoute } from "playwright-core";
import { messageAuth } from "y-websocket";
import type { Pin } from "../../../packages/core/src/comments";
import { commentWords } from "../../../packages/core/src/words/comments";
import { commonWords } from "../../../packages/core/src/words/common";
import { until } from "../../scratch-fleet";
import { outpostTo, scratchCertificate } from "../cloudflare-front";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";
import { PASS_DOMAIN, PASS_HOSTS } from "../pass-legs";
import { writePagePins } from "../pins";

const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const FRAME = `${PANE} iframe[title="Preview"]`;
/** The Comments rail (DESIGN.md, The Comments rail). */
const LIST = '[data-slot="comment-rail"]';
type Theme = "light" | "dark";
/** Each leg: where it runs and in which scheme. */
const LEGS: Leg[] = [
  { view: "desk", theme: "light" },
  { view: "desk", theme: "dark" },
  { view: "phone", theme: "light" },
  { view: "desk", theme: "light", engine: "webkit" },
];
const PAGE =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Pins</title></head><body><h1>Pins</h1><p id="here">The paragraph pin 1 stands on.</p></body></html>';
const REFUSAL = "probe refuses the link";
const WRITE_REFUSAL = "probe refuses the write";

/**
 * The hub's word that it would not keep a write, as it says it on the
 * writer's socket (hub artifacts/sync.ts `refusal`): y-websocket's auth
 * type, y-protocols' permission denied (0), and the reason, a lib0
 * varString (its UTF-8 length as a varUint, then its bytes).
 */
const refusalFrame = (reason: string): Buffer => {
  const words = new TextEncoder().encode(reason);
  const length: number[] = [];
  let left = words.length;
  while (left > 127) {
    length.push((left % 128) + 128);
    left = Math.floor(left / 128);
  }
  length.push(left);
  return Buffer.from([messageAuth, 0, ...length, ...words]);
};
/** How long the stand-in keeps the hub's first messages from the pane. */
const HOLD_MS = 2500;
/** A tab's label carrying a count, as the recorder writes it. */
const COUNTED = /[=|](?:Open|Resolved) \d/u;

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
  /**
   * The common row's height, px: a comment with no answer, its place and
   * age on one line and its words on the next, nothing under them; and
   * each skeleton row's.
   */
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
          rowHeight: heightOf(
            root?.querySelector(
              '[data-slot="pin-row"]:has([data-line="words"]):not(:has([data-line="back"], [data-attach-strip]))'
            )
          ),
          tabs: [...(root?.querySelectorAll('[role="tab"]') ?? [])].map(
            (tab) => tab.textContent?.trim() ?? ""
          ),
          rows: numbers("[data-pin-row]:not([data-moved])", "data-pin-row"),
          moved: numbers("[data-pin-row][data-moved]", "data-pin-row"),
          empty: !!root?.querySelector('[data-slot="pin-list-empty"]'),
          reading: !!root?.querySelector('[data-slot="pin-list-reading"]'),
          failed: reason?.textContent?.replace(/\s+/gu, " ").trim() ?? null,
        };
      },
      { list: LIST, pane: PANE }
    )
    .then(async (read) => ({
      ...read,
      // Open and Resolved, the tabs that count the pins: To check (what
      // changed since he looked, CommentRail `checks`) leads them, and is
      // read by its own specs.
      tabs: read.tabs.filter((tab) => !tab.startsWith(commentWords.toCheck)),
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

/**
 * Records, from the page's own clock, when the pane's artifact socket opened
 * and every state the list drew after it (`at` from the socket, `t` on the
 * page's clock); and every timer of 100 ms or more that fired until the list
 * first drew its reading rows, with when it was set and when it fired: the
 * pane's `--dur-wait-grace` timer (PreviewPane `readingLong`) among them,
 * which starts in an effect before or after the socket's.
 */
const recorder = () => {
  const seen: { at: number; state: string; t: number }[] = [];
  const fired: { delay: number; firedAt: number; setAt: number }[] = [];
  let socketAt = 0;
  let reading = false;
  const nativeTimeout = window.setTimeout;
  window.setTimeout = ((
    handler: TimerHandler,
    delay?: number,
    ...rest: unknown[]
  ) => {
    const wait = Number(delay ?? 0);
    if (reading || typeof handler !== "function" || wait < 100) {
      return nativeTimeout(handler, delay, ...rest);
    }
    const setAt = performance.now();
    return nativeTimeout(
      (...args: unknown[]) => {
        if (!reading) {
          fired.push({ delay: wait, firedAt: performance.now(), setAt });
        }
        (handler as (...given: unknown[]) => void)(...args);
      },
      delay,
      ...rest
    );
  }) as typeof window.setTimeout;
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
      const t = performance.now();
      seen.push({ at: Math.round(t - socketAt), state, t });
      reading ||= state.includes("reading");
    }
  };
  new MutationObserver(look).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  Object.defineProperty(window, "probeListSeen", {
    value: () => ({ seen, socketAt, fired }),
  });
};

/**
 * When the grace timer that drew the reading rows started, on the page's
 * clock: the last timer of `graceMs` that fired before they were drawn
 * ({@link recorder}); null when none did.
 */
const graceStart = (
  fired: { delay: number; firedAt: number; setAt: number }[],
  graceMs: number,
  readingAt: number
): number | null =>
  fired
    .filter(
      (timer) =>
        Math.abs(timer.delay - graceMs) < 1 && timer.firedAt <= readingAt
    )
    .at(-1)?.setAt ?? null;

/** The pane's artifact socket through the spec: held, refused, or let through. */
interface Stand {
  mode: "hold" | "refuse" | "through";
  /** Says on the socket open now, as the hub does, that it would not keep a write of the pane's. */
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
      current?.send(refusalFrame(WRITE_REFUSAL));
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
  for (const engine of ["chromium", "webkit"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
    await fronted(at, engine);
  }
  await rejoined(at);
};

/** The name the owner reaches his dashboard at, under the kit's resolvable domain. */
const OUTPOST = `outpost.${PASS_DOMAIN}`;

/**
 * 6. The dashboard behind the owner's outpost proxy (`outpost.bewinxed.com`,
 * his Cloudflare tunnel to `~/.outpost/tunnel-proxy.ts`, to 127.0.0.1:3455;
 * cloudflare-front `outpostTo`): https at the front, `X-Forwarded-Proto:
 * https` and the browser's host in `X-Forwarded-Host`; a WebSocket opened
 * on with those, `Origin` and `Cookie` alone. The pane's doc socket
 * (`/ws/artifact/<session>`) completes its first sync through it: the rail
 * lists the pins, never stuck on its skeleton. Chromium at the outpost's
 * name (its host rules map it to 127.0.0.1); WebKit, which takes no host
 * rules, at the front's address.
 */
const fronted = async (at: At, engine: "chromium" | "webkit") => {
  const front = outpostTo(
    new URL(at.base).host,
    await scratchCertificate(at.kit.out, [OUTPOST, "127.0.0.1"])
  );
  const host = engine === "chromium" ? OUTPOST : "127.0.0.1";
  const page = await at.kit.page("desk", {
    engine,
    ignoreHTTPSErrors: true,
    ...(engine === "chromium" ? { hostRules: PASS_HOSTS } : {}),
  });
  await listOpenFor(page, at.session);
  /** Each `/ws/artifact/` socket: how many frames it was sent, and how it closed. */
  const sockets: { frames: number; closed: boolean; url: string }[] = [];
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/artifact/")) {
      return;
    }
    const seen = { frames: 0, closed: false, url: socket.url() };
    sockets.push(seen);
    socket.on("framereceived", () => {
      seen.frames += 1;
    });
    socket.on("close", () => {
      seen.closed = true;
    });
  });
  await open(
    page,
    `https://${host}:${front.port}/artifact/${at.id}`,
    `${LIST}`
  );
  const now = await until(
    "the list's rows through the front",
    () => drawn(page),
    (state) => state.rows.length + state.moved.length > 0,
    30_000
  ).catch(() => drawn(page));
  at.kit.check(
    `6 ${engine}: the dashboard behind the owner's outpost proxy at https://${host} (its socket opened on with X-Forwarded-Host, X-Forwarded-Proto: https, Origin and Cookie alone): the pane's doc socket syncs through it, and the rail lists the pins, no skeleton`,
    !now.reading &&
      now.rows.join() === "1" &&
      now.moved.join() === "3" &&
      sockets.some((socket) => socket.frames > 0),
    JSON.stringify({ now, sockets })
  );
  await page.context().close();
  front.stop(true);
};

interface Leg {
  /** Chromium unless named. */
  engine?: "webkit";
  theme: Theme;
  view: "desk" | "phone";
}

const pageFor = (at: At, leg: Leg) =>
  at.kit.page(leg.view, {
    theme: leg.theme,
    ...(leg.engine ? { engine: leg.engine } : {}),
  });

/** A leg's name in its checks: its view and scheme, and its engine when it is not Chromium. */
const legName = (leg: Leg) =>
  `${leg.view} ${leg.theme}${leg.engine ? ` ${leg.engine}` : ""}`;

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
  const pinAt = (number: number, selector: string, text: string): Pin => ({
    id: `probe-pin-${number}`,
    number,
    kind: "comment",
    anchor: { selector, source: null, text },
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
  await writePagePins(
    frame,
    pinAt(1, "#here", "The paragraph pin 1 stands on."),
    pinAt(2, "#gone-two", "A card the page dropped"),
    pinAt(3, "#gone-three", "Another card it dropped")
  );
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
  const check = (name: string, ok: boolean, detail: string) =>
    at.kit.check(`${legName(leg)}: ${name}`, ok, detail);
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
    at.kit.check(`${legName(leg)}: ${name}`, ok, detail);
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
  const { seen, fired } = await page.evaluate(() =>
    (
      window as unknown as {
        probeListSeen: () => {
          fired: { delay: number; firedAt: number; setAt: number }[];
          seen: { at: number; state: string; t: number }[];
        };
      }
    ).probeListSeen()
  );
  const beforeRows = seen.filter((one) => !one.state.includes("rows"));
  const counted = beforeRows.filter((one) => COUNTED.test(one.state));
  const empties = beforeRows.filter((one) => one.state.includes("empty"));
  const firstReading = seen.find((one) => one.state.includes("reading"));
  // From when the grace timer itself started: it may start in an effect
  // before the socket's, so the socket's clock reads it up to an effect early.
  const graceAt = firstReading
    ? graceStart(fired, graceMs, firstReading.t)
    : null;
  const readingAfterGrace =
    firstReading && graceAt !== null
      ? Math.round(firstReading.t - graceAt)
      : null;
  const said = JSON.stringify({
    graceMs,
    readingAfterGrace,
    seen: seen.map((one) => ({ at: one.at, state: one.state })),
  });
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
    `2: nothing inside --dur-wait-grace (${graceMs} ms) from when its timer started, then skeleton rows, their fill apart from the list's surface`,
    readingAfterGrace !== null &&
      readingAfterGrace >= graceMs - 50 &&
      during.reading &&
      during.skeletonHeights.length === 3 &&
      during.skeletonFillApart === true &&
      !during.empty &&
      during.rows.length + during.moved.length === 0,
    `${said}; at ${HOLD_MS} ms: ${JSON.stringify(during)}`
  );
  check(
    "2: each skeleton row stands at the common row's height (a comment with no answer: its place and age, its words), so the list doesn't jump as it lands",
    after.rowHeight !== null &&
      during.skeletonHeights.every(
        (height) => Math.abs(height - (after.rowHeight ?? 0)) <= 1
      ),
    `skeleton ${JSON.stringify(during.skeletonHeights)}; two-line pin row ${after.rowHeight ?? "none drawn"}`
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
  const check = (name: string, ok: boolean, detail: string) =>
    at.kit.check(`${legName(leg)}: ${name}`, ok, detail);
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
  await writePagePins(frame, {
    id: "probe-pin-4",
    number: 4,
    kind: "comment",
    anchor: {
      selector: "#here",
      source: null,
      text: "The paragraph pin 1 stands on.",
    },
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

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "pin-list-hold",
  run,
};
export default spec;
