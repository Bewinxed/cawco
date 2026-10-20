/**
 * The owner's 13 pins on pairing round 2, each read from the engine on the
 * pairing sheet (apps/dashboard/src/lib/cawco/pairing/Pairing.stories.ts) as
 * the workspace's stage serves it (`PROBE_STAGE`): one check per pin, its
 * reading in the line. Desk width 680, light and dark for fills.
 *
 *  - Geometry (alignment, places, what stands on screen) from
 *    getBoundingClientRect.
 *  - Fills and inks from computed styles, drawn to a canvas pixel so
 *    oklch() and light-dark() resolve.
 *  - Motion by the clock (anim.ts): each moment's Play is pressed, every
 *    run it starts is held by the Animation domain, and the beat is sought
 *    to 0, ¼, ½, ¾ and 1 with values read at each. A moment's later beats
 *    are started by the storyboard's own timers, so those timers run 25
 *    times slower while a moment is caught (the page's `setTimeout`,
 *    nothing on its clock): each beat starts well after the one before
 *    has been read.
 *
 * The scan's no-match shake and the QR's decode are read by pairing-sheet.
 */
import type { Page } from "playwright-core";
import { Clock } from "../anim";
import { frames, type Kit, open, type Spec, settle } from "../kit";

const STORIES = "src/lib/cawco/pairing/Pairing.stories.ts";
const READY = '[data-cawco-story="NeedsYou"] [data-slot="row"]';
const WIDTH = 680;
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1] as const;
/** How much slower the storyboard's timers run while a moment is caught. */
const SLOW = 25;
/** Past the longest stagger a stop's rest starts (5 × dur-stagger, 300ms), ms. */
const STAGGERED = 500;
/** How long a beat may take to start: past the slowed hold (30s). */
const CATCH_MS = 60_000;
/** Just short of a loop's end: at 1 it has wrapped to its next turn. */
const LOOP_END = 0.99;

/** A Svelte-scoped keyframe name's prefix. */
const SCOPED = /^svelte-[a-z0-9]+-/;

const story = (name: string) => `[data-cawco-story="${name}"]`;

/** The page's timers, slowed by `window.kitSlow` (1 until a moment is caught). */
function slowTimers(): void {
  const w = window as unknown as { kitSlow: number };
  w.kitSlow = 1;
  const real = window.setTimeout.bind(window);
  window.setTimeout = ((
    handler: TimerHandler,
    ms?: number,
    ...rest: unknown[]
  ) =>
    real(handler, (ms ?? 0) * w.kitSlow, ...rest)) as typeof window.setTimeout;
}

/** What a stop shows at this instant: the places, Caw, the dots and the boxes. */
interface Reading {
  caw: string | null;
  cawTop: number | null;
  cellOpacity: number;
  cellsH: number;
  cellY: number;
  dotMove: number;
  dotOpacity: number;
  dots: number;
  footTop: number | null;
  overlap: number;
  qrH: number;
  title: string;
  titleTop: number | null;
}

function readStop(selector: string): Reading {
  const frame = document.querySelector(selector) as Element;
  const rect = (sel: string) =>
    frame.querySelector(sel)?.getBoundingClientRect() ?? null;
  const translate = (el: Element) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.m41, y: m.m42 };
  };
  const mean = (values: number[]) =>
    values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  const dots = [...frame.querySelectorAll('[data-slot="qr"] .dot')];
  const cells = [...frame.querySelectorAll(".otp .cell")];
  const qr = rect('[data-slot="qr-place"]');
  const boxes = rect('[data-slot="cells-place"]');
  // The words that came in: while a swap is held, the leaving copy stands before them.
  const live = [
    ...frame.querySelectorAll('[data-slot="words"] .live [data-slot="title"]'),
  ].at(-1);
  return {
    caw:
      frame.querySelector('[data-slot="caw-80"]')?.getAttribute("data-caw") ??
      null,
    cawTop: rect('[data-slot="caw-80"]')?.top ?? null,
    titleTop: rect('[data-slot="words"]')?.top ?? null,
    title: live?.textContent?.trim() ?? "",
    footTop: rect(".foot")?.top ?? null,
    qrH: qr?.height ?? 0,
    cellsH: boxes?.height ?? 0,
    overlap:
      qr && boxes
        ? Math.max(0, Math.min(qr.bottom, boxes.bottom) - boxes.top)
        : 0,
    dots: dots.length,
    dotOpacity: mean(dots.map((d) => Number(getComputedStyle(d).opacity))),
    dotMove: mean(
      dots.map((d) => {
        const t = translate(d);
        return Math.hypot(t.x, t.y);
      })
    ),
    cellY: mean(cells.map((c) => translate(c).y)),
    cellOpacity: mean(cells.map((c) => Number(getComputedStyle(c).opacity))),
  };
}

