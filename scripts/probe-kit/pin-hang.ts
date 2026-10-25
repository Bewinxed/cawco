/**
 * A comment's thread card hung from its pin (DESIGN.md, "A thread beside
 * its pin"; "A card that hangs from its anchor"), read from the engine, for
 * every spec that stands one: the pin-working bench (specs/web/pin-working)
 * and the comment sizing preview's live card (specs/comment-sizing-preview).
 *
 * - `readHang`, in the page: the card (a HangCard), where it is drawn and
 *   where it is laid out (its floating wrapper's box, which its slide never
 *   moves), the pin's foot (PinFoot: the pin as drawn, its rings round its
 *   box) and the cut at its side, the pill's face and its own fill, the
 *   neck the card is cut across, what animates on the card, and the foot's
 *   phase (plain, the bridge, none).
 * - `inkAt`: the silhouette where the pin meets the card, rasterised (an
 *   ink read: what drawing alone decides, the bridge's continuity), on a
 *   contrasting ground (`ground`): along the pin's middle row from the
 *   face's near edge across the cut into the card, and down the column just
 *   short of the cut.
 * - `hangChecks`: the open or the close of one card, read at its fractions.
 * - `recordStill`, in the page, and `stillChecks`: a page scrolled under an
 *   open card, every frame read.
 */
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import type { Kit, MotionRun } from "./kit";

/** What a spec names: the card, the pill's face, and the pin room it stands in. */
export interface HangSel {
  card: string;
  face: string;
  room: string;
}

interface Rect {
  h: number;
  w: number;
  x: number;
  y: number;
}

/** The hung card and its pin's foot as drawn now, in the viewport's px. Runs in the page. */
export function readHang(sel: HangSel) {
  const card = document.querySelector<HTMLElement>(sel.card);
  const foot = document.querySelector<HTMLElement>('[data-slot="pin-foot"]');
  const face = document.querySelector<HTMLElement>(sel.face);
  const wrapper = card?.parentElement;
  if (!(card && foot && face && wrapper)) {
    return null;
  }
  const rect = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const px = (name: string) =>
    Number.parseFloat(card.style.getPropertyValue(name)) || 0;
  const from = card.dataset.hangFrom ?? "";
  const f = rect(foot);
  const look = getComputedStyle(face);
  const props = (run: Animation) => {
    const effect = run.effect as KeyframeEffect | null;
    return [
      ...new Set(
        (effect?.getKeyframes() ?? []).flatMap((frame) =>
          Object.keys(frame).filter(
            (key) =>
              !["offset", "computedOffset", "easing", "composite"].includes(key)
          )
        )
      ),
    ].join(",");
  };
  return {
    from,
    side: card.dataset.side ?? "",
    shown: card.dataset.shown !== undefined,
    card: rect(card),
    laid: rect(wrapper),
    foot: f,
    face: rect(face),
    cut: from === "start" ? f.x : f.x + f.w,
    fill: look.backgroundColor,
    neck: {
      start: px("--neck-start"),
      end: px("--neck-end"),
      flareStart: px("--neck-flare-start"),
      flareEnd: px("--neck-flare-end"),
    },
    flush: card.dataset.flush ?? null,
    phase: foot.querySelector("svg")?.dataset.phase ?? "",
    runs: card.getAnimations().map((run) => ({
      props: props(run),
      ms: Number(run.effect?.getComputedTiming().duration),
      easing: (run.effect as KeyframeEffect | null)?.getTiming().easing ?? "",
    })),
    /** Runs on the pin's foot: none, its bridge is drawn on the card's clock. */
    footRuns: foot.getAnimations({ subtree: true }).length,
    clip: getComputedStyle(wrapper).clipPath,
  };
}
export type HangRead = NonNullable<ReturnType<typeof readHang>>;

/** Two frames, so what draws on the card's clock (PinFoot's bridge) has drawn where the clock was sought. */
export const twoFrames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/** A ground no part of the card or its pin is drawn in, for the ink read: on (`true`) or off. */
export async function ground(
  page: Page,
  room: string,
  on: boolean
): Promise<void> {
  await page.evaluate(
    ({ room: sel, on: lay }) => {
      const id = "pin-hang-ground";
      document.getElementById(id)?.remove();
      if (lay) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent = `${sel} { background: rgb(255 0 255) !important; }`;
        document.head.append(style);
      }
    },
    { room, on }
  );
}

