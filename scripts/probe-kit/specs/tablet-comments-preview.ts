/**
 * The tablet comments preview (design-previews/tablet-comments/), served as
 * a folder and read from the engine on Chromium and WebKit, under a finger,
 * at 744 (iPad mini), 820 (iPad Air) and 1024 (iPad Pro), both options:
 * A (a 200px strip, the thread hanging from its row as a HangCard) and B
 * (the list hanging from the head's trailing glass group, a thread the card
 * changing in place):
 *
 * 1. Both render at every width: the frame at its real width, the head in
 *    three glass groups with Comments in the trailing one; A's strip
 *    200px beside the page with one-line rows, the thread's card hung from
 *    its row at the reading width; B's card hung from the trailing group at
 *    the list's width, then the thread's.
 * 2. The hang opens and closes on `translate` alone, and its neck meets its
 *    anchor within 1px (the cut at the anchor's foot, the neck's span on the
 *    anchor's), read at 0, ½ and 1 on the DevTools Animation domain
 *    (Chromium) or the page's held clock (WebKit).
 * 3. B's swap holds the card's trailing edge and its top still, read at 0,
 *    ½ and 1, while its width moves one way to the thread's.
 * 4. The overflow sweep (journeys/scan.ts: nothing spills, no control
 *    covers text, text clipped inside its box) and no part of a card, the
 *    strip or the head scrolling sideways, totals zero.
 * 5. No console or page error.
 * 6. Every pin's words, entry by entry, are the export's (pins.json, read
 *    from the hub), and every file an entry names is drawn.
 * 7. The state switcher is the shared one (state-switcher.ts): the system
 *    font, a vertical list with arrowed headings at 1440, a select at 744,
 *    H hiding it.
 *
 * Each option, width and state is captured into the run's folder with a
 * manifest (option, width, state, file, caption), which the preview's
 * captures/ is copied from.
 *
 *   bun scripts/probe-kit/run.ts tablet-comments-preview
 *   TABLET_ENGINES=chromium bun scripts/probe-kit/run.ts tablet-comments-preview
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { HouseRules } from "../house-rules";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec } from "../kit";
import { ROOT, readMotion } from "../kit";
import { checkSwitcher } from "../state-switcher";

const DIR = join(ROOT, "design-previews", "tablet-comments");
const OPTIONS = ["a", "b"] as const;
type Option = (typeof OPTIONS)[number];
/** Each width's screen height (preview.js `SCREENS`). */
const SCREENS: Record<number, number> = { 744: 1133, 820: 1180, 1024: 1366 };
const WIDTHS = [744, 820, 1024] as const;
const FRACTIONS = [0, 0.5, 1];
/** The pin each width's thread capture shows. */
const SHOWN_PIN = 1;

interface Entry {
  at: string;
  by: string;
  files?: string[];
  text: string;
}
interface Pin {
  number: number;
  thread: Entry[];
}
/** Each pin's row age and its entries' ages, as the house tells them against the fixed now. */
type Expect = Record<number, { row: string; entries: string[] }>;

/**
 * An age as the house writes it (utils/time `formatAgeShort`): under 45s
 * "now", then whole minutes, hours, days, weeks and years, each rounded.
 * Written out here, so the proof holds the parts to the rule rather than to
 * themselves.
 */
function ageOf(at: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - at) / 1000));
  if (seconds < 45) {
    return "now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const weeks = Math.round(days / 7);
  return weeks < 52 ? `${weeks}w` : `${Math.round(days / 365)}y`;
}

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** The address's state drawn, every run of the frame's let go to its end. */
async function load(
  page: Page,
  base: string,
  query: Record<string, string>
): Promise<void> {
  const before = await page
    .evaluate(() => Number(document.documentElement.dataset.ready ?? 0))
    .catch(() => 0);
  const said: string[] = [];
  const hear = (error: Error) => said.push(String(error));
  const told = (message: { type: () => string; text: () => string }) => {
    if (message.type() === "error") {
      said.push(message.text());
    }
  };
  page.on("pageerror", hear);
  page.on("console", told);
  // The option and the width are the switcher's `__state`; what stands open the page's own.
  const { option, width, ...own } = query;
  const address = new URLSearchParams(own).toString();
  await page.goto(
    `${base}?__state=option:${option},width:${width}${address ? `&${address}` : ""}`
  );
  try {
    await page.waitForFunction(
      (was) =>
        Number(document.documentElement.dataset.ready ?? 0) > 0 || was < 0,
      before,
      { timeout: 30_000 }
    );
  } catch (error) {
    throw new Error(
      `${new URLSearchParams(query)} never stood ready: ${said.join(" | ") || String(error)}`,
      { cause: error }
    );
  } finally {
    page.off("pageerror", hear);
    page.off("console", told);
  }
  await page.evaluate(async () => {
    // Runs on the document's clock only: a scroller's edge fade runs on its
    // scroll's timeline, and finished it drew the top fade at scroll-top.
    for (const run of document.getAnimations()) {
      if (run.timeline === document.timeline) {
        run.finish();
      }
    }
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });
}

