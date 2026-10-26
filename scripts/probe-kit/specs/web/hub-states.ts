/**
 * What the dashboard shows while its hub is away, restarting or answering
 * badly, read from the engine: a real hub (a scratch fleet's, no machine),
 * the dashboard's socket run through a proxy the spec holds
 * (`routeWebSocket`), so it can be dropped, refused, or told the hub
 * restarts, and the hub's REST answers delayed or swapped for a tunnel's
 * HTML 502 (`page.route`). At 390, 680 and 1440, light and dark:
 *
 *  (a) the socket dropped: exactly one element says so (the connection
 *      band); its button's label stands at the button's centre with equal
 *      inline paddings; its enter and its leave are transitions on one
 *      clock whose duration and curve are DESIGN's tokens, read by pausing
 *      them and seeking each through its fractions;
 *  (b) an announced update restart (the hub's own `hub.restart`, and the
 *      hub telling it on its own machine's `installing`): the band says the
 *      update, calmly, and nothing says the hub is unreachable until the
 *      deadline; past it, the band says so;
 *  (c) a search whose answer is held 800 ms: placeholder rows from the
 *      first frame after the query, then the answer, and every change of
 *      the card's height over 2 px between two frames is the card's height
 *      animation, never a step;
 *  (d) a search and a project's board answered by an HTML 502: one
 *      sentence, no `<` drawn;
 *  (e) a tab that has never had the hub, refused from its first socket:
 *      the band's `data-open` and the page's top recorded from load (a
 *      MutationObserver and a frame loop installed before the page's own
 *      scripts), the band opening once and holding through 20 s of tries,
 *      the page moving once; closing once when the hub answers; then the
 *      same tab, connected, losing the hub as before;
 *
 * and each state swept for spills and overlaps (journeys/scan.ts).
 */
import type { Page, WebSocketRoute } from "playwright-core";
import { connectionWords } from "../../../../packages/core/src/words/connection";
import { bezierAt, sameCurve } from "../../anim";
import { scan } from "../../journeys/scan";
import {
  frames,
  type Kit,
  open,
  readMotion,
  type Spec,
  settle,
  type View,
} from "../../kit";
import { literal } from "../../words";

const BAND = '[data-slot="hub-band"]';
const CARD = "[data-glass-card-frame]";
/** A tunnel's own page for a hub that didn't answer, as Cloudflare draws it. */
const PROXY_502 = `<!DOCTYPE html><html lang="en-US"><head><title>outpost.example | 502: Bad gateway</title></head><body><div id="cf-wrapper"><h1><span>Bad gateway</span> <span>Error code 502</span></h1><p>Visit <a href="https://www.cloudflare.com/5xx-error-landing">cloudflare.com</a> for more information.</p></div></body></html>`;
/** What a hub's machine says as its update helper is about to restart it. */
const installing = (phase: "installing" | "available") => ({
  phase,
  hostsHub: true,
  installedVersion: "0.0.1",
  availableVersion: "9.9.9-probe",
  channel: "stable",
});
/** Every word that says the hub's connection is away, wherever it is drawn. */
const AWAY =
  /hub unreachable|can.t reach the hub|reach the hub|retrying in|retrying now|reconnecting|reconnect/iu;

const UNREACHABLE = new RegExp(literal(connectionWords.unreachable), "u");
const RECONNECTED = /reconnected/iu;
/** The build's name kept whole: a word joiner may follow its hyphen. */
const UPDATING_PROBE = /updating to 9\.9\.9-\u2060?probe/u;
const UPDATING = /updating/u;
const PROXY_WORDS = /Bad gateway|cloudflare/iu;
const RETRY = /^(retry|try again)$/iu;
/** A reason joined to the sentence before it with a colon. */
const COLON_JOIN = /: The hub/u;

/** The socket's proxy: forward, refuse new sockets, drop the one open, or speak as the hub. */
interface Socket {
  drop: () => void;
  /** The hub's board has arrived on the socket open now. */
  live: () => boolean;
  mode: "proxy" | "refuse";
  /** When each socket the page asked for while refused was refused. */
  refused: number[];
  say: (payload: object) => void;
}

async function proxied(page: Page): Promise<Socket> {
  let current: WebSocketRoute | null = null;
  let boarded = false;
  const socket: Socket = {
    mode: "proxy",
    refused: [],
    live: () => boarded && current !== null,
    drop: () => {
      boarded = false;
      current?.close({ code: 4000, reason: "probe drops the socket" });
      current = null;
    },
    say: (payload) =>
      current?.send(
        JSON.stringify({ verb: "frames", machineId: "hub", payload })
      ),
  };
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      if (socket.mode === "refuse") {
        socket.refused.push(Date.now());
        ws.close({ code: 4000, reason: "probe refuses the socket" });
        return;
      }
      current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (String(message).includes('"kind":"instances"')) {
          boarded = true;
        }
        ws.send(message);
      });
      ws.onClose(() => {
        if (current === ws) {
          current = null;
          boarded = false;
        }
      });
    }
  );
  return socket;
}

/** Waits until `ok` reads true, every 100 ms, for `ms`. */
async function until(ok: () => boolean | Promise<boolean>, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await ok()) {
      return true;
    }
    await Bun.sleep(100);
  }
  return false;
}

/** The visible elements whose own words say the hub's connection is away, by where they stand. */
const awaySayers = (page: Page) =>
  page.evaluate((source) => {
    const away = new RegExp(source, "iu");
    const out: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    const holders = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!(el && away.test(node.textContent ?? ""))) {
        continue;
      }
      if (
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        continue;
      }
      // Its surface: the band, or the nearest block that holds it.
      const surface =
        el.closest('[data-slot="hub-band"]') ??
        el.closest("[data-slot], section, aside, header, main") ??
        el;
      if (!holders.has(surface)) {
        holders.add(surface);
        out.push(
          `${surface.getAttribute("data-slot") ?? surface.tagName.toLowerCase()}: “${(el.textContent ?? "").trim().slice(0, 60)}”`
        );
      }
    }
    return out;
  }, AWAY.source);

/** The band's state: open, its tone, and its words. */
const bandNow = (page: Page) =>
  page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector);
    return {
      exists: band !== null,
      open: band?.hasAttribute("data-open") ?? false,
      tone: band?.getAttribute("data-tone") ?? "",
      words: (band?.innerText ?? "").replace(/\s+/gu, " ").trim(),
    };
  }, BAND);

interface Read {
  /** The clock it was read on (kit.ts `readMotion`): the DevTools one, or the page's own. */
  by: "clock" | "held";
  /** Each transition's property, length (ms), easing and start. */
  runs: {
    duration: number;
    easing: string;
    prop: string;
    start: number | null;
  }[];
  /** The band at each fraction of its clock (none when read by events). */
  samples: {
    bottom: number;
    clipTop: number;
    f: number;
    opacity: number;
    /** The top edge of what follows the band: the bar floating over a phone's tabs, else the page (`#main-content`). */
    pageTop: number;
    translate: string;
  }[];
  tokens: { duration: number; easing: string };
}

/** The slot the band stands in, whose row opens and shuts with it. */
const BAND_SLOT = '[data-slot="hub-band-slot"]';

/** The band as drawn now: its opacity and slide, its foot, its clip's top, and what follows it. */
function sampleBand(selector: string) {
  const band = document.querySelector<HTMLElement>(selector) as HTMLElement;
  // What stands under the band's foot: the bar, where the band is over it
  // (a bar floating over a phone's tabs), else the page.
  const floating = window.matchMedia("(max-width: 899px)").matches
    ? document.querySelector('header[data-slot="top"][data-floating]')
    : null;
  const next = floating ?? document.querySelector("#main-content");
  const style = getComputedStyle(band);
  return {
    opacity: Number(style.opacity),
    translate: style.translate,
    bottom: band.getBoundingClientRect().bottom,
    clipTop: (band.parentElement as HTMLElement).getBoundingClientRect().top,
    pageTop: next?.getBoundingClientRect().top ?? Number.NaN,
  };
}

