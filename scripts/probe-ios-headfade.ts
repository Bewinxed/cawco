#!/usr/bin/env bun
/**
 * Measures the iOS transcript's head band in captures probe-ios-catchup.ts
 * wrote: the rows' ink through the top `Size.cHeadFade` (24pt) of the list.
 *
 *   bun scripts/probe-ios-headfade.ts <capture dir>
 *
 * For each pixel row of the list it takes the ink: the largest difference in
 * luminance from the list's ground (its most common colour below the band),
 * signed toward the rows' own ink. With rows under the edge (head-light,
 * head-dark), the band fades them: no pixel row in it carries more ink than
 * the ramp (distance from the edge / 24pt) allows of the rows' full ink
 * below the band, the top 2pt carry next to none, its ground is the list's
 * ground (nothing painted, no tint), and no pixel in it goes past the ground
 * the other way (brighter than the ground in light, darker in dark: a tint).
 * At the very top (top-light, top-dark) the band is absent: the ink in it
 * reaches the rows' full ink.
 *
 * Prints PASS/FAIL per check and each band's profile; exits 0 when all pass.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , dir] = process.argv;
if (!dir) {
  console.error("usage: probe-ios-headfade.ts <capture dir>");
  process.exit(2);
}
/** Size.cHeadFade. */
const BAND = 24;

interface Image {
  pixel: (x: number, y: number) => [number, number, number];
  width: number;
}
/**
 * A capture's pixels: the PNG turned into an uncompressed BMP by `sips` (the
 * Mac's own), whose rows are read as they lie, bottom row first unless its
 * height is negative, 3 or 4 bytes a pixel in BGR order.
 */