/** What the frame draws: its boxes and what stands in it. Runs in the page. */
function readFrame() {
  const frame = document.querySelector<HTMLElement>('[data-slot="frame"]');
  const pane = frame?.querySelector<HTMLElement>('[data-slot="pane"]');
  const head = pane?.querySelector<HTMLElement>('[data-slot="pane-head"]');
  if (!(frame && pane && head)) {
    return null;
  }
  const box = (el: Element | null | undefined) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      l: r.left,
      r: r.right,
      t: r.top,
      b: r.bottom,
      w: r.width,
      h: r.height,
    };
  };
  const groups = [...head.querySelectorAll<HTMLElement>("[data-bar-group]")];
  const trailing = groups.at(-1);
  const strip = pane.querySelector('[data-slot="strip"]');
  const rows = [
    ...(strip ?? pane).querySelectorAll<HTMLElement>('[data-slot="pin-row"]'),
  ];
  const card = pane.querySelector<HTMLElement>(
    '[data-slot="hangs"] [data-slot="popover-content"]'
  );
  const face = card?.querySelector<HTMLElement>(
    "[data-face]:not([data-leaving])"
  );
  const openRow = pane.querySelector("li[data-open]");
  const lineH = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(
      "--c-artifact-row-h"
    )
  );
  return {
    frameW: frame.getBoundingClientRect().width,
    groups: groups.length,
    commentsInTrailing:
      trailing?.querySelector('[aria-label="Comments"]') !== null &&
      trailing?.querySelector('[aria-label="Comments"]') !== undefined,
    trailing: box(trailing),
    well: box(pane.querySelector('[data-slot="well"]')),
    strip: box(strip),
    rows: rows.map((row) => ({
      h: row.getBoundingClientRect().height,
      title: (() => {
        const t = row.querySelector<HTMLElement>('[data-slot="title"]');
        return t ? t.getBoundingClientRect().height : 0;
      })(),
    })),
    rowH: lineH,
    titleLine: (() => {
      const t = rows[0]?.querySelector<HTMLElement>('[data-slot="title"]');
      return t ? Number.parseFloat(getComputedStyle(t).lineHeight) : 0;
    })(),
    card: box(card),
    shown: card ? card.dataset.shown !== undefined : false,
    face: face?.dataset.face ?? null,
    pin: face?.dataset.pin ? Number(face.dataset.pin) : null,
    openRow: box(openRow),
    /** Each row's age, by its pin's number. */
    ages: Object.fromEntries(
      rows.map((row) => [
        row.dataset.pinRow ?? "",
        row.querySelector('[data-slot="age"]')?.textContent?.trim() ?? "",
      ])
    ),
    /** The open thread's entries' ages, in order. */
    threadAges: [
      ...(face?.querySelectorAll<HTMLElement>('li[data-slot="entry"]') ?? []),
    ].map((entry) =>
      [...entry.querySelectorAll('time[data-slot="when"]')]
        .map((t) => t.textContent?.trim() ?? "")
        .join(" ")
    ),
    /** A's open row: its pill and its first and last peer. */
    peers: (() => {
      const li = pane.querySelector("li[data-open]");
      const pill = li?.querySelector("[data-mark]");
      const buttons = [...(li?.querySelectorAll(".row-peers button") ?? [])];
      return pill && buttons.length > 0
        ? {
            pill: box(pill),
            first: box(buttons[0]),
            last: box(buttons.at(-1)),
            count: buttons.length,
            row: box(li),
          }
        : null;
    })(),
    /** B's thread bar: Back, the pill and the last peer, each one row. */
    bar: (() => {
      const bar = face?.querySelector(".thread-bar");
      const back = bar?.querySelector('[aria-label="Back to comments"]');
      const pill = bar?.querySelector("[data-mark]");
      const close = bar?.querySelector('[aria-label="Close"]');
      const name = face?.querySelector('[data-slot="name"]');
      return bar && back && pill && close
        ? {
            back: box(back),
            pill: box(pill),
            close: box(close),
            name: box(name),
            rows: face?.querySelectorAll('[data-slot="head-row"]').length ?? 0,
          }
        : null;
    })(),
    /** The open thread's room: its scroll and how much stands past each edge. */
    room: (() => {
      const room = face?.querySelector<HTMLElement>("[data-pin-room]");
      const newest = room?.querySelector<HTMLElement>(
        '[data-slot="thread"] > li:last-child'
      );
      return room && newest
        ? {
            top: room.scrollTop,
            newest:
              newest.getBoundingClientRect().top -
              room.getBoundingClientRect().top +
              room.scrollTop,
            max: room.scrollHeight - room.clientHeight,
            h: room.clientHeight,
          }
        : null;
    })(),
    pins: [...pane.querySelectorAll<HTMLElement>("[data-page-pin]")].map(
      (pin) => ({
        n: Number(pin.dataset.pagePin),
        shown: getComputedStyle(pin).visibility !== "hidden",
        gone:
          pin.querySelector<HTMLElement>("[data-mark]")?.dataset.gone ?? null,
        box: box(pin),
      })
    ),
  };
}
type Frame = NonNullable<ReturnType<typeof readFrame>>;