/**
 * The band's transitions as `start` begins them (its own opacity and
 * slide, and its row's opening or shutting in the slot), read as the kit
 * reads motion (kit.ts `readMotion`): held and sought through its
 * fractions. With the tokens they should be on.
 */
async function scrubBand(
  page: Page,
  start: () => Promise<void>,
  token: { duration: string; easing: string }
): Promise<Read | null> {
  const motion = await readMotion(page, start, BAND_SLOT, {
    fractions: [0, 0.25, 0.5, 0.75, 1],
    read: () => page.evaluate(sampleBand, BAND),
    ms: 15_000,
  });
  const runs = motion.runs.filter(
    (run) =>
      run.type === "CSSTransition" &&
      ["opacity", "translate", "grid-template-rows"].includes(run.name)
  );
  if (runs.length === 0) {
    return null;
  }
  const tokens = await page.evaluate((names) => {
    const root = getComputedStyle(document.documentElement);
    const said = (v: string) =>
      v.trim().endsWith("ms")
        ? Number.parseFloat(v)
        : Number.parseFloat(v) * 1000;
    return {
      duration: said(root.getPropertyValue(names.duration)),
      easing: root.getPropertyValue(names.easing).trim(),
    };
  }, token);
  return {
    by: motion.by,
    tokens,
    runs: runs.map((run) => ({
      prop: run.name,
      duration: run.end,
      easing: run.easing,
      start: run.start,
    })),
    samples: motion.at.map(({ fraction, value }) => ({
      f: fraction,
      ...value,
    })),
  };
}

/** Holds a read to its tokens: one clock, the tokens' duration and curve, opacity on that curve. */
function checkMotion(
  kit: Kit,
  name: string,
  what: string,
  read: Read | null,
  rising: boolean
) {
  if (!(
    kit.check(
      `${name}: the band's ${what} runs as transitions`,
      read !== null && read.runs.length > 0,
      read
        ? `${read.runs.map((r) => r.prop).join(", ") || "none of opacity, translate"} ran`
        : "nothing ran on the band"
    ) && read
  )) {
    return;
  }
  const clock = read.runs.every(
    (run) =>
      Math.abs(run.duration - read.tokens.duration) < 0.5 &&
      sameCurve(run.easing, read.tokens.easing) &&
      run.start !== null &&
      run.start === read.runs[0]?.start
  );
  kit.check(
    `${name}: the band's ${what} is one clock on its tokens (read by ${read.by})`,
    clock,
    `${read.runs.map((r) => `${r.prop} ${r.duration}ms ${r.easing} @${r.start}`).join("; ")} vs ${read.tokens.duration}ms ${read.tokens.easing}`
  );
  const off = read.samples.map((sample) => {
    const eased = bezierAt(read.tokens.easing, sample.f);
    const want = rising ? eased : 1 - eased;
    return Math.abs(sample.opacity - want);
  });
  kit.check(
    `${name}: the band's ${what}, seeked, follows its curve`,
    Math.max(...off) < 0.02,
    read.samples
      .map(
        (s) =>
          `${s.f}: opacity ${s.opacity.toFixed(3)}, translate ${s.translate}`
      )
      .join("; ")
  );
  const apart = read.samples.map((s) => Math.abs(s.bottom - s.pageTop));
  kit.check(
    `${name}: the band's ${what}, seeked, moves the page with its foot (one edge at every fraction)`,
    read.runs.some((run) => run.prop === "grid-template-rows") &&
      Math.max(...apart) <= 0.5,
    read.samples
      .map(
        (s) =>
          `${s.f}: foot ${s.bottom.toFixed(1)}, page top ${s.pageTop.toFixed(1)}`
      )
      .join("; ")
  );
}

/** The band's slide starts hidden under the top bar: read at its clock's 0. */
function startsHidden(kit: Kit, name: string, entered: Read | null) {
  const first = entered?.samples[0];
  kit.check(
    `${name}: the band's slide starts hidden under the top bar`,
    first !== undefined && first.bottom <= first.clipTop + 0.5,
    first
      ? `band bottom ${first.bottom} at 0, clip top ${first.clipTop}`
      : "no sample"
  );
}

/**
 * The open band's box, and every drawn line of the page's own text it
 * covers (text in `#main-content` whose line box meets the band's).
 */
const bandCover = (page: Page) =>
  page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector);
    const main = document.querySelector("#main-content");
    if (!(band && main)) {
      return null;
    }
    const b = band.getBoundingClientRect();
    /**
     * The band of the screen an element's lines are drawn in: every box
     * that clips it, up to and with the page's own scroller, intersected.
     */
    const clipOf = (el: Element): { bottom: number; top: number } => {
      const clip = {
        top: Number.NEGATIVE_INFINITY,
        bottom: Number.POSITIVE_INFINITY,
      };
      for (let up = el.parentElement; up; up = up.parentElement) {
        if (getComputedStyle(up).overflowY !== "visible") {
          const r = up.getBoundingClientRect();
          clip.top = Math.max(clip.top, r.top);
          clip.bottom = Math.min(clip.bottom, r.bottom);
        }
        if (up === main) {
          break;
        }
      }
      return clip;
    };
    /** The part of a line drawn (inside what clips it) meets the band. */
    const under = (line: DOMRect, clip: { bottom: number; top: number }) => {
      const top = Math.max(line.top, clip.top);
      const bottom = Math.min(line.bottom, clip.bottom);
      return (
        line.width > 0 &&
        bottom > top &&
        bottom > b.top + 0.5 &&
        top < b.bottom - 0.5 &&
        line.right > b.left &&
        line.left < b.right
      );
    };
    const covered: string[] = [];
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const el = node.parentElement;
      if (!(
        text &&
        el?.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      )) {
        continue;
      }
      const clip = clipOf(el);
      const range = document.createRange();
      range.selectNodeContents(node);
      const line = [...range.getClientRects()].find((one) => under(one, clip));
      if (line) {
        covered.push(`“${text.slice(0, 40)}” at ${line.top.toFixed(1)}`);
      }
    }
    // The band's fold: the row of the page it opens, the band and the air
    // over it (DESIGN.md, Alert: "a compact tinted row, never a slab").
    const fold = band
      .closest('[data-slot="hub-band-slot"]')
      ?.getBoundingClientRect();
    return {
      top: b.top,
      bottom: b.bottom,
      height: b.height,
      fold: fold ? { top: fold.top, height: fold.height } : null,
      covered,
    };
  }, BAND);

/** The band's line boxes: each drawn line's width, for its wrap. */
const bandLines = (page: Page) =>
  page.evaluate((selector) => {
    const words = document.querySelector(`${selector} [data-slot="sentence"]`);
    if (!words) {
      return [];
    }
    // The text's own line boxes: a range over the paragraph would also
    // give the block MorphText stands its words in.
    const boxes: DOMRect[] = [];
    const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      boxes.push(...range.getClientRects());
    }
    // A line is the boxes standing across one band of height: a box whose
    // middle falls inside a line's top and bottom is on it. Boxes of one line
    // need not share a top (WebKit stands MorphText's words a fraction of a
    // pixel apart), so a top rounded to the pixel would split one line in two.
    const rows: { bottom: number; left: number; right: number; top: number }[] =
      [];
    for (const box of [...boxes].sort((a, b) => a.top - b.top)) {
      if (box.width === 0) {
        continue;
      }
      const middle = box.top + box.height / 2;
      const row = rows.find((one) => middle >= one.top && middle <= one.bottom);
      if (row) {
        row.left = Math.min(row.left, box.left);
        row.right = Math.max(row.right, box.right);
      } else {
        rows.push({
          top: box.top,
          bottom: box.bottom,
          left: box.left,
          right: box.right,
        });
      }
    }
    return rows.map((row) => row.right - row.left);
  }, BAND);

