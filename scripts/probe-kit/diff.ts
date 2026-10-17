/**
 * Regressions by pixel diff: a capture against the baseline the owner
 * approved, `baselines/web/<spec>/<name>.png`, with pixelmatch (Playwright's
 * visual comparison "uses the pixelmatch library": `threshold`, default 0.2,
 * and a count of pixels allowed to differ). Nothing here asks anyone to look:
 * a failed diff writes the region that changed, cropped, beside the capture
 * for a reviewer, and names its path, and hands the change to the run for
 * the owner's review page (`--review`, review.ts).
 *
 * `--approve <spec>` writes the spec's captures as its baselines, and
 * `--approve <spec>:<name>,…` the captures named alone (`kit.approves`): the
 * orchestrator runs it, after the owner approves what they show. A capture
 * not named is held to its baseline as in any run. A capture with no
 * baseline yet is a note, written for that review, not a pass.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import pixelmatch from "pixelmatch";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import type { Kit } from "./kit";

export interface DiffOptions {
  /** The page region, css px; the viewport when left out. */
  clip?: { height: number; width: number; x: number; y: number };
  /** Pixels allowed to differ (pixelmatch's count). */
  maxDiffPixels?: number;
  /** pixelmatch's per-pixel threshold, 0 to 1. */
  threshold?: number;
}

/**
 * Captures `name` and holds it to its baseline: a PASS or FAIL line, or a
 * note where none is approved yet. Captured with the page's animations as
 * they stand (a seeked frame stays seeked) and the caret hidden. Says
 * whether the capture differs from its baseline.
 */
export async function diff(
  kit: Kit,
  page: Page,
  name: string,
  options: DiffOptions = {}
): Promise<boolean> {
  const shot = await page.screenshot({
    clip: options.clip,
    animations: "allow",
    caret: "hide",
  });
  const baseline = join(kit.baselines, `${name}.png`);
  const capture = join(kit.out, `${name}.png`);
  await mkdir(dirname(capture), { recursive: true });
  await writeFile(capture, shot);
  if (kit.approves(name)) {
    await mkdir(dirname(baseline), { recursive: true });
    await writeFile(baseline, shot);
    kit.note(`${name}: baseline approved (${baseline})`);
    return false;
  }
  if (!existsSync(baseline)) {
    kit.note(
      `${name}: no approved baseline; capture for the owner's review at ${capture}`
    );
    return false;
  }
  const want = PNG.sync.read(await readFile(baseline));
  const got = PNG.sync.read(shot);
  if (want.width !== got.width || want.height !== got.height) {
    kit.changed({ entry: name, baseline, capture, box: null });
    kit.check(
      `${name} matches its baseline`,
      false,
      `size ${got.width}×${got.height}, baseline ${want.width}×${want.height}; capture ${capture}`
    );
    return true;
  }
  const out = new PNG({ width: got.width, height: got.height });
  const differing = pixelmatch(
    want.data,
    got.data,
    out.data,
    got.width,
    got.height,
    { threshold: options.threshold ?? 0.1 }
  );
  const allowed = options.maxDiffPixels ?? 0;
  if (differing <= allowed) {
    kit.check(`${name} matches its baseline`, true, `${differing} px differ`);
    return false;
  }
  const box = changedBox(out, 8);
  const cut = new PNG({ width: box.width, height: box.height });
  PNG.bitblt(out, cut, box.x, box.y, box.width, box.height, 0, 0);
  const crop = join(kit.out, `${name}.diff.png`);
  await writeFile(crop, PNG.sync.write(cut));
  // The owner's review page (`--review`) cuts both pictures wider than this.
  kit.changed({ entry: name, baseline, capture, box: changedBox(out, 48) });
  kit.check(
    `${name} matches its baseline`,
    false,
    `${differing} px differ (allowed ${allowed}); the region that changed: ${crop}`
  );
  return true;
}

/**
 * The box round a pixelmatch diff image's changed (red) pixels with `room`
 * px round it, inside the image; the whole image when none changed.
 */
function changedBox(
  img: PNG,
  room: number
): { height: number; width: number; x: number; y: number } {
  let [x0, y0, x1, y1] = [img.width, img.height, -1, -1];
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      const k = (y * img.width + x) * 4;
      if (
        img.data[k] === 255 &&
        img.data[k + 1] === 0 &&
        img.data[k + 2] === 0
      ) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < 0) {
    return { x: 0, y: 0, width: img.width, height: img.height };
  }
  x0 = Math.max(0, x0 - room);
  y0 = Math.max(0, y0 - room);
  x1 = Math.min(img.width - 1, x1 + room);
  y1 = Math.min(img.height - 1, y1 + room);
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