/** The hung card against its anchor: the cut, the card's box and its neck. Runs in the page. */
function readHang() {
  const pane = document.querySelector<HTMLElement>('[data-slot="pane"]');
  const wrapper = pane?.querySelector<HTMLElement>(
    '[data-slot="hangs"] [data-hang]'
  );
  const card = wrapper?.querySelector<HTMLElement>(
    '[data-slot="popover-content"]'
  );
  if (!(pane && wrapper && card)) {
    return null;
  }
  const anchor =
    pane.dataset.option === "a"
      ? pane.querySelector("li[data-open]")
      : pane.querySelector(
          '[data-slot="pane-head"] [data-bar-group]:last-of-type'
        );
  const trailing = [
    ...pane.querySelectorAll('[data-slot="pane-head"] [data-bar-group]'),
  ].at(-1);
  const at = (
    pane.dataset.option === "a" ? anchor : trailing
  )?.getBoundingClientRect();
  if (!at) {
    return null;
  }
  const c = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  return {
    anchor: { l: at.left, r: at.right, b: at.bottom },
    card: { l: c.left, r: c.right, t: c.top, b: c.bottom, w: c.width },
    cut: wrapper.getBoundingClientRect().top,
    neck: {
      start: Number.parseFloat(style.getPropertyValue("--neck-start")),
      end: Number.parseFloat(style.getPropertyValue("--neck-end")),
      flare: Number.parseFloat(style.getPropertyValue("--neck-flare-start")),
    },
    flush: card.dataset.flush ?? "",
    translate: style.translate,
    /** What runs on the card itself, by the properties its keyframes move, and how long. */
    runs: card.getAnimations({ subtree: false }).map((run) => {
      const effect = run.effect as KeyframeEffect;
      return {
        props: [
          ...new Set(
            effect
              .getKeyframes()
              .flatMap((frame) =>
                Object.keys(frame).filter(
                  (key) =>
                    ![
                      "offset",
                      "easing",
                      "composite",
                      "computedOffset",
                    ].includes(key)
                )
              )
          ),
        ],
        ms: Number(effect.getComputedTiming().duration),
        easing: effect.getTiming().easing,
      };
    }),
    opacity: Number(style.opacity),
    /** What runs on its faces: the outgoing one's fade and the incoming one's. */
    fades: [...card.querySelectorAll<HTMLElement>("[data-face]")].flatMap(
      (face) =>
        face.getAnimations({ subtree: false }).map((run) => {
          const effect = run.effect as KeyframeEffect;
          return {
            leaving: face.dataset.leaving !== undefined,
            props: Object.keys(effect.getKeyframes()[0] ?? {}).filter(
              (key) =>
                !["offset", "easing", "composite", "computedOffset"].includes(
                  key
                )
            ),
            ms: Number(effect.getComputedTiming().duration),
            easing: effect.getTiming().easing,
          };
        })
    ),
  };
}
type HangRead = NonNullable<ReturnType<typeof readHang>>;

const n1 = (v: number) => v.toFixed(1);
/** The neck meets the anchor: the cut at its foot, the neck's span on its span, within 1px. */
const meets = (r: HangRead) =>
  Math.abs(r.cut - r.anchor.b) <= 1 &&
  Math.abs(r.card.l + r.neck.start - r.anchor.l) <= 1 &&
  Math.abs(r.card.l + r.neck.end - r.anchor.r) <= 1;
const neckWords = (r: HangRead) =>
  `cut ${n1(r.cut)} at the foot ${n1(r.anchor.b)}, neck ${n1(r.card.l + r.neck.start)}–${n1(r.card.l + r.neck.end)} on ${n1(r.anchor.l)}–${n1(r.anchor.r)}, card top ${n1(r.card.t)}`;