const read = (page: Page, name: string) => page.evaluate(readStop, story(name));

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A caught run's name ending in `suffix` (Svelte scopes keyframe names). */
function named(clock: Clock, suffix: string): string | undefined {
  return clock.runs.find((run) => run.name.endsWith(suffix))?.name;
}

/**
 * One beat of a moment: `start` waits for it to begin, every run it starts
 * inside the stop is held, and the beat is sought to each fraction of its
 * runs named `of` (a name's suffix: every dot's run, each with its own
 * delay, the last one's end the beat's end), else of its longest run; the
 * readings in order, with the runs caught.
 */
async function beat(
  page: Page,
  clock: Clock,
  name: string,
  start: () => Promise<unknown>,
  of?: string,
  /** Inside the stop, what the catch keeps: all of it unless named. */
  within = ""
): Promise<{ readings: Reading[]; runs: string[] }> {
  await clock.catchRuns(start, `${story(name)} ${within}`.trim(), CATCH_MS);
  const ends = clock.runs
    .filter((run) => of !== undefined && run.name.endsWith(of))
    .map((run) => run.end);
  const whole = clock.length();
  const share = ends.length > 0 ? Math.max(...ends) / whole : 1;
  const readings: Reading[] = [];
  for (const f of FRACTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time on one clock
    await clock.seek(f * share);
    readings.push(await read(page, name));
  }
  const runs = clock.runs.map(
    (one) =>
      `${one.name.replace(SCOPED, "") || one.type} ${Math.round(one.end)}ms ${one.easing}${one.loop ? " loop" : ""}`
  );
  return { readings, runs };
}

/**
 * The runs a moment caught, one line a kind: its name, how many, its
 * lengths (delay and duration: a staggered kind spans a range) and easing.
 */
function summary(runs: string[]): string {
  const kinds = new Map<string, { ends: number[]; rest: string }>();
  for (const run of runs) {
    const [kind = "", end = "0", ...rest] = run.split(" ");
    const known = kinds.get(kind) ?? { ends: [], rest: rest.join(" ") };
    known.ends.push(Number.parseInt(end, 10));
    kinds.set(kind, known);
  }
  return [...kinds]
    .map(([kind, { ends, rest }]) => {
      const lo = Math.min(...ends);
      const hi = Math.max(...ends);
      return `${kind}${ends.length > 1 ? ` ×${ends.length}` : ""} ${lo === hi ? lo : `${lo}–${hi}`}ms ${rest}`;
    })
    .join("; ");
}

/**
 * Slows the storyboard's timers, presses a stop's Play, and waits until
 * the stop, mounted afresh in the state the moment starts from, has
 * started that state's own runs (on elements the moment removes),
 * staggered ones included (the letters' pulse, 5 × dur-stagger late),
 * before any catch. The moment itself starts SLOW × dur-hold (30s) after
 * the press, well after.
 */
async function play(page: Page, name: string, label: string): Promise<void> {
  await page.evaluate((slow) => {
    (window as unknown as { kitSlow: number }).kitSlow = slow;
  }, SLOW);
  await page.locator(story(name)).getByRole("button", { name: label }).click();
  await frames(page);
  await page.waitForTimeout(STAGGERED);
}

async function done(page: Page, clock: Clock): Promise<void> {
  await clock.release();
  await page.evaluate(() => {
    (window as unknown as { kitSlow: number }).kitSlow = 1;
  });
}

const until = (page: Page, name: string, sel: string) =>
  page.waitForSelector(`${story(name)} ${sel}`, {
    state: "attached",
    timeout: CATCH_MS,
  });
