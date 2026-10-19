/**
 * Captures of a component canvas's frames, for a reviewer who reads them
 * and never the page: each one exactly the frame it is named for, in the
 * scheme it is named for, drawn and settled. Nothing else in the kit
 * proves a picture shows what its name says, and the canvas makes that
 * easy to get wrong: its world is one transformed, clipped layer, so a
 * frame scrolled "into view" can stand outside the canvas's box, and a
 * shot of its rect then holds the page's chrome, another frame, or one
 * colour (approval-card's first captures: dark files byte-identical to
 * light ones, whole groups of stories one picture, 18 uniform files).
 *
 * Each shot, in the page that holds its frame:
 *  1. posed, settled and pictured by agent frame-picture.ts, the one path
 *     every picture of a frame takes (the daemon's render too): the window
 *     grown by the room the canvas lacks, the frame at its own size whatever
 *     the window's width, its fonts and animations settled, its body's own
 *     rect shot, refused unless whole in the canvas and its CSS size times
 *     the device's scale (a refusal is this shot's fault);
 *  2. read from the DOM before shooting: the frame's story, file, width and
 *     scheme are the ones named, every part of it (shadow roots too) draws
 *     in its scheme, it holds what the shot asks, its images loaded, and
 *     every point of a grid over it hits its own body, so nothing (the
 *     chrome, a label, another frame) covers it;
 *  3. its pixels read back: not one colour, and at the grid's points the
 *     colour its DOM paints there.
 * Over the set: no light file is byte-identical to its dark twin, and no
 * two files are byte-identical. A shot that fails any of these fails the
 * leg `checkShots` names.
 */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import {
  FramePictureRefusal,
  framePicture,
  poseFrame,
} from "../../packages/agent/src/frame-picture";
import type { Kit, Theme } from "./kit";

/** One frame to capture, and where its png goes. */
export interface Shot {
  /** The states file, as the canvas names it (`?file=`). */
  file: string;
  /** What the frame's body must hold when shot (a state with a window of time: an Undo that leaves). */
  holds?: string;
  /** Absolute path of the png. */
  path: string;
  scheme: Theme;
  story: string;
  /** The column's width: the frame's `data-cawco-width`. */
  width: number;
}

/** What one capture showed, and what was wrong with it. */
export interface ShotRead extends Shot {
  faults: string[];
  /** The png's md5. */
  hash: string;
  /** The frame's label words, as the page drew them over the frame. */
  label: string;
  /** Pixels, the share of the commonest colour, and how many grid points matched their DOM's paint. */
  stats: { height: number; matched: string; top: number; width: number };
}

/** How long a frame may take to have its room and settle. */
const POSE_MS = 10_000;
/** Points per side of the grid each shot is hit-tested and colour-read on. */
const GRID = 5;
/** A pixel matches its DOM's paint within this much per channel (antialiasing, a shadow's edge). */
const TOLERANCE = 10;
/** At least this share of grid points show the colour their DOM paints. */
const MATCH_SHARE = 0.6;
/** A capture is one colour when its commonest covers this share of it. */
const UNIFORM = 0.99;

/** The rest frame of `shot`, by its own data attributes. */
const frameSelector = (shot: Omit<Shot, "path">) =>
  `.cawco-frame[data-cawco-file="${shot.file}"][data-cawco-story="${shot.story}"][data-cawco-width="${shot.width}"][data-cawco-scheme="${shot.scheme}"][data-cawco-interaction="rest"]`;

/** The frame's key, in the page. */
const keyOf = (selector: string): string | null =>
  document.querySelector<HTMLElement>(selector)?.dataset.cawcoKey ?? null;

interface Painted {
  /** The colour the DOM paints at the point, 0–255 sRGB, or null where it can't be told (an image, a gradient, text on it). */
  rgb: [number, number, number] | null;
  x: number;
  y: number;
}

/** What `identityOf` read. */
type Seen = NonNullable<ReturnType<typeof identityOf>>;