/** The top bar's foot: its own bottom edge's paint, read off its style. */
const barFoot = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('header[data-slot="top"]');
    if (!bar) {
      return "no bar";
    }
    const style = getComputedStyle(bar);
    return `${style.borderBottomWidth} ${style.borderBottomStyle} ${style.borderBottomColor}`;
  });

/** Jump's card against the viewport, and where its one line of words stands. */
const cardPlace = (page: Page) =>
  page.evaluate((card) => {
    const frame = document.querySelector<HTMLElement>(card);
    const field = frame?.querySelector<HTMLElement>(
      '[data-slot="finder-field"]'
    );
    const line = frame?.querySelector<HTMLElement>(
      '[data-slot="nothing-line"], [data-slot="find-fault"]'
    );
    if (!(frame && field)) {
      return null;
    }
    const f = frame.getBoundingClientRect();
    const i = field.getBoundingClientRect();
    const l = line?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    // Its drawn edge (`::after`) and corners where it meets the screen's
    // edge, and anything inside drawn past that edge.
    const edge = getComputedStyle(frame, "::after");
    const own = getComputedStyle(frame);
    const past = [...frame.querySelectorAll<HTMLElement>("*")]
      .filter(
        (el) =>
          el.getBoundingClientRect().right > vw + 0.5 &&
          el.checkVisibility({
            opacityProperty: true,
            visibilityProperty: true,
          })
      )
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} → ${el.getBoundingClientRect().right.toFixed(1)}`
      )
      .slice(0, 4);
    return {
      card: [f.left, f.right],
      vw,
      flush: Math.abs(f.right - vw) <= 0.5,
      edgeEnd: edge.borderInlineEndWidth,
      corners: [own.borderStartEndRadius, own.borderEndEndRadius],
      past,
      line: l
        ? {
            words: (line?.innerText ?? "").slice(0, 60),
            inset: l.left - f.left,
            // From the field's edge that faces the list: its foot on a desk,
            // its top where the field stands at the card's foot.
            fromField: i.top >= l.bottom ? i.top - l.bottom : l.top - i.bottom,
          }
        : null,
    };
  }, CARD);

/** The sweep (journeys/scan.ts): nothing spills, no control covers text. */
async function sweep(kit: Kit, page: Page, name: string, state: string) {
  const found = await page.evaluate(scan);
  kit.check(
    `${name}, ${state}: nothing spills or overlaps`,
    found.length === 0,
    found.join(" | ")
  );
  return found.length;
}

/** Opens Jump the way a person does by pointer: its button, or the sheet's search. */
async function openJump(page: Page, view: View) {
  if (view === "desk") {
    await page.click('button[aria-label="Jump to session"]');
  } else {
    await page.click('[data-slot="burger"]');
    await page.click('[data-rail-sheet] [data-slot="search"]');
  }
  await page.waitForSelector(`${CARD} [data-slot="finder-field"] input`);
  await settle(page);
}

/**
 * A project's board read through a tunnel's HTML 502: one sentence, said
 * once, with one Retry; the bar's foot its own divider. The sweep's count.
 */
async function boardRead(kit: Kit, page: Page, name: string, project: string) {
  // A project the hub keeps (the rail lists it), whose own reads come back
  // through the tunnel as its HTML 502.
  await page.route(
    (url) => url.pathname.startsWith(`/api/projects/${project}/`),
    (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: PROXY_502 })
  );
  await page.evaluate((id) => {
    const link = document.createElement("a");
    link.href = `/project/${id}`;
    document.body.append(link);
    link.click();
    link.remove();
  }, project);
  await page.waitForURL(`**/project/${project}`, { timeout: 20_000 });
  await page.waitForTimeout(1000);
  await settle(page, 200);
  const board = await page.evaluate(
    () => document.querySelector<HTMLElement>("#main-content")?.innerText ?? ""
  );
  kit.check(
    `${name}: a board read answered by an HTML 502 says one sentence, no markup`,
    !board.includes("<") &&
      board.includes("The hub didn't answer (502).") &&
      !PROXY_WORDS.test(board),
    board.replace(/\s+/gu, " ").slice(0, 240)
  );
  // One failing read of the project is said once, with one Retry.
  const said502 = await page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const out: string[] = [];
    const holders = new Set<Element>();
    const walker = main
      ? document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
      : null;
    for (let node = walker?.nextNode(); node; node = walker?.nextNode()) {
      const el = node.parentElement;
      const block = el?.closest("[role], [data-slot], p, div");
      if (
        !(el && block && (node.textContent ?? "").includes("(502)")) ||
        holders.has(block) ||
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ) {
        continue;
      }
      holders.add(block);
      out.push((block.textContent ?? "").replace(/\s+/gu, " ").trim());
    }
    return { out };
  });
  // By the name a reader hears: a kit button's pending words are in its
  // markup, unread at rest.
  const retries = await page
    .locator("#main-content")
    .getByRole("button", { name: RETRY })
    .filter({ visible: true })
    .count();
  kit.check(
    `${name}: a failed read of the project is said once, with one Retry`,
    said502.out.length === 1 && retries === 1,
    JSON.stringify({ ...said502, retries })
  );
  kit.check(
    `${name}: the board's sentence joins its reason as a sentence, not "read: The"`,
    !COLON_JOIN.test(board),
    board.replace(/\s+/gu, " ").slice(0, 240)
  );
  // The hairline under the bar here is the bar's own, drawn whatever the hub
  // does, not a hub state's: `border-hairline`, the rule between regions
  // (DESIGN.md, "Borders are graded. `border-hairline` separates rows and
  // regions."; the shell's "44px top bar with a 1px hairline at every
  // width").
  const seam = await page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>('header[data-slot="top"]');
    if (!bar) {
      return null;
    }
    const probe = document.createElement("i");
    probe.style.borderBottom = "1px solid var(--border-hairline)";
    bar.append(probe);
    const want = getComputedStyle(probe).borderBottomColor;
    probe.remove();
    return { foot: getComputedStyle(bar).borderBottomColor, hairline: want };
  });
  kit.check(
    `${name}, board 502: the hairline under the bar is its --border-hairline`,
    seam !== null && seam.foot === seam.hairline,
    JSON.stringify(seam)
  );
  // Caw's own read was refused with the rest. He is drawn from the project's
  // row the dashboard keeps (CawLead `project`, 29f534dd4), so a seat that
  // stands holds him; no seat stands empty, and the name starts the head
  // (his seat is at the head's end, by Ask Caw).
  const head = await page.evaluate(() => {
    const who = document
      .querySelector('[data-slot="project-head"] [data-slot="who"]')
      ?.getBoundingClientRect();
    const title = document
      .querySelector('[data-slot="project-head"] [data-slot="name"]')
      ?.getBoundingClientRect();
    const seats = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="project-head"] [data-slot="seat"]'
      ),
    ];
    return {
      seats: seats.length,
      empty: seats.filter(
        (seat) =>
          seat.querySelector('[data-slot="caw-seat"] > *') === null ||
          seat.getBoundingClientRect().width < 1
      ).length,
      who: who?.left ?? null,
      name: title?.left ?? null,
    };
  });
  kit.check(
    `${name}, board 502: Caw unread, the name starts the head (no empty seat)`,
    head.empty === 0 &&
      head.who !== null &&
      head.name !== null &&
      head.name - head.who <= 4.5,
    JSON.stringify(head)
  );
  if (name.startsWith("desk")) {
    const listed = await page
      .locator('aside[data-slot="rail"]')
      .getByText("Probe", { exact: true })
      .filter({ visible: true })
      .count();
    kit.check(
      `${name}, board 502: the rail lists the open project`,
      listed > 0,
      `${listed} in the rail`
    );
  }
  return await sweep(kit, page, name, "board 502");
}