/**
 * A place's contents on their way out: Svelte makes a leaving node inert
 * as its outro starts (held on the clock, the outro never ends, so the node
 * is never detached while it is read).
 */
const closes = (page: Page, name: string, place: string) =>
  until(page, name, `[data-slot="${place}"] > .slot[inert]`);

const spread = (values: (number | null)[]) => {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? 0 : Math.max(...known) - Math.min(...known);
};
/** Never rises by more than half a pixel from one reading to the next. */
const falls = (values: number[]) =>
  values.every((v, i) => i === 0 || v <= (values[i - 1] as number) + 0.5);

/** Pins 1, 5, 6: the code's edges on the QR's or camera's, and the QR drawn. */
function edges(): string[] {
  const lines: string[] = [];
  for (const frame of document.querySelectorAll("[data-cawco-story]")) {
    const name = frame.getAttribute("data-cawco-story");
    const row = frame.querySelector(".otp .row")?.getBoundingClientRect();
    const above = (
      frame.querySelector('[data-slot="camera"]') ??
      frame.querySelector('[data-slot="pairing"] [data-slot="qr"] .card')
    )?.getBoundingClientRect();
    if (row && above) {
      lines.push(
        `${name} ${Math.max(Math.abs(above.left - row.left), Math.abs(above.right - row.right)).toFixed(2)}`
      );
    }
  }
  return lines;
}

function qrDrawing(sel: string) {
  const frame = document.querySelector(sel) as Element;
  const svg = frame.querySelector('[data-slot="qr"] svg.code');
  const card = frame.querySelector('[data-slot="qr"] .card');
  const dots = frame.querySelectorAll('[data-slot="qr"] circle.dot');
  const eye = frame.querySelector('[data-slot="qr"] .eye rect');
  const head = frame.querySelector(
    '[data-slot="qr"] .head'
  ) as HTMLImageElement | null;
  const s = svg?.getBoundingClientRect();
  const c = card?.getBoundingClientRect();
  const pad = card ? Number.parseFloat(getComputedStyle(card).paddingTop) : 0;
  return {
    dots: dots.length,
    r: dots[0]?.getAttribute("r") ?? null,
    eyeRx: eye?.getAttribute("rx") ?? null,
    eyes: frame.querySelectorAll('[data-slot="qr"] .eye').length,
    field: c ? c.width - 2 * pad : 0,
    svg: s?.width ?? 0,
    card: c?.width ?? 0,
    head: head?.complete === true && (head?.naturalWidth ?? 0) > 0,
  };
}

/** Pins 2, 5, 7: every box's fill and edge against the recess, the letters' ink. */
function fills(): {
  boxes: number;
  off: string[];
  inks: Record<string, string>;
} {
  const paint = document.createElement("canvas").getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D;
  const rgb = (colour: string) => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = colour;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
  };
  const token = (name: string) => {
    const probe = document.createElement("span");
    document.body.append(probe);
    probe.style.color = `var(${name})`;
    const value = rgb(getComputedStyle(probe).color);
    probe.remove();
    return value;
  };
  const recess = token("--surface-recess");
  const doneBg = token("--status-done-bg");
  const INKS: Record<string, string> = {
    [token("--status-done-ink")]: "done ink",
    [token("--status-fail-ink")]: "fail ink",
  };
  const off: string[] = [];
  let boxes = 0;
  const inks: Record<string, string> = {};
  for (const frame of document.querySelectorAll("[data-cawco-story]")) {
    const name = frame.getAttribute("data-cawco-story") as string;
    for (const cell of frame.querySelectorAll(".otp .cell")) {
      boxes += 1;
      const style = getComputedStyle(cell);
      if (rgb(style.backgroundColor) !== recess) {
        off.push(`${name}: fill ${style.backgroundColor}`);
      }
      if (style.borderTopWidth !== "1px") {
        off.push(`${name}: edge ${style.borderTopWidth}`);
      }
      inks[name] = INKS[rgb(style.color)] ?? "neutral";
    }
    // No status fill anywhere in the screen itself (the scan's Approve button is its own).
    for (const el of frame.querySelectorAll('[data-slot="pairing"] *')) {
      if (rgb(getComputedStyle(el).backgroundColor) === doneBg) {
        off.push(`${name}: done fill on ${el.className}`);
      }
    }
  }
  return { boxes, off, inks };
}