/** What the DOM says of the posed frame before it is shot: whose it is, its scheme, what it holds, whether its images loaded. In the page. */
function identityOf(args: { selector: string; holds: string | null }) {
  const frame = document.querySelector<HTMLElement>(args.selector);
  const body = frame?.querySelector<HTMLElement>(":scope > .cawco-frame-body");
  if (!(frame && body)) {
    return null;
  }
  return {
    story: frame.dataset.cawcoStory ?? "",
    file: frame.dataset.cawcoFile ?? "",
    width: frame.dataset.cawcoWidth ?? "",
    scheme: frame.dataset.cawcoScheme ?? "",
    colorScheme: getComputedStyle(body).colorScheme,
    label: frame.querySelector(".cawco-frame-words")?.textContent?.trim() ?? "",
    held: args.holds === null || body.querySelector(args.holds) !== null,
    unloaded: [...body.querySelectorAll("img")]
      .filter((img) => !(img.complete && img.naturalWidth > 0))
      .map((img) => img.src.slice(0, 120)),
  };
}

/**
 * A grid of points over the frame's body: any where something else is on
 * top (the canvas's chrome, a label, another frame), and at each of the
 * rest the flat colour the DOM paints there. In the page.
 */
function gridOf(args: { selector: string; grid: number }) {
  const body = document.querySelector<HTMLElement>(
    `${args.selector} > .cawco-frame-body`
  );
  if (!body) {
    return { covered: ["no body"], points: [] as Painted[] };
  }
  const rect = body.getBoundingClientRect();
  const paint = document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  /** A CSS colour as 0–255 sRGB with its alpha, through the 2D context. */
  const rgba = (color: string): number[] => {
    if (!paint) {
      return [0, 0, 0, 0];
    }
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    return [...paint.getImageData(0, 0, 1, 1).data];
  };
  /** The flat colour under a hit: the nearest box out from it with an opaque background and no image; null where that can't be told. */
  const paintedAt = (hit: Element): [number, number, number] | null => {
    for (
      let at: Element | null = hit;
      at && body.contains(at);
      at = at.parentElement
    ) {
      const style = getComputedStyle(at);
      const [r = 0, g = 0, b = 0, a = 0] = rgba(style.backgroundColor);
      if (style.backgroundImage !== "none" || (a > 0 && a < 255)) {
        return null;
      }
      if (a === 255) {
        return [r, g, b];
      }
    }
    return null;
  };
  // A text node's glyphs cover part of its box: a point on words is not read.
  const onText = (hit: Element) =>
    [...hit.childNodes].some(
      (node) =>
        node.nodeType === Node.TEXT_NODE &&
        (node.textContent ?? "").trim() !== ""
    );
  const name = (el: Element | null) =>
    el
      ? `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`
      : "nothing";
  const covered: string[] = [];
  const points: Painted[] = [];
  for (let at = 0; at < args.grid * args.grid; at += 1) {
    const x = ((rect.width - 4) * ((at % args.grid) + 0.5)) / args.grid + 2;
    const y =
      ((rect.height - 4) * (Math.floor(at / args.grid) + 0.5)) / args.grid + 2;
    const hit = document.elementFromPoint(rect.left + x, rect.top + y);
    if (hit && body.contains(hit)) {
      points.push({ x, y, rgb: onText(hit) ? null : paintedAt(hit) });
    } else {
      covered.push(`(${Math.round(x)},${Math.round(y)}) is ${name(hit)}`);
    }
  }
  return { covered, points };
}

/**
 * The parts of the frame drawn in another scheme than its own: an element,
 * a shadow root's included, whose `color-scheme` names another, or both
 * (which follows the OS), draws its light-dark() colours in that one,
 * whatever its frame says. In the page.
 */