interface CardFrame {
  at: number;
  h: number;
  held: number;
  tweening: boolean;
}

/** Records Jump's card height every frame from now, and when the field is next typed in. */
const recordCard = (page: Page) =>
  page.evaluate((card) => {
    const w = window as unknown as {
      probeFrames: CardFrame[];
      probeTyped: number;
      probeStop: boolean;
    };
    w.probeFrames = [];
    w.probeTyped = 0;
    w.probeStop = false;
    document
      .querySelector(`${card} [data-slot="finder-field"] input`)
      ?.addEventListener(
        "input",
        (event) => {
          // When the event was made, on the frames' own timeline: a busy
          // frame runs its listeners well after its own timestamp.
          w.probeTyped = event.timeStamp;
        },
        { once: true }
      );
    const tick = () => {
      const frame = document.querySelector<HTMLElement>(card);
      if (frame) {
        w.probeFrames.push({
          // When the frame ran: its rAF stamp is the frame's begin time,
          // which lags on a throttled frame.
          at: performance.now(),
          h: frame.getBoundingClientRect().height,
          held: frame.querySelectorAll('[data-slot="skeleton-slot"]').length,
          tweening: frame
            .getAnimations()
            .some((each) =>
              (each.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some((k) => "height" in k)
            ),
        });
      }
      if (!w.probeStop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, CARD);

/** The frames recorded since the field was typed in. */
const recordedCard = async (page: Page) => {
  const run = await page.evaluate(() => {
    const w = window as unknown as {
      probeFrames: CardFrame[];
      probeTyped: number;
      probeStop: boolean;
    };
    w.probeStop = true;
    return { frames: w.probeFrames, typed: w.probeTyped };
  });
  return run.frames.filter((f) => f.at >= run.typed);
};

/** Placeholders from the first frame, then the answer, and the card's height never stepping between. */
function cardMotion(kit: Kit, name: string, what: string, after: CardFrame[]) {
  const firstHeld = after.findIndex((f) => f.held > 0);
  kit.check(
    `${name}, ${what}: placeholder rows within one frame of the query`,
    firstHeld >= 0 && firstHeld <= 1,
    `frame ${firstHeld} of ${after.length} after the input`
  );
  const lastHeld = after.findLastIndex((f) => f.held > 0);
  kit.check(
    `${name}, ${what}: the answer replaces the placeholders`,
    lastHeld >= 0 &&
      lastHeld < after.length - 1 &&
      (after.at(-1)?.held ?? 1) === 0,
    `placeholders from frame ${firstHeld} to ${lastHeld} of ${after.length}`
  );
  const steps = after
    .slice(1)
    .map((f, i) => ({
      d: f.h - (after[i]?.h ?? f.h),
      tweening: f.tweening || (after[i]?.tweening ?? false),
    }))
    .filter((step) => Math.abs(step.d) > 2 && !step.tweening);
  const heights = after.map((f) => f.h);
  kit.check(
    `${name}, ${what}: the card's height animates, never steps`,
    steps.length === 0,
    `${steps.length} step(s): ${steps
      .slice(0, 4)
      .map((step) => step.d.toFixed(1))
      .join(
        ", "
      )}px; heights ${after[0]?.h.toFixed(0)} → max ${Math.max(...heights).toFixed(0)} → ${after.at(-1)?.h.toFixed(0)} over ${after.length} frames`
  );
}

/**
 * Jump's search held 800 ms, then answered by a tunnel's HTML 502: the
 * placeholders, the card's height, its place in the viewport and its one
 * line's. The sweep's count.
 */
async function search(kit: Kit, page: Page, name: string, view: View) {
  let found = 0;
  // ---- (c) a search held 800 ms ----
  await openJump(page, view);
  await page.route(
    (url) => url.pathname === "/api/find",
    async (route) => {
      await Bun.sleep(800);
      await route.continue();
    }
  );
  await recordCard(page);
  // Words nothing here holds (the hub keeps a project named Probe), so the
  // answer is the one line "No sessions for …".
  await page.fill(`${CARD} [data-slot="finder-field"] input`, "lantern");
  // The answer is held 800 ms: the placeholder rows are read inside it.
  await page.waitForTimeout(250);
  const loading = await cardPlace(page);
  // With no machine to ask, the hub alone searches: never "0 machines".
  const searching = await page.evaluate(
    (card) =>
      document.querySelector<HTMLElement>(`${card} [data-slot="searching"]`)
        ?.innerText ?? "",
    CARD
  );
  kit.check(
    `${name}, search loading: it says what is searched, never "0 machines"`,
    searching.trim() === "Searching the hub…",
    JSON.stringify(searching)
  );
  await page.waitForTimeout(1350);
  cardMotion(kit, name, "search held", await recordedCard(page));
  await settle(page, 200);
  const answered = await cardPlace(page);
  const inside = (state: string, at: typeof answered) =>
    kit.check(
      `${name}, ${state}: Jump's card stands inside the viewport`,
      at !== null &&
        (at.card[0] ?? -1) >= -0.5 &&
        (at.card[1] ?? Number.POSITIVE_INFINITY) <= at.vw + 0.5 &&
        at.past.length === 0 &&
        // Flush with the screen's edge, it draws no edge and no round there.
        (!at.flush ||
          (at.edgeEnd === "0px" &&
            at.corners.every((r) => Number.parseFloat(r) === 0))),
      JSON.stringify(at)
    );
  inside("search loading", loading);
  inside("search answered", answered);
  found += await sweep(kit, page, name, "search answered");
  await page.unroute((url) => url.pathname === "/api/find");

  // ---- (d) the answers a tunnel draws ----
  await page.route(
    (url) => url.pathname === "/api/find",
    async (route) => {
      await Bun.sleep(800);
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: PROXY_502,
      });
    }
  );
  await recordCard(page);
  await page.fill(`${CARD} [data-slot="finder-field"] input`, "lantern again");
  await page.waitForTimeout(1600);
  cardMotion(kit, name, "search refused", await recordedCard(page));
  await settle(page, 200);
  const searched = await page.evaluate(
    (card) => document.querySelector<HTMLElement>(card)?.innerText ?? "",
    CARD
  );
  kit.check(
    `${name}: a search answered by an HTML 502 says one sentence, no markup`,
    !searched.includes("<") &&
      searched.includes("The hub didn't answer (502).") &&
      !PROXY_WORDS.test(searched),
    searched.replace(/\s+/gu, " ").slice(0, 200)
  );
  const faulted = await cardPlace(page);
  inside("search 502", faulted);
  kit.check(
    `${name}: the search's one line stands in one place, answered or refused`,
    answered?.line !== null &&
      faulted?.line !== null &&
      answered?.line !== undefined &&
      faulted?.line !== undefined &&
      Math.abs(answered.line.inset - faulted.line.inset) <= 0.5 &&
      Math.abs(answered.line.fromField - faulted.line.fromField) <= 0.5,
    JSON.stringify({ answered: answered?.line, refused: faulted?.line })
  );
  found += await sweep(kit, page, name, "search 502");
  await page.unroute((url) => url.pathname === "/api/find");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(page, 200);

  return found;
}

/**
 * Where the open band stands: its fold under the bar at every width, the bar
 * staying where it is (HubBand: "Under the drawer's line, where the bar is
 * the phone's one row, the band stands under the bar as it does on a desk";
 * d71708ddd: the band "never pushes a phone's bar down"), the band its air
 * (its block-start margin) inside the fold, as the house alert stands on the
 * page's insets.
 */
async function bandPlace(kit: Kit, page: Page, name: string) {
  const at = await page.evaluate((selector) => {
    const el = document.querySelector<HTMLElement>(selector);
    const band = el?.getBoundingClientRect();
    const fold = el
      ?.closest('[data-slot="hub-band-slot"]')
      ?.getBoundingClientRect();
    const bar = document
      .querySelector('header[data-slot="top"]')
      ?.getBoundingClientRect();
    return el && band && fold && bar
      ? {
          band: [band.top, band.bottom],
          fold: [fold.top, fold.bottom],
          bar: [bar.top, bar.bottom],
          air: Number.parseFloat(getComputedStyle(el).marginBlockStart),
        }
      : null;
  }, BAND);
  kit.check(
    `${name}: the band stands under the bar`,
    at !== null &&
      at.bar[0] === 0 &&
      Math.abs((at.fold[0] ?? -1) - (at.bar[1] ?? 0)) <= 0.5 &&
      Math.abs((at.band[0] ?? -1) - (at.fold[0] ?? 0) - at.air) <= 0.5 &&
      Math.abs((at.band[1] ?? -1) - (at.fold[1] ?? 0)) <= 0.5,
    JSON.stringify(at)
  );
}

/** The countdown ticking (a morph every second) never folds the band's lines: its height holds on every frame. */
async function countdownSteady(kit: Kit, page: Page, name: string) {
  const seen = await page.evaluate(
    (selector) =>
      new Promise<{ band: number[]; words: number[]; drawn: number }>(
        (done) => {
          const band = document.querySelector<HTMLElement>(selector);
          const words = band?.querySelector<HTMLElement>(
            '[data-slot="sentence"]'
          );
          const heights = { band: new Set<number>(), words: new Set<number>() };
          let drawn = 0;
          const end = performance.now() + 2600;
          const tick = (at: number) => {
            drawn += 1;
            heights.band.add(
              Math.round((band?.getBoundingClientRect().height ?? 0) * 10) / 10
            );
            heights.words.add(
              Math.round((words?.getBoundingClientRect().height ?? 0) * 10) / 10
            );
            if (at < end) {
              requestAnimationFrame(tick);
            } else {
              done({
                band: [...heights.band],
                words: [...heights.words],
                drawn,
              });
            }
          };
          requestAnimationFrame(tick);
        }
      ),
    BAND
  );
  kit.check(
    `${name}, hub away: the countdown ticks without moving the band's lines`,
    seen.band.length === 1 && seen.words.length === 1,
    JSON.stringify(seen)
  );
}

/** The build's name on one line, wherever the sentence wraps. */
async function versionWhole(kit: Kit, page: Page, name: string) {
  const rows = await page.evaluate((selector) => {
    const words = document.querySelector(`${selector} [data-slot="sentence"]`);
    if (!words) {
      return null;
    }
    const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      const at = text.indexOf("9.9.9");
      const end = text.indexOf("probe", at);
      if (at >= 0 && end > at) {
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, end + 5);
        return new Set(
          [...range.getClientRects()]
            .filter((r) => r.width > 0)
            .map((r) => Math.round(r.top))
        ).size;
      }
    }
    return 0;
  }, BAND);
  kit.check(
    `${name}, updating: the build's name stands on one line`,
    rows === 1,
    `${rows} line(s)`
  );
}