/**
 * Every part of a hung card, the strip and the head that scrolls sideways
 * or has a child in the flow drawn past its edge; a part ending its words in
 * an ellipsis or a clamp by design is none. Runs in the page.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk in the page over every part, by what each can do with more than its width
function readWide(): string[] {
  const holders = [
    ...document.querySelectorAll<HTMLElement>(
      '[data-slot="hangs"] [data-slot="popover-content"], [data-slot="strip"], [data-slot="pane-head"]'
    ),
  ];
  const wide: string[] = [];
  const name = (el: Element) =>
    `${el.localName}[${(el as HTMLElement).dataset.slot ?? (el.getAttribute("class") ?? "").slice(0, 30)}]`;
  for (const holder of holders) {
    for (const el of [holder, ...holder.querySelectorAll<HTMLElement>("*")]) {
      if (
        !(el instanceof HTMLElement) ||
        el.clientWidth === 0 ||
        el.closest(".sr-only, [data-leaving]")
      ) {
        continue;
      }
      const style = getComputedStyle(el);
      const over = el.scrollWidth - el.clientWidth;
      if (["auto", "scroll"].includes(style.overflowX) && over > 0) {
        wide.push(`${name(el)} scrolls ${over}px sideways`);
        continue;
      }
      const clamped =
        style.textOverflow === "ellipsis" ||
        (style as unknown as { webkitLineClamp?: string }).webkitLineClamp !==
          "none";
      if (clamped) {
        continue;
      }
      const edge = el.getBoundingClientRect();
      for (const child of el.children) {
        const b = child.getBoundingClientRect();
        const past = Math.max(edge.left - b.left, b.right - edge.right);
        if (
          b.width > 0 &&
          past > 1 &&
          getComputedStyle(child).position !== "absolute" &&
          !child.closest(".sr-only")
        ) {
          wide.push(`${name(child)} ${past.toFixed(1)}px past ${name(el)}`);
        }
      }
    }
  }
  return wide;
}

/** Each entry of the open thread: its speaker, its words as drawn, the files it names. Runs in the page. */
function readThread() {
  const card = document.querySelector(
    '[data-slot="hangs"] [data-face="thread"]'
  );
  if (!card) {
    return null;
  }
  return [...card.querySelectorAll<HTMLElement>('li[data-slot="entry"]')].map(
    (entry) => ({
      by: entry.dataset.by ?? "",
      text: [...entry.querySelectorAll<HTMLElement>('[data-slot="msg"]')]
        .map((msg) => msg.innerText)
        .join(" "),
      files: [...entry.querySelectorAll("code")].map(
        (code) => code.textContent ?? ""
      ),
    })
  );
}