/** The ink where the pin meets the card: the middle row's run, and the column's. */
export interface Ink {
  /** The column just short of the cut: the silhouette's height there, px. */
  column: number;
  /** Along the pin's middle row, from the face's near edge to 3px into the card: the first px of ground, or none. */
  gapAt: number | null;
  /** How far that column's middle stands from the cut, px. */
  off: number;
  /** That row's length, px. */
  row: number;
}

/** The silhouette where the pin meets the card, rasterised on the ground (`ground` on), in css px. */
export async function inkAt(page: Page, read: HangRead): Promise<Ink> {
  const end = read.from !== "start";
  const flare = Math.max(read.neck.flareStart, read.neck.flareEnd, 12);
  const clip = {
    x: Math.floor(read.foot.x - 2),
    y: Math.floor(read.foot.y - flare - 6),
    width: Math.ceil(read.foot.w + 10),
    height: Math.ceil(read.foot.h + 2 * flare + 12),
  };
  const png = PNG.sync.read(await page.screenshot({ clip, scale: "css" }));
  const isGround = (x: number, y: number) => {
    const i = (Math.round(y) * png.width + Math.round(x)) * 4;
    const [r = 0, g = 0, b = 0] = [
      png.data[i],
      png.data[i + 1],
      png.data[i + 2],
    ];
    return r > 200 && g < 70 && b > 200;
  };
  const mid = read.foot.y + read.foot.h / 2 - clip.y;
  const cut = read.cut - clip.x;
  const near = (end ? read.face.x + read.face.w : read.face.x) - clip.x;
  const xs: number[] = [];
  if (end) {
    for (let x = Math.ceil(near); x <= cut + 3; x += 1) {
      xs.push(x);
    }
  } else {
    for (let x = Math.floor(near); x >= cut - 3; x -= 1) {
      xs.push(x);
    }
  }
  const gap = xs.find((x) => x >= 0 && x < png.width && isGround(x, mid));
  // Down the column just short of the cut, from the middle out each way.
  const col = Math.round(end ? cut - 1 : cut + 1);
  let up = 0;
  while (mid - up - 1 >= 0 && !isGround(col, mid - up - 1)) {
    up += 1;
  }
  let down = 0;
  while (mid + down + 1 < png.height && !isGround(col, mid + down + 1)) {
    down += 1;
  }
  return {
    gapAt: gap === undefined ? null : gap + clip.x,
    row: xs.length,
    column: up + down + 1,
    off: Math.abs(col + 0.5 - cut),
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** One way of a hung card's motion, read at its fractions with its ink: the checks on them. */
export function hangChecks(
  kit: Kit,
  at: string,
  way: "opens" | "closes",
  reads: { fraction: number; read: HangRead; ink: Ink | null }[],
  runs: MotionRun[]
): void {
  const shut = way === "opens" ? reads[0] : reads.at(-1);
  const open = way === "opens" ? reads.at(-1) : reads[0];
  if (!(shut && open)) {
    kit.check(`${at}: the card ${way}, read at each fraction`, false);
    return;
  }
  const onCard = reads.flatMap((one) => one.read.runs);
  kit.check(
    `${at}: as the card ${way}, only translate animates on the card (${[...new Set(onCard.map((run) => `${run.props} ${run.ms}ms ${run.easing}`))].join("; ") || "nothing held"}), none on the pin's foot, whose bridge is drawn on the card's clock (${reads.map((one) => one.read.footRuns).join(" ")} runs; ${runs.map((run) => `${run.name} ${run.end - run.delay}ms`).join(", ")})`,
    onCard.length > 0 &&
      onCard.every((run) => run.props === "translate") &&
      reads.every((one) => one.read.footRuns === 0)
  );
  const behind =
    shut.read.from === "start"
      ? shut.read.card.x >= shut.read.cut - 0.5
      : shut.read.card.x + shut.read.card.w <= shut.read.cut + 0.5;
  kit.check(
    `${at}: ${way === "opens" ? "at 0" : "at 1"} the card stands wholly behind the cut at the pin's ${shut.read.from === "start" ? "start" : "end"} side (its box ${r1(shut.read.card.x)}–${r1(shut.read.card.x + shut.read.card.w)}, the cut at ${r1(shut.read.cut)}), its wrapper cut there (${shut.read.clip})`,
    behind && shut.read.clip.startsWith("inset(")
  );
  // Where the pin stands against the card, in its laid-out box: the neck
  // runs from the pin's top to its foot, each flare past it, the cut on the
  // card's edge facing it.
  const meets = reads.map(({ read }) => {
    const edge =
      read.from === "start" ? read.laid.x + read.laid.w : read.laid.x;
    return {
      edge: Math.abs(edge - read.cut),
      top: Math.abs(read.laid.y + read.neck.start - read.foot.y),
      foot: Math.abs(read.laid.y + read.neck.end - (read.foot.y + read.foot.h)),
    };
  });
  kit.check(
    `${at}: at every fraction the neck stands on the pin: the card's edge on the cut (${meets.map((one) => r1(one.edge)).join(" ")}px off), its neck from the pin's top (${meets.map((one) => r1(one.top)).join(" ")}px off) to its foot (${meets.map((one) => r1(one.foot)).join(" ")}px off), each within 1px, the flares ${open.read.neck.flareStart}px and ${open.read.neck.flareEnd}px`,
    meets.every((one) => one.edge <= 1 && one.top <= 1 && one.foot <= 1)
  );
  const fills = [...new Set(reads.map((one) => one.read.fill))];
  kit.check(
    `${at}: the pin's own fill never changes (${fills.join(", ")}): nothing paints over its face, which the foot leaves open`,
    fills.length === 1
  );
  const inks = reads.filter(
    (one): one is { fraction: number; read: HangRead; ink: Ink } =>
      one.ink !== null
  );
  // Early in the run, out or back: the card still well past the cut, the
  // bridge melting at the junction.
  const early = inks.filter((one) => one.fraction > 0 && one.fraction <= 0.25);
  kit.check(
    `${at}: early in the slide the pin and the card are one silhouette, the bridge between them (${early.map((one) => `at ${one.fraction}: ${one.ink.gapAt === null ? `no ground across ${one.ink.row}px` : `ground at ${r1(one.ink.gapAt)}`}, ${one.ink.column}px tall at the cut`).join("; ")}; the foot ${early.map((one) => one.read.phase).join(" ")})`,
    early.length > 0 &&
      early.every(
        (one) => one.ink.gapAt === null && one.read.phase === "bridge"
      )
  );
  // The column read is the one just short of the cut, its middle `off` px
  // from it: a flare of radius f stands there f - √(f² - (f - off)²) px past
  // the pin's flank (its circle at that column), so the pin and its flares
  // stand that tall, give or take a pixel of antialiasing at each end.
  const restInk = inks.find(
    (one) => one.fraction === (way === "opens" ? 1 : 0)
  )?.ink;
  const off = restInk?.off ?? 0.5;
  // A pixel snapped where the engine draws it: its middle half a pixel either way.
  const spanAt = (d: number) => {
    const past = (f: number) =>
      f > d ? f - Math.sqrt(f ** 2 - (f - d) ** 2) : 0;
    return (
      open.read.foot.h +
      past(open.read.neck.flareStart) +
      past(open.read.neck.flareEnd)
    );
  };
  const least = spanAt(off + 0.5) - 1;
  const most = spanAt(Math.max(0.01, off - 0.5)) + 2;
  const rest = inks.find((one) => one.fraction === (way === "opens" ? 1 : 0));
  kit.check(
    `${at}: standing open, the bridge has drawn itself into the neck: the silhouette just short of the cut is the pin and its flares there (${rest?.ink.column ?? "?"}px, ${r1(least)} to ${r1(most)}px there), joined across (${rest?.ink.gapAt === null ? "no ground" : `ground at ${rest?.ink.gapAt}`}), the foot ${open.read.phase === "rest" ? "drawn plain" : "at the bridge's end"}`,
    !!rest &&
      rest.ink.gapAt === null &&
      rest.ink.column >= least &&
      rest.ink.column <= most &&
      (open.read.phase === "rest" || open.read.phase === "bridge")
  );
}

/**
 * Every frame for `ms`: the card's box and its pin's in its pin room's px
 * (the room carried by a page scrolled round it is not the card moving),
 * how many runs move it, and how many times the primitive has placed it
 * anew; and each placement, with the runs moving its wrapper right then (a
 * placement's travel starts in the same task, PinFloat `onplaced`, so a
 * travel that runs wholly between two frames of a starved engine is still
 * seen). Runs in the page.
 */
export function recordStill({
  ms,
  card: cardSel,
  room: roomSel,
}: {
  card: string;
  ms: number;
  room: string;
}) {
  const frames: {
    box: { x: number; y: number; w: number; h: number };
    moving: number;
    pin: number | null;
    placed: number;
    side: string;
  }[] = [];
  const placements: { runs: number }[] = [];
  const until = performance.now() + ms;
  const wrapper = document.querySelector<HTMLElement>(cardSel)?.parentElement;
  const placing = new MutationObserver(() => {
    placements.push({
      runs: wrapper
        ? wrapper.getAnimations().filter((run) => run.playState !== "finished")
            .length
        : 0,
    });
  });
  if (wrapper) {
    placing.observe(wrapper, { attributes: true, attributeFilter: ["style"] });
  }
  return new Promise<{ frames: typeof frames; placements: typeof placements }>(
    (done) => {
      const step = () => {
        const card = document.querySelector<HTMLElement>(cardSel);
        const foot = document.querySelector<HTMLElement>(
          '[data-slot="pin-foot"]'
        );
        const room = document.querySelector<HTMLElement>(roomSel);
        if (card && room) {
          const c = card.getBoundingClientRect();
          const r = room.getBoundingClientRect();
          frames.push({
            box: {
              x: c.left - r.left,
              y: c.top - r.top,
              w: c.width,
              h: c.height,
            },
            moving: (card.parentElement?.getAnimations() ?? []).filter(
              (run) => run.playState === "running"
            ).length,
            pin:
              foot && foot.offsetParent !== null
                ? foot.getBoundingClientRect().top - r.top
                : null,
            placed: placements.length,
            side: card.dataset.side ?? "",
          });
        }
        if (performance.now() < until) {
          requestAnimationFrame(step);
        } else {
          placing.disconnect();
          done({ frames, placements });
        }
      };
      requestAnimationFrame(step);
    }
  );
}
export type StillRecord = Awaited<ReturnType<typeof recordStill>>;

/**
 * What a run of frames says of a card standing still as its page scrolls:
 * how far its box moved between frames where no move ran and it was never
 * placed anew (it should not move at all), and each move: the travel (one
 * run) from the box it stood at to the one it stands at next. A move whose
 * run fell wholly between two frames is known by its placement and the run
 * it started there.
 */
export function stillOf({ frames, placements }: StillRecord) {
  let drift = 0;
  let travel = 0;
  const moves: { from: number; runs: number; to: number }[] = [];
  let move: { from: number; runs: number; to: number } | null = null;
  for (const [i, frame] of frames.entries()) {
    const before = frames[i - 1];
    if (!before) {
      continue;
    }
    if (frame.pin !== null && before.pin !== null) {
      travel += Math.abs(frame.pin - before.pin);
    }
    const stepped =
      Math.abs(frame.box.x - before.box.x) +
      Math.abs(frame.box.y - before.box.y);
    const placedBetween = placements.slice(before.placed, frame.placed);
    if (
      frame.moving > 0 ||
      before.moving > 0 ||
      (placedBetween.length > 0 && stepped > 0.5)
    ) {
      if (!move) {
        move = { from: before.box.y, runs: 0, to: frame.box.y };
        moves.push(move);
      }
      move.runs = Math.max(
        move.runs,
        frame.moving,
        ...placedBetween.map((one) => one.runs)
      );
      move.to = frame.box.y;
    } else {
      move = null;
      drift = Math.max(drift, stepped);
    }
  }
  return {
    drift,
    travel,
    moves,
    sides: [...new Set(frames.map((frame) => frame.side))],
    frames: frames.length,
  };
}

/** The checks on a page scrolled under an open card. */
export function stillChecks(
  kit: Kit,
  at: string,
  how: "wheel" | "code",
  read: ReturnType<typeof stillOf>
): void {
  kit.check(
    `${at}: scrolled by ${how === "wheel" ? "wheel steps" : "code"} (the pin travelled ${r1(read.travel)}px over ${read.frames} frames), the card stands still on every frame between its moves (${r1(read.drift)}px of change), each move one travel from the box it stood at to its next (${read.moves.map((one) => `${r1(one.from)}→${r1(one.to)} in ${one.runs} run`).join(", ") || "none needed"}), and it keeps its side (${read.sides.join(", ")})`,
    read.frames > 10 &&
      read.travel > 50 &&
      read.drift <= 0.01 &&
      read.moves.every((one) => one.runs === 1) &&
      read.sides.length === 1,
    JSON.stringify({ ...read, moves: read.moves.slice(0, 8) })
  );
}