async function runLeg(
  kit: Kit,
  { base, hub, project }: { base: string; hub: string; project: string },
  view: View,
  theme: "light" | "dark",
  findings: { count: number }
) {
  const name = `${view} ${theme}`;
  const page = await kit.page(view, { theme });
  const socket = await proxied(page);
  await open(page, `${base}/session`, '[data-slot="shell"]', 90_000);
  await until(socket.live, 30_000);
  await settle(page, 400);
  /** The bar's foot at rest: a hub state never draws one of its own. */
  const footRest = await barFoot(page);
  /** The open band's height in each state, at this width. */
  const heights: Partial<Record<"hub away" | "updating", number>> = {};
  /** The band open over the page: it covers none of the page's words. */
  const coversNothing = async (state: "hub away" | "updating") => {
    const cover = await bandCover(page);
    heights[state] = cover?.height ?? Number.NaN;
    kit.check(
      `${name}, ${state}: the band pushes the page down, covering none of its words`,
      cover !== null && cover.covered.length === 0,
      JSON.stringify(cover)
    );
    const foot = await barFoot(page);
    kit.check(
      `${name}, ${state}: the bar's foot is the one it has at rest (no second signal)`,
      foot === footRest,
      `rest ${footRest}; now ${foot}`
    );
  };

  // ---- (a) the socket dropped ----
  const said = page.locator("[data-hub-band-said]");
  const before = await said
    .ariaSnapshot({ timeout: 3000 })
    .catch((e: Error) => e.message);
  kit.check(
    `${name}: the band's live region stands, empty, before it opens`,
    before.trim() === "- status",
    JSON.stringify(before)
  );
  socket.mode = "refuse";
  const entered = await scrubBand(
    page,
    () => {
      socket.drop();
      return Promise.resolve();
    },
    { duration: "--dur-panel", easing: "--ease-drawer" }
  );
  checkMotion(kit, name, "enter", entered, true);
  startsHidden(kit, name, entered);
  await settle(page, 300);
  const down = await bandNow(page);
  kit.check(
    `${name}: the dropped socket opens the band`,
    down.open && UNREACHABLE.test(down.words),
    JSON.stringify(down)
  );
  await coversNothing("hub away");
  await bandPlace(kit, page, name);
  await countdownSteady(kit, page, name);
  const spoken = await said
    .ariaSnapshot({ timeout: 3000 })
    .catch((e: Error) => e.message);
  kit.check(
    `${name}: the live region holds the band's words once it opens`,
    UNREACHABLE.test(spoken) && spoken.includes(down.words.slice(0, 20)),
    JSON.stringify(spoken)
  );
  const clip = await page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector);
    // What clips it: the fold's one item (design.css `fold-item`), the row
    // it stands in.
    const row = band?.parentElement;
    if (!(band && row)) {
      return null;
    }
    const shadow = getComputedStyle(band).boxShadow;
    // Every shadow's reach past the box: offset, blur and spread, each side.
    const reach = { bottom: 0, left: 0, right: 0, top: 0 };
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    for (const one of shadow.split(/,(?![^(]*\))/u)) {
      const [x = 0, y = 0, blur = 0, spread = 0] = (
        one
          .replace(/(rgba?|oklch|oklab|color|lab|lch|hsla?)\([^)]*\)/gu, "")
          .match(/-?\d*\.?\d+px/gu) ?? []
      ).map((v) => Number.parseFloat(v));
      const out = blur + spread;
      reach.right = Math.max(reach.right, x + out);
      reach.left = Math.max(reach.left, -x + out);
      reach.bottom = Math.max(reach.bottom, y + out);
      reach.top = Math.max(reach.top, -y + out);
    }
    const b = band.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    return {
      overflow: getComputedStyle(row).overflow,
      shadow,
      drawn:
        b.left - reach.left >= r.left - 0.5 &&
        b.right + reach.right <= r.right + 0.5 &&
        b.top - reach.top >= r.top - 0.5 &&
        b.bottom + reach.bottom <= r.bottom + 0.5,
      band: [b.left, b.top, b.right, b.bottom],
      row: [r.left, r.top, r.right, r.bottom],
      reach,
    };
  }, BAND);
  kit.check(
    `${name}: the open band is drawn whole inside its fold's clip, any shadow with it`,
    clip !== null && clip.overflow === "hidden" && clip.drawn,
    JSON.stringify(clip)
  );
  const sayers = await awaySayers(page);
  kit.check(
    `${name}: exactly one element says the hub is away`,
    sayers.length === 1 && sayers[0]?.startsWith("hub-band"),
    sayers.join(" | ")
  );
  // What the button holds: its glyph's slot and its label's cell, which
  // holds the label and its pending wording, as wide as the wider (DESIGN.md,
  // Pending: "Beside a rest icon the label and its pending wording stand in
  // one cell as wide as the wider of them").
  const button = await page.evaluate((selector) => {
    const press = document.querySelector<HTMLElement>(
      `${selector} button[data-slot="button"]`
    );
    const words =
      press?.querySelector<HTMLElement>('[data-slot="words"]') ??
      press?.querySelector<HTMLElement>('[data-slot="label-text"]');
    if (!(press && words)) {
      return null;
    }
    const glyph = press.querySelector<HTMLElement>('[data-slot="btn-slot"]');
    const outer = press.getBoundingClientRect();
    const cell = words.getBoundingClientRect();
    const left = Math.min(
      cell.left,
      glyph?.getBoundingClientRect().left ?? cell.left
    );
    const style = getComputedStyle(press);
    return {
      label: words.querySelector<HTMLElement>('[data-active="true"]')
        ?.innerText,
      glyph: glyph !== null,
      off: (left + cell.right) / 2 - (outer.left + outer.width / 2),
      start: left - outer.left,
      end: outer.right - cell.right,
      paddings: [style.paddingInlineStart, style.paddingInlineEnd],
    };
  }, BAND);
  kit.check(
    `${name}: the band's button centres its glyph and label, its paddings even`,
    button !== null &&
      Math.abs(button.off) <= 0.5 &&
      button.paddings[0] === button.paddings[1],
    JSON.stringify(button)
  );
  findings.count += await sweep(kit, page, name, "hub away");

  // Back: the socket let through, the band says so and leaves.
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  const reconnected = await until(
    async () => RECONNECTED.test((await bandNow(page)).words),
    5000
  );
  kit.check(
    `${name}: the hub back, the band says so`,
    reconnected,
    (await bandNow(page)).words
  );
  const left = await scrubBand(page, () => Promise.resolve(), {
    duration: "--dur-exit",
    easing: "--ease-out",
  });
  checkMotion(kit, name, "leave", left, false);
  await settle(page, 300);
  kit.check(
    `${name}: the band has left`,
    !(await bandNow(page)).open,
    JSON.stringify(await bandNow(page))
  );

  // ---- (b) an announced update restart ----
  if (view === "desk" && theme === "light") {
    // The hub's own word: its machine says it is installing.
    const put = (state: object) =>
      fetch(`${hub}/api/binary-updates/machines/scratch-fleet/state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      }).then((r) => r.status);
    const answered = await put(installing("installing"));
    const told = await until(
      async () => UPDATING_PROBE.test((await bandNow(page)).words),
      5000
    );
    kit.check(
      `${name}: the hub's machine installing, the hub tells the page`,
      told,
      `PUT ${answered}; band ${(await bandNow(page)).words}`
    );
    await put(installing("available"));
    const taken = await until(async () => !(await bandNow(page)).open, 5000);
    kit.check(
      `${name}: the install over without a restart, the hub takes it back`,
      taken,
      JSON.stringify(await bandNow(page))
    );
    await settle(page, 300);
  }
  const within = 6000;
  socket.say({
    kind: "hub.restart",
    restart: { reason: "update", version: "9.9.9-probe", withinMs: within },
  });
  const announced = Date.now();
  await until(async () => (await bandNow(page)).open, 3000);
  // Its enter lands first: at a transition's first moment the band is still
  // `visibility: hidden` and draws no words at all.
  await settle(page);
  socket.mode = "refuse";
  const triesFrom = socket.refused.length;
  socket.drop();
  let calm = true;
  const seen: string[] = [];
  while (Date.now() < announced + within - 700) {
    const now = await bandNow(page);
    const away = await awaySayers(page);
    if (
      !(now.open && now.tone === "live" && UPDATING.test(now.words)) ||
      away.length > 0
    ) {
      calm = false;
      seen.push(`${now.tone}: ${now.words} | ${away.join(", ")}`);
    }
    await Bun.sleep(500);
  }
  kit.check(
    `${name}: an announced restart reads as the update until its deadline`,
    calm,
    seen.slice(0, 3).join(" ‖ ") || (await bandNow(page)).words
  );
  // While the update stands the page tries every second (client.svelte.ts
  // `scheduleReconnect`), so it hears the hub back within one: a backoff
  // would have spaced its tries 1, 2, then 4 s apart over the same window.
  const tries = socket.refused.slice(triesFrom);
  const gaps = tries.slice(1).map((at, i) => at - (tries[i] ?? at));
  kit.check(
    `${name}: while updating the page tries the hub every second`,
    tries.length >= 3 && gaps.every((gap) => gap <= 1600),
    `${tries.length} tries, ${gaps.map((gap) => `${(gap / 1000).toFixed(1)}s`).join(", ")} apart`
  );
  await coversNothing("updating");
  await versionWhole(kit, page, name);
  const lines = await bandLines(page);
  kit.check(
    `${name}, updating: the band's words wrap balanced, no line under half the longest`,
    lines.length > 0 && Math.min(...lines) >= Math.max(...lines) / 2,
    `${lines.length} line(s): ${lines.map((w) => w.toFixed(0)).join(", ")}px`
  );
  kit.check(
    `${name}: the band is one height hub away and updating`,
    Math.abs((heights["hub away"] ?? 0) - (heights.updating ?? 1)) <= 0.5,
    JSON.stringify(heights)
  );
  findings.count += await sweep(kit, page, name, "updating");
  const past = await until(
    async () => UNREACHABLE.test((await bandNow(page)).words),
    5000
  );
  kit.check(
    `${name}: past the deadline, the band says the hub is unreachable`,
    past,
    (await bandNow(page)).words
  );
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  await until(async () => !(await bandNow(page)).open, 5000);
  await settle(page, 300);

  findings.count += await search(kit, page, name, view);
  findings.count += await boardRead(kit, page, name, project);
  await frames(page);
  await page.close();
}