/** Words as a person reads them: the markdown's marks gone, every run of space one. */
const plain = (text: string) =>
  text
    .replaceAll(/`([^`]*)`/g, "$1")
    .replaceAll(/\*\*([^*]*)\*\*/g, "$1")
    .replaceAll(/^\s*- /gm, "")
    .replaceAll(/\s+/g, " ")
    .trim();

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each option's rules at each state, read off one frame
function renderChecks(
  kit: Kit,
  at: string,
  option: Option,
  width: number,
  shows: "list" | "thread",
  read: Frame,
  expect: Expect
): void {
  kit.check(
    `${at}: the frame stands at ${width}px (${read.frameW}px), its head in three glass groups (${read.groups}) with Comments in the trailing one`,
    Math.abs(read.frameW - width) <= 0.5 &&
      read.groups === 3 &&
      read.commentsInTrailing
  );
  const pinsShown = read.pins.filter((pin) => pin.shown).length;
  // No pill under the card, its rings included (a 2px ring, a focus ring 2px out).
  const c = read.card;
  const under = read.pins
    .map((pin) => {
      const b = pin.box;
      if (!(c && b)) {
        return { n: pin.n, over: 0 };
      }
      const ring = 4;
      const w = Math.min(b.r + ring, c.r) - Math.max(b.l - ring, c.l);
      const h = Math.min(b.b + ring, c.b) - Math.max(b.t - ring, c.t);
      return { n: pin.n, over: Math.max(0, w) * Math.max(0, h) };
    })
    .filter((one) => one.over > 0);
  kit.check(
    `${at}: no pill stands under the card, rings included${c ? ` (the card ${n1(c.l)}–${n1(c.r)} × ${n1(c.t)}–${n1(c.b)}; pills ${read.pins.map((pin) => (pin.box ? `${pin.n} at ${n1(pin.box.l)},${n1(pin.box.t)}` : `${pin.n} ?`)).join("; ")})` : ", none hangs"}`,
    under.length === 0,
    JSON.stringify(under)
  );
  const rows = Object.entries(read.ages);
  // B's thread stands in the list's place: no rows then, its last entry's age is held to the row's below.
  const listed = !(option === "b" && shows === "thread");
  kit.check(
    listed
      ? `${at}: every row's age is its last entry's, told against the fixed now (${rows.map(([n, age]) => `${n}: ${age}, wanted ${expect[Number(n)]?.row}`).join("; ")})`
      : `${at}: the thread stands in the list's place, no rows drawn beside it`,
    listed
      ? rows.length === 2 &&
          rows.every(([n, age]) => age === expect[Number(n)]?.row)
      : rows.length === 0
  );
  if (shows === "thread" && read.pin !== null) {
    const want = expect[read.pin]?.entries ?? [];
    kit.check(
      `${at}: comment ${read.pin}'s entries' ages are their own timestamps told against the same now, its last one the row's (${read.threadAges.join(" ")} against ${want.join(" ")})`,
      read.threadAges.length === want.length &&
        read.threadAges.every((age, i) => age === want[i]) &&
        read.threadAges.at(-1) === expect[read.pin]?.row
    );
    const { room } = read;
    kit.check(
      `${at}: the thread opens at its newest entry's first line (scrolled ${room ? n1(room.top) : "?"} of ${room ? n1(room.max) : "?"}, the newest at ${room ? n1(room.newest) : "?"}, in a ${room ? n1(room.h) : "?"}px room), so the edge fade stands at both edges while more is past them`,
      room !== null && Math.abs(room.top - Math.min(room.newest, room.max)) <= 1
    );
  }
  kit.check(
    `${at}: both pins stand on the page (${read.pins.map((pin) => `${pin.n}${pin.gone ? " gone" : ""} at ${pin.box ? `${n1(pin.box.l)},${n1(pin.box.t)}` : "?"}`).join("; ")})`,
    pinsShown === 2
  );
  if (option === "a") {
    const { strip } = read;
    const oneLine = read.rows.every(
      (row) => row.h <= read.rowH + 1 && row.title <= read.titleLine + 1
    );
    kit.check(
      `${at}: A's strip is 200px beside the page (${strip ? n1(strip.w) : "none"}px, the page ${read.well ? n1(read.well.w) : "?"}px), its ${read.rows.length} rows one line each, ${read.rowH}px tall (${read.rows.map((row) => n1(row.h)).join(", ")})`,
      strip !== null &&
        Math.abs(strip.w - 200) <= 0.5 &&
        read.rows.length === 2 &&
        oneLine,
      JSON.stringify(read.rows)
    );
    if (shows === "thread") {
      const row = read.openRow;
      const want = Math.min(480, Math.max(280, 0.4 * (read.well?.w ?? 0)));
      kit.check(
        `${at}: comment ${read.pin}'s thread hangs from its row, flush with its end (${c ? n1(c.r) : "?"} against ${row ? n1(row.r) : "?"}), ${c ? n1(c.w) : "?"}px wide (two fifths of the page, ${n1(want)}), its top on the row's foot (${c ? n1(c.t) : "?"} against ${row ? n1(row.b) : "?"}), ${c && read.well ? n1(Math.max(0, read.well.r - c.l)) : "?"}px of it over the page`,
        c !== null &&
          row !== null &&
          read.shown &&
          read.face === "thread" &&
          Math.abs(c.r - row.r) <= 1 &&
          Math.abs(c.t - row.b) <= 1 &&
          Math.abs(c.w - want) <= 1
      );
      const p = read.peers;
      kit.check(
        `${at}: the open row holds all four peers clear of its pill (${p?.count} peers, ${p ? n1(p.first?.l ?? 0) : "?"}–${p ? n1(p.last?.r ?? 0) : "?"}, the pill ending at ${p ? n1(p.pill?.r ?? 0) : "?"}, the row ${p ? n1(p.row?.l ?? 0) : "?"}–${p ? n1(p.row?.r ?? 0) : "?"})`,
        p !== null &&
          p.count === 4 &&
          p.first !== null &&
          p.last !== null &&
          p.pill !== null &&
          p.row !== null &&
          p.first.l >= p.pill.r + 4 &&
          p.last.r <= p.row.r + 0.5
      );
    } else {
      kit.check(`${at}: no card hangs with the list alone`, read.card === null);
    }
    return;
  }
  if (shows === "thread") {
    const b = read.bar;
    const mid = (x: { t: number; h: number } | null) =>
      x ? x.t + x.h / 2 : Number.NaN;
    kit.check(
      `${at}: the thread's head is one row (Back at ${b ? n1(mid(b.back)) : "?"}, the pill at ${b ? n1(mid(b.pill)) : "?"}, Close at ${b ? n1(mid(b.close)) : "?"}), what it stands on under it (${b ? n1(b.name?.t ?? 0) : "?"})`,
      b !== null &&
        b.rows === 0 &&
        Math.abs(mid(b.back) - mid(b.pill)) <= 2 &&
        Math.abs(mid(b.back) - mid(b.close)) <= 2 &&
        b.name !== null &&
        b.back !== null &&
        b.name.t >= b.back.b - 0.5
    );
  }
  const g = read.trailing;
  const wellW = read.well?.w ?? 0;
  const want =
    shows === "list"
      ? Math.min(380, Math.max(280, 0.3 * wellW))
      : Math.min(480, Math.max(280, 0.4 * wellW));
  kit.check(
    `${at}: B docks nothing (the page ${n1(wellW)} of ${width}px), its card hangs from the trailing group, flush with its trailing flank (${c ? n1(c.r) : "?"} against ${g ? n1(g.r) : "?"}), its top on the group's foot (${c ? n1(c.t) : "?"} against ${g ? n1(g.b) : "?"}), ${c ? n1(c.w) : "?"}px wide (${n1(want)}), showing the ${shows === "list" ? "list" : `thread of comment ${read.pin}`}`,
    read.strip === null &&
      c !== null &&
      g !== null &&
      read.shown &&
      read.face === shows &&
      Math.abs(c.r - g.r) <= 1 &&
      Math.abs(c.t - g.b) <= 1 &&
      Math.abs(c.w - want) <= 1,
    JSON.stringify({ face: read.face, pin: read.pin, shown: read.shown })
  );
}