function picture(file: string): Image {
  const scratch = mkdtempSync(join(tmpdir(), "headfade-"));
  const bmp = join(scratch, "capture.bmp");
  try {
    const run = Bun.spawnSync([
      "sips",
      "-s",
      "format",
      "bmp",
      file,
      "--out",
      bmp,
    ]);
    if (run.exitCode !== 0) {
      throw new Error(`sips ${file}: ${run.stderr.toString().trim()}`);
    }
    const data = readFileSync(bmp);
    const offset = data.readUInt32LE(10);
    const width = data.readInt32LE(18);
    const rows = data.readInt32LE(22);
    const bytes = data.readUInt16LE(28) / 8;
    const stride = Math.ceil((width * bytes) / 4) * 4;
    const height = Math.abs(rows);
    return {
      width,
      pixel: (x, y) => {
        const line = rows > 0 ? height - 1 - y : y;
        const i = offset + line * stride + x * bytes;
        return [data[i + 2], data[i + 1], data[i]];
      },
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}
/** The list's frame (points) and the screen's width, off the describe-ui tree saved beside a capture. */
function listFrame(file: string): { list: Frame; screen: number } {
  const tree = JSON.parse(readFileSync(file, "utf8"));
  let list: Frame | undefined;
  let screen = 0;
  const walk = (at: unknown) => {
    if (Array.isArray(at)) {
      for (const child of at) {
        walk(child);
      }
      return;
    }
    if (!at || typeof at !== "object") {
      return;
    }
    const o = at as Record<string, unknown>;
    const frame = o.frame as Frame | undefined;
    if (frame && !screen) {
      screen = frame.width;
    }
    if (o.AXLabel === "Session transcript" && frame && !list) {
      list = frame;
    }
    walk(o.children);
  };
  walk(tree);
  if (!list) {
    throw new Error(`${file}: no "Session transcript" element`);
  }
  return { list, screen };
}

const luminance = ([r, g, b]: [number, number, number]) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

/** The band of one capture: each pixel row's ink, the full ink below, the ground's colour in and below it. */
function measure(name: string) {
  const image = picture(join(dir, `${name}.png`));
  const { list, screen } = listFrame(join(dir, `${name}.json`));
  const scale = image.width / screen;
  const left = Math.round((list.x + 16) * scale);
  const right = Math.round((list.x + list.width - 16) * scale);
  const top = Math.round(list.y * scale);
  const band = Math.round(BAND * scale);
  const below = Math.round(Math.min(list.height - BAND, 240) * scale);
  // The ground: the most common colour under the band.
  const counts = new Map<string, number>();
  for (let y = top + band; y < top + band + below; y += 1) {
    for (let x = left; x < right; x += 3) {
      const key = image.pixel(x, y).join(",");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const [[groundKey]] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const ground = groundKey.split(",").map(Number) as [number, number, number];
  const groundL = luminance(ground);
  const dark = groundL < 128;
  /** Signed toward ink: positive is ink (darker in light, lighter in dark), negative past the ground. */
  const inkOf = (x: number, y: number) => {
    const l = luminance(image.pixel(x, y));
    return dark ? l - groundL : groundL - l;
  };
  const rowInk = (y: number) => {
    let most = 0;
    let least = 0;
    for (let x = left; x < right; x += 1) {
      const ink = inkOf(x, y);
      most = Math.max(most, ink);
      least = Math.min(least, ink);
    }
    return { most, least };
  };
  let full = 0;
  for (let y = top + band; y < top + band + below; y += 1) {
    full = Math.max(full, rowInk(y).most);
  }
  const rows: { at: number; most: number; least: number }[] = [];
  for (let y = top; y < top + band; y += 1) {
    rows.push({ at: (y - top) / scale, ...rowInk(y) });
  }
  // The band's ground: its most common colour.
  const inBand = new Map<string, number>();
  for (let y = top; y < top + band; y += 1) {
    for (let x = left; x < right; x += 3) {
      const key = image.pixel(x, y).join(",");
      inBand.set(key, (inBand.get(key) ?? 0) + 1);
    }
  }
  const [[bandGround]] = [...inBand.entries()].sort((a, b) => b[1] - a[1]);
  return { rows, full, ground: groundKey, bandGround, dark };
}

const profile = (rows: { at: number; most: number }[], full: number) =>
  rows
    .filter((_, i) => i % 3 === 0)
    .map(
      (row) =>
        `${row.at.toFixed(1)}pt ${(row.most / Math.max(1, full)).toFixed(2)}`
    )
    .join(" · ");

for (const name of ["head-light", "head-dark"]) {
  const m = measure(name);
  console.log(
    `\n${name}: ground ${m.ground}, band ground ${m.bandGround}, full ink ${m.full.toFixed(1)}`
  );
  console.log(
    `  ink / full by distance from the edge: ${profile(m.rows, m.full)}`
  );
  const over = m.rows.filter(
    (row) => row.most > (row.at / BAND) * m.full + 0.08 * m.full
  );
  check(
    `${name}: the ink falls toward the edge, within the ramp`,
    over.length === 0,
    over.length === 0
      ? `every pixel row's ink ≤ (distance / ${BAND}pt) × full + 8%`
      : `${over.length} pixel rows over the ramp: ${over
          .slice(0, 6)
          .map(
            (row) => `${row.at.toFixed(1)}pt ${(row.most / m.full).toFixed(2)}`
          )
          .join(", ")}`
  );
  const edge = m.rows.filter((row) => row.at < 2);
  const edgeMost = Math.max(...edge.map((row) => row.most));
  check(
    `${name}: next to no ink at the edge`,
    edgeMost <= 0.1 * m.full,
    `the top 2pt carry ${(edgeMost / m.full).toFixed(2)} of the full ink`
  );
  const ground = m.ground.split(",").map(Number);
  const bandGround = m.bandGround.split(",").map(Number);
  const drift = Math.max(
    ...ground.map((value, i) => Math.abs(value - bandGround[i]))
  );
  check(
    `${name}: nothing painted over the rows (the band's ground is the list's)`,
    drift <= 2,
    `band ground ${m.bandGround} vs ${m.ground}: ${drift} apart`
  );
  const past = Math.min(...m.rows.map((row) => row.least));
  check(
    `${name}: never brighter than the rows below (nothing past the ground)`,
    past >= -3,
    `the furthest any pixel in the band goes past the ground: ${(-past).toFixed(1)} of luminance (${m.dark ? "darker" : "brighter"})`
  );
}

for (const name of ["top-light", "top-dark"]) {
  const m = measure(name);
  const most = Math.max(...m.rows.map((row) => row.most));
  console.log(`\n${name}: ground ${m.ground}, full ink ${m.full.toFixed(1)}`);
  console.log(
    `  ink / full by distance from the edge: ${profile(m.rows, m.full)}`
  );
  check(
    `${name}: absent at the very top (the band's ink reaches full)`,
    most >= 0.9 * m.full,
    `the most ink in the band ${(most / m.full).toFixed(2)} of full`
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
