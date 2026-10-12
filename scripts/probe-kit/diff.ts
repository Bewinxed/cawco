/**
 * Regressions by pixel diff: a capture against the baseline the owner
 * approved, `baselines/web/<spec>/<name>.png`, with pixelmatch (Playwright's
 * visual comparison "uses the pixelmatch library": `threshold`, default 0.2,
 * and a count of pixels allowed to differ). Nothing here asks anyone to look:
 * a failed diff writes the region that changed, cropped, beside the capture
 * for a reviewer, and names its path.
 *
 * `--approve <spec>` writes the spec's captures as its baselines: the
 * orchestrator runs it, after the owner approves what they show. A capture
 * with no baseline yet is a note, written for that review, not a pass.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import pixelmatch from "pixelmatch";
import type { Page } from "playwright-core";
import { PNG } from "pngjs";
import type { Kit } from "./kit";

const BASELINES = join(import.meta.dir, "baselines", "web");

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
 * they stand (a seeked frame stays seeked) and the caret hidden.
 */
export async function diff(
  kit: Kit,
  page: Page,
  name: string,
  options: DiffOptions = {}
): Promise<void> {
  const shot = await page.screenshot({
    clip: options.clip,
    animations: "allow",
    caret: "hide",
  });
  const baseline = join(BASELINES, kit.spec, `${name}.png`);
  const capture = join(kit.out, `${name}.png`);
  await mkdir(dirname(capture), { recursive: true });
  await writeFile(capture, shot);
  if (kit.approve) {
    await mkdir(dirname(baseline), { recursive: true });
    await writeFile(baseline, shot);
    kit.note(`${name}: baseline approved (${baseline})`);
    return;
  }
  if (!existsSync(baseline)) {
    kit.note(
      `${name}: no approved baseline; capture for the owner's review at ${capture}`
    );
    return;
  }
  const want = PNG.sync.read(await readFile(baseline));
  const got = PNG.sync.read(shot);
  if (want.width !== got.width || want.height !== got.height) {
    kit.check(
      `${name} matches its baseline`,
      false,
      `size ${got.width}×${got.height}, baseline ${want.width}×${want.height}; capture ${capture}`
    );
    return;
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
    return;
  }
  const crop = join(kit.out, `${name}.diff.png`);
  await writeFile(crop, PNG.sync.write(cropToChange(out)));
  kit.check(
    `${name} matches its baseline`,
    false,
    `${differing} px differ (allowed ${allowed}); the region that changed: ${crop}`
  );
}

/** The diff image cut to the box round its changed (red) pixels, 8px of room. */
function cropToChange(img: PNG): PNG {
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
    return img;
  }
  x0 = Math.max(0, x0 - 8);
  y0 = Math.max(0, y0 - 8);
  x1 = Math.min(img.width - 1, x1 + 8);
  y1 = Math.min(img.height - 1, y1 + 8);
  const crop = new PNG({ width: x1 - x0 + 1, height: y1 - y0 + 1 });
  PNG.bitblt(img, crop, x0, y0, crop.width, crop.height, 0, 0);
  return crop;
}