/** The hang's open and close, held at 0, ½ and 1: translate alone, the neck on its anchor. */
async function hangLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  option: Option,
  width: number
): Promise<void> {
  await load(page, base, {
    option,
    width: String(width),
    state: option === "a" ? "list" : "none",
  });
  const at = `${engine} ${width} ${option.toUpperCase()}`;
  const press =
    option === "a"
      ? `[data-slot="strip"] [data-pin-row="${SHOWN_PIN}"]`
      : '[data-slot="pane-head"] [aria-label="Comments"]';
  const shut =
    option === "a"
      ? 'li[data-open] .row-peers button[aria-label="Close"]'
      : '[data-slot="hangs"] [aria-label="Close comments"]';
  for (const way of ["opens", "closes"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: the open, then the close
    const motion = await readMotion(
      page,
      () =>
        page.evaluate(
          (selector) => document.querySelector<HTMLElement>(selector)?.click(),
          way === "opens" ? press : shut
        ),
      '[data-slot="hangs"]',
      { fractions: FRACTIONS, of: "hang", read: () => page.evaluate(readHang) }
    );
    const reads = motion.at.map((one) => one.value);
    const runs = motion.runs
      .map(
        (run) =>
          `${run.target} ${run.name || "(web animation)"} ${run.end - run.delay}ms`
      )
      .join(", ");
    if (reads.some((one) => !one) || motion.runs.length === 0) {
      kit.check(
        `${at}: the hang ${way}, read at 0, ½ and 1`,
        false,
        JSON.stringify({ reads, runs })
      );
      continue;
    }
    const held = reads as HangRead[];
    const ms = way === "opens" ? 260 : 160;
    const onCard = held[1]?.runs ?? [];
    kit.check(
      `${at}: the hang ${way} on translate alone: the card's one run moves ${onCard.map((run) => `${run.props.join("+")} over ${run.ms}ms on ${run.easing}`).join(", ") || "nothing"}, its opacity ${held.map((r) => r.opacity).join(", ")} at 0, ½ and 1 (${motion.by} clock, inside the hang: ${runs})`,
      onCard.length === 1 &&
        onCard[0]?.props.length === 1 &&
        onCard[0]?.props[0] === "translate" &&
        Math.abs((onCard[0]?.ms ?? 0) - ms) < 1 &&
        (onCard[0]?.easing ?? "").replaceAll(" ", "") ===
          "cubic-bezier(0.23,1,0.32,1)" &&
        held.every((r) => r.opacity === 1)
    );
    kit.check(
      `${at}: as it ${way}, its neck meets its anchor within 1px at 0, ½ and 1 (${held.map(neckWords).join(" | ")})`,
      held.every(meets),
      JSON.stringify(held)
    );
    const [first, mid, last] = held as [HangRead, HangRead, HangRead];
    const [shutRead, openRead] =
      way === "opens" ? [first, last] : [last, first];
    kit.check(
      `${at}: shut, the card stands up behind the cut (its foot ${n1(shutRead.card.b)}, the cut ${n1(shutRead.cut)}); open, its top is the cut (${n1(openRead.card.t)}); half way, between (${n1(mid.card.t)})`,
      shutRead.card.b <= shutRead.cut + 1 &&
        Math.abs(openRead.card.t - openRead.cut) <= 1 &&
        mid.card.t < openRead.card.t - 1 &&
        mid.card.t > shutRead.card.t + 1,
      JSON.stringify({
        shutRead: shutRead.card,
        mid: mid.card,
        openRead: openRead.card,
        translate: held.map((r) => r.translate),
      })
    );
  }
}

/** B's swap, held at 0, ½ and 1: the trailing edge and the top still, the width one way. */
async function swapLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: Engine,
  width: number
): Promise<void> {
  await load(page, base, { option: "b", width: String(width), state: "list" });
  const at = `${engine} ${width} B`;
  for (const [way, selector] of [
    ["list to thread", `[data-slot="hangs"] [data-pin-row="${SHOWN_PIN}"]`],
    [
      "thread back to list",
      '[data-slot="hangs"] [aria-label="Back to comments"]',
    ],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: there, then back
    const motion = await readMotion(
      page,
      () =>
        page.evaluate(
          (s) => document.querySelector<HTMLElement>(s)?.click(),
          selector
        ),
      '[data-slot="hangs"]',
      {
        fractions: FRACTIONS,
        of: "morph", // Read in the next frame drawn at the held time: the neck follows the
        // box frame by frame, as HangCard's does, never inside the seek.
        read: async () => {
          await page.evaluate(
            () =>
              new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done))
              )
          );
          return page.evaluate(readHang);
        },
      }
    );
    const held = motion.at.map((one) => one.value) as (HangRead | null)[];
    const runs = motion.runs
      .map((run) => `${run.target} ${run.name} ${run.end - run.delay}ms`)
      .join(", ");
    if (held.length !== FRACTIONS.length || held.some((one) => !one)) {
      kit.check(
        `${at}: the card changes ${way}, read at 0, ½ and 1`,
        false,
        `${runs || "no runs"}; ${JSON.stringify(held)}; ${await page.evaluate(() => document.querySelector('[data-slot="hangs"]')?.innerHTML.length)}`
      );
      continue;
    }
    const reads = held as HangRead[];
    const [a, b, c] = reads as [HangRead, HangRead, HangRead];
    const still =
      reads.every((r) => Math.abs(r.card.r - a.card.r) <= 1) &&
      reads.every((r) => Math.abs(r.card.t - a.card.t) <= 1);
    const growing = way === "list to thread";
    const oneWay = growing
      ? a.card.w < b.card.w && b.card.w < c.card.w
      : a.card.w > b.card.w && b.card.w > c.card.w;
    kit.check(
      `${at}: changing ${way} the card holds its trailing edge (${reads.map((r) => n1(r.card.r)).join(", ")}) and its top (${reads.map((r) => n1(r.card.t)).join(", ")}) still, its width moving one way (${reads.map((r) => n1(r.card.w)).join(" → ")}), its neck on the group throughout`,
      still && oneWay && reads.every(meets),
      JSON.stringify(reads)
    );
    const mid = b;
    const drawer = "cubic-bezier(0.32,0.72,0,1)";
    const out = "cubic-bezier(0.23,1,0.32,1)";
    const flat = (e: string) => e.replaceAll(" ", "");
    const tween = mid.runs.find(
      (run) => run.props.includes("width") && run.props.includes("height")
    );
    const leaves = mid.fades.find(
      (f) => f.leaving && f.props.includes("opacity")
    );
    const comes = mid.fades.find(
      (f) => !f.leaving && f.props.includes("opacity")
    );
    kit.check(
      `${at}: its box tweens width and height over ${tween?.ms}ms on ${tween?.easing} (--dur-morph, --ease-drawer); the outgoing face fades over ${leaves?.ms}ms on ${leaves?.easing}, the incoming over ${comes?.ms}ms on ${comes?.easing}`,
      tween !== undefined &&
        Math.abs(tween.ms - 180) < 1 &&
        flat(tween.easing ?? "") === drawer &&
        leaves !== undefined &&
        Math.abs(leaves.ms - 160) < 1 &&
        flat(leaves.easing ?? "") === out &&
        comes !== undefined &&
        Math.abs(comes.ms - 180) < 1 &&
        flat(comes.easing ?? "") === drawer,
      runs
    );
  }
}