/** Pin 7's countdown: every character's box (the shown copy, not the Swap's sizers). */
function digits(sel: string): string {
  return [...document.querySelectorAll(`${sel} .foot .live .figure .digit`)]
    .map((d) => d.getBoundingClientRect().width.toFixed(2))
    .join("|");
}

function failed(sel: string) {
  const frame = document.querySelector(sel) as Element;
  return {
    qr: frame.querySelectorAll('[data-slot="qr"]').length,
    boxes: frame.querySelectorAll(".otp").length,
    title:
      frame
        .querySelector('[data-slot="words"] .live [data-slot="title"]')
        ?.textContent?.trim() ?? "",
    line:
      frame
        .querySelector('[data-slot="words"] .live .line')
        ?.textContent?.trim() ?? "",
    buttons: [...frame.querySelectorAll('[data-slot="pairing"] button')]
      .filter((b) => b.closest(".sizer") === null)
      .map((b) => b.textContent?.trim()),
    caw: frame.querySelector('[data-slot="caw-80"]')?.getAttribute("data-caw"),
  };
}

/** Pin 13 read on Asking: what the card holds while the hub makes the code. */
function asking(sel: string) {
  const frame = document.querySelector(sel) as Element;
  const qr = frame.querySelector('[data-slot="qr"]');
  const dots = [...(qr?.querySelectorAll(".dot") ?? [])];
  const card = qr?.querySelector(".card");
  return {
    act: qr?.getAttribute("data-act") ?? "",
    dots: dots.length,
    drifting: dots.filter((dot) =>
      dot
        .getAnimations()
        // Svelte scopes a component's keyframes: the name ends in qr-drift.
        .some((run) =>
          (run as CSSAnimation).animationName?.endsWith("qr-drift")
        )
    ).length,
    blank: qr?.querySelectorAll(".skeleton").length ?? 0,
    eyes: [...(qr?.querySelectorAll(".eye") ?? [])].filter(
      (eye) => getComputedStyle(eye).opacity !== "0"
    ).length,
    code: getComputedStyle(qr?.querySelector(".code") ?? document.body).opacity,
    card: card ? Math.round(card.getBoundingClientRect().width) : 0,
    caption:
      frame.querySelector(".foot .live .caption")?.textContent?.trim() ?? "",
  };
}

const joined = (values: number[], round: (n: number) => number = r2) =>
  values.map(round).join(" → ");

/** Pins 1, 5, 6, 7, 13: what stands at rest. */
async function still(kit: Kit, page: Page): Promise<void> {
  const lines = await page.evaluate(edges);
  const worst = Math.max(...lines.map((l) => Number(l.split(" ")[1])));
  kit.check(
    `pins 1, 5: the code's edges on the QR card's or camera well's, ${lines.length} stops, worst ${worst}px`,
    worst <= 0.5,
    lines.join("\n")
  );
  const q = await page.evaluate(qrDrawing, story("Waiting"));
  kit.check(
    `pins 1, 6: Waiting's QR is drawn, ${q.dots} round dots (r ${q.r}), ${q.eyes} finder eyes rounded (rx ${q.eyeRx}), Caw's head loaded ${q.head}, the code ${r2(q.svg)}px in a ${r2(q.field)}px field of a ${r2(q.card)}px card`,
    q.dots > 100 && q.eyes === 3 && q.head && Math.abs(q.svg - q.field) <= 0.5
  );
  const widths = await page.evaluate(digits, story("LastMinute"));
  const figure = await page
    .locator(`${story("LastMinute")} .foot .live .figure`)
    .textContent();
  kit.check(
    `pin 7: the countdown "${figure}" draws each character in its own box: ${widths}px`,
    widths.length > 0 && new Set(widths.split("|")).size === 1
  );
  const fail = await page.evaluate(failed, story("Failed"));
  kit.check(
    `pin 13: Failed draws ${fail.qr} QR and ${fail.boxes} code rows; "${fail.title}", "${fail.line}", buttons ${JSON.stringify(fail.buttons)}, Caw ${fail.caw}`,
    fail.qr === 0 &&
      fail.boxes === 0 &&
      fail.buttons.some((b) => b?.startsWith("Try again")) &&
      fail.buttons.includes("Show details") &&
      !fail.buttons.includes("Change hub") &&
      fail.caw === "needs-you"
  );
  const ask = await page.evaluate(asking, story("Asking"));
  kit.check(
    `pin 13: Asking is no blank square: its ${ask.card}px card holds ${ask.dots} dots, ${ask.drifting} drifting, stepped back to ${ask.code}, ${ask.eyes} finder eyes and ${ask.blank} grey blocks, over "${ask.caption}"`,
    ask.act === "loading" &&
      ask.dots > 100 &&
      ask.drifting === ask.dots &&
      ask.blank === 0 &&
      ask.eyes === 0 &&
      ask.caption === "Asking the hub for a code…"
  );
}