/** Jump's list as the kinds it stands in, top to bottom, a placeholder read as the row it holds a place for. */
const listKinds = (page: Page) =>
  page.evaluate((card) => {
    const list = [
      ...document.querySelectorAll<HTMLElement>(`${card} [data-slot="list"]`),
    ].find((el) => el.checkVisibility());
    // What each child is, first match wins: a placeholder is the row it
    // holds a place for.
    const named: [string, string][] = [
      ['[data-slot="skeleton-slot"], [data-find-row]', "row"],
      ['[data-slot="chips"]', "chips"],
      ['[data-slot="head"]', "head"],
      ['[data-slot="rule"]', "rule"],
      ['[data-slot="nothing"]', "nothing"],
    ];
    const kinds: string[] = [];
    for (const child of list?.children ?? []) {
      const kind =
        named.find(
          ([selector]) =>
            child.matches(selector) || child.querySelector(selector) !== null
        )?.[1] ?? child.tagName.toLowerCase();
      if (kinds.at(-1) !== kind) {
        kinds.push(kind);
      }
    }
    return kinds;
  }, CARD);

/**
 * A search with answers, held 800 ms: its placeholders stand in the order
 * its answer then takes, on this form (a phone's from the field up).
 */
async function searchOrder(kit: Kit, page: Page, name: string, view: View) {
  await openJump(page, view);
  await page.route(
    (url) => url.pathname === "/api/find",
    async (route) => {
      await Bun.sleep(800);
      await route.continue();
    }
  );
  // "band" is the conversation's name and in its every message: the
  // answer has both sections, names and where it was said.
  await page.fill(`${CARD} [data-slot="finder-field"] input`, "band");
  // Inside the 800 ms hold, past the 280 ms the doorway's rows take to
  // leave (DESIGN.md, The Nothing Jumps Rule).
  await page.waitForTimeout(550);
  const loading = await listKinds(page);
  await page.waitForTimeout(2000);
  await settle(page, 200);
  const answered = await listKinds(page);
  // Every section that answers stands where its placeholders stood, in
  // their order on this form; a section that answers empty folds away.
  let at = 0;
  for (const kind of answered) {
    at = loading.indexOf(kind, at) + 1;
    if (at === 0) {
      break;
    }
  }
  kit.check(
    `${name}: the search's answer stands where its placeholders stood, in their order`,
    loading.includes("row") && answered.includes("row") && at > 0,
    JSON.stringify({ loading, answered })
  );
  await page.unroute((url) => url.pathname === "/api/find");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(page, 300);
}