const CAPTIONS: Record<Option, Record<"list" | "thread", string>> = {
  a: {
    list: "A: the strip of one-line rows beside the page",
    thread: "A: comment 1's thread hung from its row, over the page",
  },
  b: {
    list: "B: the list hung from Comments in the head's trailing group",
    thread: "B: the same card changed in place to comment 1's thread",
  },
};

const spec: Spec = {
  name: "tablet-comments-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, width, option and state in order on one page each, with the words read at 820
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    const exported = (await Bun.file(join(DIR, "pins.json")).json()) as {
      now: string;
      pins: Pin[];
    };
    // Every age is told against the moment the pins were read (pins.json `now`).
    const now = Date.parse(exported.now);
    const expect: Expect = Object.fromEntries(
      exported.pins.map((pin) => {
        const last = Math.max(
          ...pin.thread.map((entry) => Date.parse(entry.at))
        );
        return [
          pin.number,
          {
            row: ageOf(last, now),
            entries: pin.thread.map((entry) =>
              ageOf(Date.parse(entry.at), now)
            ),
          },
        ];
      })
    );
    const manifest: Record<string, string | number>[] = [];
    try {
      const engines = (process.env.TABLET_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        const house = new HouseRules(kit, engine, {
          scope: '[data-slot="frame"]',
          except: [
            {
              rule: "coral",
              selector: '[data-mark][data-state="sent"]',
              reason:
                "a sent pin's pill, filled action-solid once sent (DESIGN.md, A pin's pill): one per comment on the page and its rows, a mark, not the view's act",
            },
          ],
        });
        let spills = 0;
        for (const width of WIDTHS) {
          // biome-ignore lint/performance/noAwaitInLoops: one engine's pages one at a time
          const page = await kit.page("tablet820", { engine, scale: 1 });
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
              kit.note(`console error: ${message.text()}`);
            }
          });
          page.on("pageerror", (error) => {
            errors.push(String(error));
            kit.note(`page error: ${error.stack ?? String(error)}`);
          });
          if (width === WIDTHS[0]) {
            await load(page, base, {
              option: "a",
              width: "820",
              state: "list",
            });
            await checkSwitcher(kit, page, engine, {
              axes: true,
              narrow: width,
            });
          }
          await page.setViewportSize({ width, height: SCREENS[width] + 400 });
          for (const option of OPTIONS) {
            for (const shows of ["list", "thread"] as const) {
              // biome-ignore lint/performance/noAwaitInLoops: one state at a time on one page
              await load(page, base, {
                option,
                width: String(width),
                state: shows,
                ...(shows === "thread" ? { pin: String(SHOWN_PIN) } : {}),
              });
              const at = `${engine} ${width} ${option.toUpperCase()} ${shows}`;
              const read = await page.evaluate(readFrame);
              if (!read) {
                kit.check(`${at}: the frame renders`, false);
                continue;
              }
              renderChecks(kit, at, option, width, shows, read, expect);
              await house.at(page, at);
              const swept = await page.evaluate(scan);
              const wide = await page.evaluate(readWide);
              spills += swept.length + wide.length;
              kit.check(
                `${at}: the overflow sweep finds nothing (nothing spills, no control covers text, nothing scrolls sideways)`,
                swept.length === 0 && wide.length === 0,
                [...swept, ...wide].slice(0, 6).join("; ")
              );
              // The page under review has ended its own opening: none of its
              // runs that end is still running, so A and B differ only by the option.
              const pageRuns = await page.evaluate(() => {
                const doc =
                  document.querySelector<HTMLIFrameElement>(
                    '[data-slot="page"]'
                  )?.contentDocument;
                return (doc?.getAnimations() ?? [])
                  .filter(
                    (run) =>
                      run.playState !== "finished" &&
                      Number.isFinite(
                        Number(run.effect?.getComputedTiming().endTime)
                      )
                  )
                  .map((run) => {
                    const target = (run.effect as KeyframeEffect)
                      .target as HTMLElement | null;
                    return `${target?.dataset.slot ?? target?.localName ?? "?"} ${run.playState}`;
                  });
              });
              kit.check(
                `${at}: the page under review has ended its opening, none of its own runs that end still running (${pageRuns.length})`,
                pageRuns.length === 0,
                pageRuns.join(", ")
              );
              if (engine === "chromium") {
                const file = `${option}-${width}-${shows}.png`;
                await mkdir(join(kit.out, "captures"), { recursive: true });
                await page
                  .locator('[data-slot="frame"]')
                  .screenshot({ path: join(kit.out, "captures", file) });
                manifest.push({
                  option,
                  width,
                  state: shows === "list" ? "list open" : "thread",
                  file,
                  caption: `${CAPTIONS[option][shows]}, ${width}px`,
                  now: exported.now,
                });
              }
            }
            await hangLeg(kit, page, base, engine, option, width);
          }
          await swapLeg(kit, page, base, engine, width);
          if (width === WIDTHS.at(-1)) {
            house.report();
          }
          if (width === 820) {
            for (const option of OPTIONS) {
              for (const pin of exported.pins) {
                // biome-ignore lint/performance/noAwaitInLoops: one thread at a time
                await load(page, base, {
                  option,
                  width: String(width),
                  state: "thread",
                  pin: String(pin.number),
                });
                const drawn = (await page.evaluate(readThread)) ?? [];
                // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one entry's speaker, words and files held to the export's
                const wrong = pin.thread.flatMap((entry, i) => {
                  const there = drawn[i];
                  const words = plain(entry.text);
                  const files = entry.files ?? [];
                  if (!there) {
                    return [`entry ${i + 1} not drawn`];
                  }
                  return [
                    ...(there.by === entry.by
                      ? []
                      : [`entry ${i + 1} by ${there.by}`]),
                    ...(plain(there.text) === words
                      ? []
                      : [
                          `entry ${i + 1}: "${plain(there.text).slice(0, 80)}" against "${words.slice(0, 80)}"`,
                        ]),
                    ...files
                      .filter((f) => !there.files.includes(f))
                      .map((f) => `entry ${i + 1} lacks ${f}`),
                  ];
                });
                kit.check(
                  `${engine} ${option.toUpperCase()}: comment ${pin.number}'s ${pin.thread.length} entries are the export's, word for word, by the same speakers, every file named drawn (${drawn.length} drawn)`,
                  wrong.length === 0 && drawn.length === pin.thread.length,
                  wrong.slice(0, 4).join(" | ")
                );
              }
            }
          }
          await page.close();
        }
        kit.check(
          `${engine}: the overflow sweep at 744, 820 and 1024, both options, list and thread, totals ${spills}`,
          spills === 0
        );
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
      }
      if (manifest.length > 0) {
        await writeFile(
          join(kit.out, "manifest.json"),
          `${JSON.stringify(manifest, null, 2)}\n`
        );
        kit.note(`captures and manifest.json in ${kit.out}`);
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