/** Pin 8: the code arrives, the dots shuffling into place. */
async function arrival(kit: Kit, page: Page, clock: Clock): Promise<void> {
  await play(page, "Waiting", "Play: the key arrives");
  const arrive = await beat(
    page,
    clock,
    "Waiting",
    () => until(page, "Waiting", '[data-act="arrive"]'),
    "qr-shuffle"
  );
  await done(page, clock);
  const moves = arrive.readings.map((r) => r1(r.dotMove));
  kit.check(
    `pin 8: Waiting's dots, mean way from their module at 0…1 of the shuffle: ${moves.join(" → ")}; opacity ${joined(arrive.readings.map((r) => r.dotOpacity))}`,
    (moves[0] as number) > 0.5 && moves.at(-1) === 0
  );
  kit.note(`pin 4 · arrival runs: ${summary(arrive.runs)}`);
  await settle(page, 400);
}

/** Pin 10: pending pings the card; a scan runs the spinner on its edge. */
async function pending(kit: Kit, page: Page, clock: Clock): Promise<void> {
  // The ping starts once the code has arrived: caught from then.
  await play(page, "Waiting", "Play: the key arrives");
  await until(page, "Waiting", '[data-act="arrive"]');
  const ping = await beat(
    page,
    clock,
    "Waiting",
    () => until(page, "Waiting", ".ping"),
    "qr-ping",
    ".ping"
  );
  await clock.seek(LOOP_END);
  const ring = await page.evaluate((sel) => {
    const s = getComputedStyle(
      document.querySelector(`${sel} .ping`) as Element
    );
    return {
      scale: new DOMMatrix(s.transform).a,
      opacity: s.opacity,
      radius: s.borderTopLeftRadius,
      edge: s.borderTopWidth,
    };
  }, story("Waiting"));
  await done(page, clock);
  const pingRun = ping.runs.find((r) => r.startsWith("qr-ping"));
  kit.check(
    `pin 10: while it waits the card pings (${pingRun}): a ${ring.edge} ring on the card's ${ring.radius} edge, at ${LOOP_END} of its turn scale ${r2(ring.scale)} and opacity ${r2(Number(ring.opacity))}`,
    pingRun?.endsWith("loop") === true &&
      Number(ring.opacity) < 0.05 &&
      ring.scale > 1.03
  );
  await settle(page, 400);

  await play(page, "Checking", "Play: the phone scans it");
  const scanned = await beat(
    page,
    clock,
    "Checking",
    () => until(page, "Checking", '[data-act="dim"] .lit'),
    "qr-edge"
  );
  const offsets: string[] = [];
  const dims: number[] = [];
  for (const f of FRACTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time
    await clock.seek(Math.min(f, LOOP_END), named(clock, "qr-edge"));
    const at = await page.evaluate((sel) => {
      const lit = document.querySelector(`${sel} .lit`) as Element;
      const code = document.querySelector(`${sel} svg.code`) as Element;
      return {
        offset: getComputedStyle(lit).strokeDashoffset,
        dim: Number(getComputedStyle(code).opacity),
      };
    }, story("Checking"));
    offsets.push(at.offset);
    dims.push(at.dim);
  }
  await done(page, clock);
  const runs = scanned.runs.join("; ");
  const last = scanned.readings.at(-1);
  kit.check(
    `pin 10: a scan runs the spinner round the card's edge (stroke-dashoffset ${offsets.join(" → ")}), the code steps back (opacity ${joined(dims)}) and the letters pulse (${runs.includes("otp-pulse") ? "otp-pulse" : "no pulse"}); Caw ${last?.caw}, the words "${last?.title}"`,
    offsets[0] !== offsets.at(-1) &&
      (dims.at(-1) ?? 1) < 0.5 &&
      runs.includes("otp-pulse") &&
      last?.caw === "needs-you" &&
      last?.title === "Check these match your phone"
  );
  await settle(page, 400);
}