/** The shell's boxes at rest: the bar, the band's slot and the page. */
const restBoxes = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r
        ? [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10)
        : null;
    };
    return {
      floating: document.documentElement.dataset.bar ?? "",
      bar: box('header[data-slot="top"]'),
      slot: box('[data-slot="hub-band-slot"]'),
      page: box("#main-content"),
      tabs: box("[data-session-tab]"),
    };
  });

/** With less motion the band's row lands open at once, the page's top at its foot. */
async function lessMotion(kit: Kit, page: Page, name: string, socket: Socket) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  socket.mode = "refuse";
  socket.drop();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.hasAttribute("data-open"),
    BAND,
    { timeout: 10_000, polling: "raf" }
  );
  const landed = await page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector) as HTMLElement;
    const slot = band.closest<HTMLElement>('[data-slot="hub-band-slot"]');
    return {
      rows: (slot?.getAnimations() ?? []).map((run) =>
        run instanceof CSSTransition ? run.transitionProperty : "animation"
      ),
      foot: band.getBoundingClientRect().bottom,
      pageTop:
        document.querySelector("#main-content")?.getBoundingClientRect().top ??
        Number.NaN,
      slotHeight: slot?.getBoundingClientRect().height ?? 0,
    };
  }, BAND);
  kit.check(
    `${name}, less motion: the band's row lands open at once, the page's top at its foot`,
    landed.rows.length === 0 &&
      landed.slotHeight > 0 &&
      Math.abs(landed.foot - landed.pageTop) <= 0.5,
    JSON.stringify(landed)
  );
}

/**
 * A conversation in front, on a phone (the bar floating over its tabs) and
 * on a desk: the shell at rest; the band over the bar and the tabs, moving
 * both down, covering none of them; a scrolled transcript moved down whole,
 * its scroll kept; and with less motion, the band's row landing at once.
 */
async function conversationLeg(
  kit: Kit,
  base: string,
  session: string,
  view: "phone" | "desk"
) {
  const name = `${view} conversation`;
  const page = await kit.page(view, { theme: "light" });
  await page.addInitScript((id) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: { t: "l", id: "pone", tabs: [id], active: id, opened: null },
        focusedLeaf: "pone",
      })
    );
  }, session);
  const socket = await proxied(page);
  await open(page, `${base}/session/${session}`, "[data-session-tab]", 120_000);
  await until(socket.live, 30_000);
  await settle(page, 600);

  const rest = await restBoxes(page);
  await searchOrder(kit, page, name, view);
  kit.note(`${name}: at rest ${JSON.stringify(rest)}`);
  kit.check(
    `${name}: at rest the band's row lays out nothing, and the page starts where it did`,
    rest.slot !== null &&
      rest.slot[3] === 0 &&
      rest.bar !== null &&
      rest.page !== null &&
      (view === "phone"
        ? rest.floating.includes("floating") && rest.page[1] === rest.bar[1]
        : rest.page[1] === (rest.bar[1] ?? 0) + (rest.bar[3] ?? 0)),
    JSON.stringify(rest)
  );

  // A transcript scrolled to its middle, and the row standing at its top.
  const scrolled = () =>
    page.evaluate(() => {
      const main = document.querySelector("#main-content");
      const scroller = [
        ...(main?.querySelectorAll<HTMLElement>("*") ?? []),
      ].find(
        (el) =>
          el.scrollHeight - el.clientHeight > 120 &&
          ["auto", "scroll"].includes(getComputedStyle(el).overflowY)
      );
      if (!scroller) {
        return null;
      }
      const s = scroller.getBoundingClientRect();
      // The row at the scroller's top, marked the first time, so the same
      // row is read again after the band opens, wherever it then stands.
      const row =
        document.querySelector("[data-probe-row]") ??
        document.elementFromPoint(s.left + s.width / 2, s.top + 40);
      row?.setAttribute("data-probe-row", "");
      return {
        scrollTop: scroller.scrollTop,
        room: scroller.scrollHeight - scroller.clientHeight,
        rowTop: row?.getBoundingClientRect().top ?? Number.NaN,
        row: row
          ? `${row.tagName.toLowerCase()}.${String(row.className).split(" ")[0]}`
          : "",
      };
    });
  await until(async () => (await scrolled()) !== null, 30_000);
  await page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const scroller = [...(main?.querySelectorAll<HTMLElement>("*") ?? [])].find(
      (el) =>
        el.scrollHeight - el.clientHeight > 120 &&
        ["auto", "scroll"].includes(getComputedStyle(el).overflowY)
    );
    if (scroller) {
      // The reader's own scroll: a wheel's input first (the transcript takes
      // a scroll for the reader's only after their input).
      scroller.dispatchEvent(new WheelEvent("wheel"));
      scroller.scrollTop = (scroller.scrollHeight - scroller.clientHeight) / 2;
    }
  });
  await settle(page, 400);
  await page.evaluate(() => {
    for (const marked of document.querySelectorAll("[data-probe-row]")) {
      marked.removeAttribute("data-probe-row");
    }
  });
  const before = await scrolled();

  socket.mode = "refuse";
  socket.drop();
  await until(async () => (await bandNow(page)).open, 10_000);
  await settle(page, 600);
  const cover = await bandCover(page);
  const fold = cover?.fold ?? null;
  const bar = await page.evaluate(() =>
    document
      .querySelector('header[data-slot="top"]')
      ?.getBoundingClientRect()
      .toJSON()
  );
  kit.check(
    `${name}: the band covers none of the page's words`,
    cover !== null && cover.covered.length === 0,
    JSON.stringify(cover)
  );
  kit.check(
    view === "phone"
      ? `${name}: the band stands over the floating bar and its tabs, moving both down`
      : `${name}: the band stands under the bar`,
    // Its fold (the band and the air over it) at the screen's top over the
    // floating bar, or at the bar's foot on a desk; the band's foot is the
    // fold's.
    cover !== null &&
      fold !== null &&
      bar !== undefined &&
      Math.abs(cover.bottom - (fold.top + fold.height)) <= 0.5 &&
      (view === "phone"
        ? Math.abs(bar.top - cover.bottom) <= 0.5 && fold.top === 0
        : Math.abs(fold.top - bar.bottom) <= 0.5),
    JSON.stringify({
      band: cover && [cover.top, cover.bottom],
      fold,
      bar,
    })
  );
  const after = await scrolled();
  kit.check(
    `${name}: a scrolled transcript moves down whole by the band's fold, its scroll kept`,
    before !== null &&
      after !== null &&
      cover !== null &&
      fold !== null &&
      Math.abs(after.scrollTop - before.scrollTop) <= 1 &&
      Math.abs(after.rowTop - before.rowTop - fold.height) <= 1,
    JSON.stringify({ before, after, fold: fold?.height })
  );
  // Back, then the same with less motion: the row lands at once.
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  await until(async () => !(await bandNow(page)).open, 10_000);
  await settle(page, 600);
  if (view === "desk") {
    await lessMotion(kit, page, name, socket);
  }
  await page.close();
}

/** One change of the band's `data-open`, or of the page's top, at the page's clock (ms). */
interface Change {
  at: number;
  value: boolean | number;
}

/**
 * Installed before the page's own scripts: every change of the band's
 * `data-open` as a MutationObserver hears it, and every frame the page's
 * top (`#main-content`) stands somewhere new, from the first frame on.
 * Each opening's own runs (the band's slot and all in it, made by the
 * write that opens it: `getAnimations()` in the observer's microtask makes
 * them) are kept, and the frame they have all ended in is `probeEnded`: the
 * page's top drawn in that frame is the opening's last.
 */