function astrayOf(selector: string): string[] {
  const frame = document.querySelector<HTMLElement>(selector);
  const body = frame?.querySelector(":scope > .cawco-frame-body");
  if (!(frame && body)) {
    return [];
  }
  const os = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  const drawnIn = (named: string[]) => {
    if (named.includes("dark") && named.includes("light")) {
      return os;
    }
    return named.includes("dark") ? "dark" : "light";
  };
  const astray: string[] = [];
  const roots: (Element | ShadowRoot)[] = [body];
  for (let root = roots.pop(); root; root = roots.pop()) {
    for (const el of root.querySelectorAll("*")) {
      const named = getComputedStyle(el).colorScheme.split(" ");
      if (drawnIn(named) !== frame.dataset.cawcoScheme) {
        astray.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} (color-scheme ${named.join(" ")})`
        );
      }
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
      }
    }
  }
  return astray.slice(0, 3);
}

/** The share of a png's commonest colour. */
function topShareOf(png: PNG): number {
  const counts = new Map<string, number>();
  const { data } = png;
  for (let at = 0; at < data.length; at += 4) {
    const key = `${data[at]},${data[at + 1]},${data[at + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / (data.length / 4);
}

/** How many of the DOM's painted points the png shows in their colour, of those read. */
function matchedOf(
  png: PNG,
  scale: number,
  points: Painted[]
): { hit: number; read: number; misses: string[] } {
  const read = points.filter((one) => one.rgb !== null);
  const misses: string[] = [];
  let hit = 0;
  for (const point of read) {
    const px = Math.min(png.width - 1, Math.floor(point.x * scale));
    const py = Math.min(png.height - 1, Math.floor(point.y * scale));
    const at = (py * png.width + px) * 4;
    const got = [
      png.data[at] ?? 0,
      png.data[at + 1] ?? 0,
      png.data[at + 2] ?? 0,
    ];
    const want = point.rgb as [number, number, number];
    if (
      got.every((value, c) => Math.abs(value - (want[c] ?? 0)) <= TOLERANCE)
    ) {
      hit += 1;
    } else if (misses.length < 3) {
      misses.push(
        `(${Math.round(point.x)},${Math.round(point.y)}) rgb(${got.join(",")}) for rgb(${want.join(",")})`
      );
    }
  }
  return { hit, read: read.length, misses };
}

/** What the DOM, read before the shot, says is wrong with it. */
function faultsOf(
  shot: Shot,
  seen: Seen,
  grid: { covered: string[] },
  astray: string[]
): string[] {
  const named = `${shot.story}@${shot.width}/${shot.scheme} of ${shot.file}`;
  const on = `${seen.story}@${seen.width}/${seen.scheme} of ${seen.file}`;
  const rules: [boolean, string][] = [
    [on !== named, `on screen ${on}`],
    [
      seen.colorScheme !== shot.scheme,
      `its body draws in color-scheme ${seen.colorScheme}`,
    ],
    [astray.length > 0, `parts drawn in another scheme: ${astray.join("; ")}`],
    [
      grid.covered.length > 0,
      `covered: ${grid.covered.slice(0, 3).join("; ")}`,
    ],
    [!seen.held, `holds no ${shot.holds} when shot`],
    [
      seen.unloaded.length > 0,
      `images not loaded: ${seen.unloaded.join(", ")}`,
    ],
  ];
  return rules.filter(([broken]) => broken).map(([, words]) => words);
}

/** A refusal's words, for a shot's faults; anything else is no refusal and goes on up. */
const refused = (error: unknown): string => {
  if (error instanceof FramePictureRefusal) {
    return error.message;
  }
  throw error;
};

/**
 * One frame shot: posed and settled and pictured by agent frame-picture.ts
 * (every picture of a frame's one path, its refusals this shot's faults),
 * read from the DOM before, its pixels read back after.
 */
async function shootOne(page: Page, shot: Shot): Promise<ShotRead> {
  const selector = frameSelector(shot);
  const blank: ShotRead = {
    ...shot,
    faults: [],
    hash: "",
    label: "",
    stats: { width: 0, height: 0, top: 0, matched: "0/0" },
  };
  const key = await page.evaluate(keyOf, selector);
  if (!key) {
    return { ...blank, faults: ["no such frame on the canvas"] };
  }
  const posed = await poseFrame(page, key, POSE_MS).then(
    () => null,
    (error: unknown) => refused(error)
  );
  if (posed) {
    return { ...blank, faults: [posed] };
  }
  const seen = await page.evaluate(identityOf, {
    selector,
    holds: shot.holds ?? null,
  });
  if (!seen) {
    return { ...blank, faults: ["the frame left the page"] };
  }
  const grid = await page.evaluate(gridOf, { selector, grid: GRID });
  const faults = faultsOf(
    shot,
    seen,
    grid,
    await page.evaluate(astrayOf, selector)
  );
  const picture = await framePicture(page, key).catch((error: unknown) =>
    refused(error)
  );
  if (typeof picture === "string") {
    return { ...blank, label: seen.label, faults: [...faults, picture] };
  }
  await mkdir(dirname(shot.path), { recursive: true });
  await writeFile(shot.path, picture.png);
  const png = PNG.sync.read(picture.png);
  const top = topShareOf(png);
  if (top >= UNIFORM) {
    faults.push(`one colour: ${(top * 100).toFixed(2)}% of it`);
  }
  const match = matchedOf(png, picture.read.scale, grid.points);
  if (match.read === 0 || match.hit < match.read * MATCH_SHARE) {
    faults.push(
      `the picture is not its DOM's paint: ${match.hit} of ${match.read} points match (${match.misses.join("; ")})`
    );
  }
  return {
    ...shot,
    faults,
    hash: createHash("md5").update(picture.png).digest("hex"),
    label: seen.label,
    stats: {
      width: png.width,
      height: png.height,
      top: Math.round(top * 1000) / 1000,
      matched: `${match.hit}/${match.read}`,
    },
  };
}

/**
 * Captures each shot from `page`, the canvas that draws its frames (one
 * states file or several, at the shots' widths and schemes), in order: a
 * shot whose window of time matters goes first. Each png is written to its
 * `path`; each read says what was wrong with it, if anything.
 */
export async function shootFrames(
  page: Page,
  shots: Shot[]
): Promise<ShotRead[]> {
  const reads: ShotRead[] = [];
  for (const shot of shots) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame on screen at a time
    reads.push(await shootOne(page, shot));
  }
  return reads;
}

/**
 * Holds a set of captures to their invariant in one leg named `leg`: every
 * shot without a fault, no light file byte-identical to its dark twin, and
 * no two files byte-identical. Returns whether it passed.
 */
export function checkShots(kit: Kit, leg: string, reads: ShotRead[]): boolean {
  const faults = reads.flatMap((one) =>
    one.faults.map(
      (fault) =>
        `${one.story}@${one.width}/${one.scheme} (${one.file}): ${fault}`
    )
  );
  const byHash = new Map<string, ShotRead[]>();
  for (const one of reads.filter((read) => read.hash)) {
    byHash.set(one.hash, [...(byHash.get(one.hash) ?? []), one]);
  }
  const twins: string[] = [];
  const same: string[] = [];
  for (const group of byHash.values()) {
    if (group.length < 2) {
      continue;
    }
    const names = group.map(
      (one) => `${one.file}:${one.story}@${one.width}/${one.scheme}`
    );
    const paired = group.some((a) =>
      group.some(
        (b) =>
          a !== b &&
          a.file === b.file &&
          a.story === b.story &&
          a.width === b.width &&
          a.scheme !== b.scheme
      )
    );
    (paired ? twins : same).push(names.join(" = "));
  }
  const ok =
    reads.length > 0 &&
    faults.length === 0 &&
    twins.length === 0 &&
    same.length === 0;
  return kit.check(
    leg,
    ok,
    ok
      ? `${reads.length} captures, each its own frame, none one colour, ${byHash.size} distinct files`
      : `${faults.length} faults: ${faults.slice(0, 8).join(" | ")}; light = dark: ${twins.slice(0, 4).join(" | ") || "none"}; byte-identical: ${same.slice(0, 4).join(" | ") || "none"}`
  );
}