/** Pin 9: approved, the code hidden smoothly, then Caw reacts. */
async function approved(kit: Kit, page: Page, clock: Clock): Promise<void> {
  await play(page, "Approved", "Play: approved");
  const swallow = await beat(
    page,
    clock,
    "Approved",
    () => until(page, "Approved", '[data-act="swallow"]'),
    "qr-swallow"
  );
  const reacted = await beat(page, clock, "Approved", () =>
    until(page, "Approved", '[data-caw="done"]')
  );
  const closed = await beat(page, clock, "Approved", () =>
    closes(page, "Approved", "qr-place")
  );
  await done(page, clock);
  kit.check(
    `pin 9: approved, the dots pour into the head (opacity ${joined(swallow.readings.map((r) => r.dotOpacity))}, way moved ${joined(
      swallow.readings.map((r) => r.dotMove),
      r1
    )}), then Caw turns ${reacted.readings.at(-1)?.caw}, then the card's place closes ${joined(
      closed.readings.map((r) => r.qrH),
      r1
    )}px`,
    (swallow.readings.at(-1)?.dotOpacity ?? 1) < 0.05 &&
      reacted.readings.at(-1)?.caw === "done" &&
      falls(closed.readings.map((r) => r.qrH)) &&
      (closed.readings.at(-1)?.qrH ?? 1) < 0.5
  );
  kit.note(
    `pin 4 · approved runs: ${summary([...swallow.runs, ...reacted.runs, ...closed.runs])}`
  );
  await settle(page, 2500);
}

/** Pins 3, 11, 12: a dead code falls apart; Caw and the words hold still. */
async function breakUp(
  kit: Kit,
  page: Page,
  clock: Clock,
  moment: {
    name: string;
    label: string;
    act: string;
    out: string;
    pin: string;
    caw: string;
  }
): Promise<void> {
  const { name } = moment;
  await play(page, name, moment.label);
  const breaks = await beat(
    page,
    clock,
    name,
    () => until(page, name, `[data-act="${moment.act}"]`),
    `qr-${moment.act}`
  );
  const falling = await beat(
    page,
    clock,
    name,
    () => until(page, name, "[data-falling]"),
    "otp-fall"
  );
  const closing = await beat(page, clock, name, () =>
    closes(page, name, "qr-place")
  );
  await done(page, clock);
  // Caw turns once the places have closed, on a timer set while slowed.
  await until(page, name, `[data-caw="${moment.caw}"]`).catch(() => undefined);
  await settle(page, 600);
  const end = await read(page, name);
  const all = [...breaks.readings, ...falling.readings, ...closing.readings];
  const head = breaks.runs
    .filter((r) => r.startsWith("qr-squeeze") || r.startsWith("qr-shake"))
    .map((h) => h.split(" ")[0]);
  const ways = await page
    .locator(story(name))
    .getByRole("button", { name: moment.out })
    .count();
  const cawMoved = spread(all.map((r) => r.cawTop));
  const wordsMoved = spread(all.map((r) => r.titleTop));
  const overlap = Math.max(...all.map((r) => r.overlap));
  kit.check(
    `pins 3, ${moment.pin}: ${name}: the dots leave (opacity ${joined(breaks.readings.map((r) => r.dotOpacity))}${head.length > 0 ? `; the head ${head.join(" and ")}` : ""}), the boxes fall (${falling.readings.map((r) => `${r1(r.cellY)}px/${r2(r.cellOpacity)}`).join(" → ")}), the places close (QR ${joined(
      closing.readings.map((r) => r.qrH),
      r1
    )}px, boxes ${joined(
      closing.readings.map((r) => r.cellsH),
      r1
    )}px), overlap ${overlap}px; Caw moved ${r1(cawMoved)}px, the words ${r1(wordsMoved)}px; ends "${end.title}", Caw ${end.caw}, ${ways} "${moment.out}"`,
    cawMoved <= 0.5 &&
      wordsMoved <= 0.5 &&
      overlap === 0 &&
      falls(closing.readings.map((r) => r.qrH)) &&
      end.qrH < 0.5 &&
      end.cellsH < 0.5 &&
      ways === 1 &&
      end.caw === moment.caw
  );
  kit.note(
    `pin 4 · ${name} runs: ${summary([...breaks.runs, ...falling.runs, ...closing.runs])}`
  );
}