function recordBand() {
  const w = window as unknown as {
    probeBand: Change[];
    probeEnded: Change[];
    probeTop: Change[];
  };
  w.probeBand = [];
  w.probeEnded = [];
  w.probeTop = [];
  let shown: boolean | null = null;
  /** The runs of an opening that have all ended, not yet drawn: their count. */
  let ended: number | null = null;
  const heard = () => {
    const band = document.querySelector('[data-slot="hub-band"]');
    if (!band) {
      return;
    }
    const now = band.hasAttribute("data-open");
    if (now !== shown) {
      shown = now;
      w.probeBand.push({ at: Math.round(performance.now()), value: now });
      if (now) {
        const runs = (
          band.closest('[data-slot="hub-band-slot"]') ?? band
        ).getAnimations({ subtree: true });
        Promise.all(runs.map((run) => run.finished.catch(() => undefined)))
          .then(() => {
            ended = runs.length;
          })
          .catch(() => undefined);
      }
    }
  };
  new MutationObserver(heard).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-open"],
  });
  let top: number | null = null;
  const frame = () => {
    const main = document.querySelector("#main-content");
    if (main) {
      const now = Math.round(main.getBoundingClientRect().top * 10) / 10;
      if (now !== top) {
        top = now;
        w.probeTop.push({ at: Math.round(performance.now()), value: now });
      }
    }
    if (ended !== null) {
      w.probeEnded.push({ at: Math.round(performance.now()), value: ended });
      ended = null;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** What the recorder has heard since it last read, and the page's clock now. */
const recorded = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as {
      probeBand: Change[];
      probeEnded: Change[];
      probeTop: Change[];
    };
    const out = {
      band: w.probeBand,
      ended: w.probeEnded,
      top: w.probeTop,
      now: Math.round(performance.now()),
    };
    w.probeBand = [];
    w.probeEnded = [];
    w.probeTop = [];
    return out;
  });

/** A change list as one line: `+1234 open`, `+1300 112.5`. */
const listed = (changes: Change[]) =>
  changes
    .map((c) => {
      if (typeof c.value === "number") {
        return `+${c.at} ${c.value}`;
      }
      return `+${c.at} ${c.value ? "open" : "shut"}`;
    })
    .join(", ") || "none";

/**
 * A tab that has never had the hub, the hub refusing it from the first
 * socket: the band opens once and holds through 20 s of tries, the page's
 * top moving once, with it; the hub answering, the band closes once. Then
 * the same tab, connected, losing the hub: the band as it was before.
 */
async function neverConnected(kit: Kit, base: string) {
  const name = "desk never connected";
  const page = await kit.page("desk", { theme: "light", init: [recordBand] });
  const socket = await proxied(page);
  socket.mode = "refuse";
  const loaded = Date.now();
  await open(page, `${base}/session`, '[data-slot="shell"]', 90_000);
  await Bun.sleep(Math.max(0, loaded + 20_000 - Date.now()));
  const away = await recorded(page);
  kit.note(`${name}: ${socket.refused.length} tries refused in 20 s`);
  kit.note(`${name}: data-open over 20 s: ${listed(away.band)}`);
  kit.note(`${name}: #main-content top over 20 s: ${listed(away.top)}`);
  const opened = away.band.filter((c) => c.value === true);
  const openAt = opened[0]?.at ?? Number.NaN;
  kit.check(
    `${name}: through 20 s of refused tries the band opens once and never shuts`,
    socket.refused.length >= 3 &&
      opened.length === 1 &&
      !away.band.some((c) => c.value === false && c.at > openAt),
    `${socket.refused.length} tries; ${listed(away.band)}`
  );
  // The first frame places the page; every move after it is the band's,
  // one way, from its opening to the frame its runs have all ended in: by
  // the opening's own end, not by gaps between frames (a loaded WebKit
  // draws none for 100 ms and more, mid-run).
  const run = away.top.slice(1);
  const endedAt = away.ended[0]?.at ?? Number.NaN;
  kit.check(
    `${name}: the page's top moves once, as the band opens, and not again`,
    away.ended.length === 1 &&
      Number(away.ended[0]?.value) > 0 &&
      run.length > 0 &&
      (run[0]?.at ?? 0) >= openAt - 50 &&
      (run.at(-1)?.at ?? Number.POSITIVE_INFINITY) <= endedAt &&
      run.every((c, i) => i === 0 || c.value >= (run[i - 1]?.value ?? 0)),
    `opened +${openAt}, its ${away.ended[0]?.value ?? 0} run(s) ended in the frame at +${endedAt}; the top: ${listed(run)}`
  );

  // The hub answers: the next try reaches it, and the band leaves once.
  socket.mode = "proxy";
  const reached = await until(socket.live, 45_000);
  await until(async () => !(await bandNow(page)).open, 15_000);
  await settle(page, 1000);
  const back = await recorded(page);
  kit.note(`${name}: data-open as the hub answers: ${listed(back.band)}`);
  kit.check(
    `${name}: the hub answering, the band closes once`,
    reached &&
      back.band.length === 1 &&
      back.band[0]?.value === false &&
      !(await bandNow(page)).open,
    `${reached ? "reached" : "never reached"}; ${listed(back.band)}`
  );

  // Connected now: the hub lost, the band as it was before this change.
  socket.mode = "refuse";
  const dropped = socket.refused.length;
  socket.drop();
  await Bun.sleep(20_000);
  const lost = await recorded(page);
  kit.note(`${name}, then lost: data-open over 20 s: ${listed(lost.band)}`);
  kit.check(
    `${name}, then lost: the band opens once and holds through 20 s of tries`,
    socket.refused.length - dropped >= 3 &&
      lost.band.length === 1 &&
      lost.band[0]?.value === true,
    `${socket.refused.length - dropped} tries; ${listed(lost.band)}`
  );
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  await until(async () => !(await bandNow(page)).open, 15_000);
  await settle(page, 1000);
  const again = await recorded(page);
  kit.note(
    `${name}, then lost: data-open as the hub answers: ${listed(again.band)}`
  );
  kit.check(
    `${name}, then lost: the hub answering, the band closes once`,
    again.band.length === 1 && again.band[0]?.value === false,
    listed(again.band)
  );
  await page.close();
}

const spec: Spec = {
  group: "The hub and machines",
  name: "hub-states",
  run: async (kit) => {
    // A turn's answer a few lines long, so a conversation of a few turns
    // scrolls on a phone and a desk.
    const fleet = await kit.fleet(() => ({
      everyMs: 0,
      words: Array.from({ length: 90 }, (_, i) => (i % 9 === 8 ? "ok." : "ok")),
    }));
    fleet.launch("hub");
    await fleet.hubUp();
    const base = await fleet.dashboard();
    // The project whose board reads come back as a tunnel's 502: one the hub
    // keeps, so the rail lists it as it would.
    const probe = await fleet.api<{ id: string }>("/api/projects", {
      name: "Probe",
    });
    const findings = { count: 0 };
    await neverConnected(kit, base);
    for (const view of ["phone", "narrowDesk", "desk"] as const) {
      for (const theme of ["light", "dark"] as const) {
        await runLeg(
          kit,
          { base, hub: fleet.base, project: probe.id },
          view,
          theme,
          findings
        );
      }
    }
    // A machine with a conversation, for the bar that floats over its tabs.
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const session = await fleet.spawn("claude", "Band");
    for (const turn of ["one", "two", "three", "four", "five", "six"]) {
      await fleet.send(session, `band turn ${turn}`);
      await Bun.sleep(1500);
    }
    for (const view of ["phone", "desk"] as const) {
      await conversationLeg(kit, base, session, view);
    }
    kit.check(
      "the overflow and overlap sweep over every state totals zero",
      findings.count === 0,
      `${findings.count} finding(s)`
    );
  },
};
export default spec;