/**
 * The sheet at the spec's width in `theme`, every stop laid out as a
 * decision page's Preview draws it: the component canvas `by=embed`, each
 * story at rest in the page's flow, every frame under `scheme`.
 */
async function sheet(
  kit: Kit,
  stage: string,
  theme: "light" | "dark"
): Promise<Page> {
  const page = await kit.page("desk", { theme, init: [slowTimers] });
  await open(
    page,
    `${stage}/@cawco/canvas?file=${encodeURIComponent(STORIES)}&by=embed&scheme=${theme}`,
    READY
  );
  await page.setViewportSize({ width: WIDTH, height: 900 });
  const tall = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: WIDTH, height: tall });
  await settle(page);
  const f = await page.evaluate(fills);
  kit.check(
    `pins 2, 5, 7 (${theme}): all ${f.boxes} boxes have the recess fill and a 1px edge, no done fill on the screen; letters: Approved ${f.inks.Approved}, ScanMatched ${f.inks.ScanMatched}, ScanNoMatch ${f.inks.ScanNoMatch}`,
    f.off.length === 0 && f.inks.Approved === "done ink",
    f.off.slice(0, 6).join("\n")
  );
  return page;
}

const spec: Spec = {
  name: "pairing-pins",
  async run(kit: Kit) {
    const stage = process.env.PROBE_STAGE;
    if (!stage) {
      kit.check("PROBE_STAGE names the workspace's stage", false);
      return;
    }
    await (await sheet(kit, stage, "dark")).close();
    const page = await sheet(kit, stage, "light");
    await still(kit, page);
    // A fresh clock (its own DevTools session) a moment: after a moment
    // that held over a thousand runs, a session kept reporting none.
    await arrival(kit, page, await Clock.on(page));
    await pending(kit, page, await Clock.on(page));
    await approved(kit, page, await Clock.on(page));
    await breakUp(kit, page, await Clock.on(page), {
      name: "Denied",
      label: "Play: denied",
      act: "burst",
      out: "Start again",
      pin: "11",
      caw: "needs-you",
    });
    await breakUp(kit, page, await Clock.on(page), {
      name: "ExpiredParked",
      label: "Play: the code runs out",
      act: "drain",
      out: "New code",
      pin: "12",
      caw: "idle",
    });
    await page.close();
    await onScreen(kit, stage);
  },
};

/**
 * Pin 3 on the whole screen: Denied's fold on the panel's own 100dvh
 * column (DeniedOnScreen), at a desk's 1440×900 and a phone's 390×844,
 * each page at its own size (never fitted to the page's height, so 100dvh
 * is the screen's). Caw and the words must move 0px while the places fold.
 */
async function onScreen(kit: Kit, stage: string): Promise<void> {
  for (const view of ["desk", "phone"] as const) {
    // The frame at the screen's own width (the canvas's `width`), so the
    // panel lays out as that screen does: an embed draws a wider form scaled.
    const width = view === "desk" ? 1440 : 390;
    // biome-ignore lint/performance/noAwaitInLoops: one screen at a time
    const page = await kit.page(view, { theme: "light", init: [slowTimers] });
    await open(
      page,
      `${stage}/@cawco/canvas?file=${encodeURIComponent(STORIES)}&by=embed&story=DeniedOnScreen&scheme=light&width=${width}`,
      '[data-cawco-story="DeniedOnScreen"] [data-slot="pairing"]'
    );
    await settle(page);
    await breakUp(kit, page, await Clock.on(page), {
      name: "DeniedOnScreen",
      label: "Play: denied",
      act: "burst",
      out: "Start again",
      pin: `11, the whole screen at ${view === "desk" ? "1440×900" : "390×844"}`,
      caw: "needs-you",
    });
    await page.close();
  }
}

export default spec;
