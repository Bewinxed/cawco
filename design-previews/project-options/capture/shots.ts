/// <reference lib="dom" />
/**
 * Captures every option of every part for the decision page:
 *
 *   bun design-previews/project-options/capture/shots.ts
 *
 * Each option's frame (frame.html, its views.ts choice) at the widths its
 * pick shows at (Desk 1440 × 900, his window 1037 × 760, Phone 390 × 844),
 * at DPR 1, the screen alone, into `captures/<part>-<option>-<width>.png`;
 * and Today once per width, the live captures themselves (today/), scaled
 * to DPR 1. It writes `captures/manifest.json`: part, option, width, file
 * and one plain caption per capture. A pick's option that is the very
 * picture another pick's option already is (the default page is H1, D2 and
 * Caw idle at once) is not written twice: its entry names the one file and
 * says so in its caption.
 *
 *   SHOTS_ONLY='^(s-s|today-1440)' bun design-previews/project-options/capture/shots.ts
 *
 * re-shoots only the files whose names match, keeps the others as they are,
 * and writes the whole manifest again (every caption from views.ts).
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, normalize, resolve } from "node:path";
import { chromium } from "playwright-core";
import {
  FRAME_DEFAULTS,
  OPTION_VIEWS,
  TODAY_CAPTION,
  TODAY_WIDTHS,
} from "../views";

const DIR = resolve(import.meta.dir, "..");
const OUT = join(DIR, "captures");
const HEIGHT: Record<string, number> = { 1440: 900, 1037: 760, 390: 844 };
/** A file name's part of a pick's or option's name: "Pane placement" → "pane-placement", "(a)" → "a". */
const slug = (words: string) =>
  words
    .toLowerCase()
    .replace(/′/g, "-prime")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = normalize(join(DIR, path));
    if (!file.startsWith(DIR)) {
      return new Response("no", { status: 403 });
    }
    const body = Bun.file(file);
    return (await body.exists()) ? new Response(body) : new Response("not found", { status: 404 });
  },
});
const only = process.env.SHOTS_ONLY ? new RegExp(process.env.SHOTS_ONLY) : null;
const shoots = (file: string) => !only || only.test(file);
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
try {
  if (!only) {
    await rm(OUT, { recursive: true, force: true });
  }
  await mkdir(OUT, { recursive: true });
  const manifest: {
    caption: string;
    file: string;
    option: string;
    part: string;
    frame?: string;
    sameAs?: string;
    width: number;
  }[] = [];
  let n = 0;
  for (const view of OPTION_VIEWS) {
    for (const width of view.widths) {
      const file = `${slug(view.part)}-${slug(view.option)}-${width}.png`;
      const entry = {
        part: view.part,
        option: view.option,
        width: Number(width),
        file,
        caption: view.caption[width] ?? "",
        frame: JSON.stringify(Object.entries({ ...FRAME_DEFAULTS, ...view.choice, w: width }).sort()),
      };
      manifest.push(entry);
      if (!shoots(file)) {
        continue;
      }
      const page = await browser.newPage({
        viewport: { width: Number(width), height: HEIGHT[width] ?? 900 },
        deviceScaleFactor: 1,
        hasTouch: width === "390",
      });
      const hash = new URLSearchParams({ ...view.choice, w: width }).toString();
      n += 1;
      await page.goto(`http://127.0.0.1:${server.port}/frame.html?n=${n}#${hash}`);
      await page.waitForFunction(() => "ready" in document.documentElement.dataset);
      // The retry clock and the live dots settle to one moment before the picture.
      await page.waitForTimeout(400);
      await page.screenshot({ path: join(OUT, file) });
      await page.close();
    }
  }
  for (const width of TODAY_WIDTHS) {
    const file = `today-${width}.png`;
    manifest.push({ part: "Today", option: "Today", width: Number(width), file, caption: TODAY_CAPTION[width] });
    if (!shoots(file)) {
      continue;
    }
    // The live captures are 2×: shown at the page's own size, the screen alone at DPR 1.
    const page = await browser.newPage({
      viewport: { width: Number(width), height: HEIGHT[width] ?? 900 },
      deviceScaleFactor: 1,
    });
    await page.goto(`http://127.0.0.1:${server.port}/frame.html?today=${width}#w=${width}&today=1`);
    await page.waitForFunction(() => "ready" in document.documentElement.dataset);
    await page.screenshot({ path: join(OUT, file) });
    await page.close();
  }
  const seen = new Map<string, (typeof manifest)[number]>();
  for (const one of manifest) {
    // A twin is the same frame (the same choice once the frame's defaults fill it) or the same bytes.
    const sum =
      one.frame ??
      createHash("md5")
        .update(await readFile(join(OUT, one.file)))
        .digest("hex");
    const twin = seen.get(sum);
    if (twin) {
      await rm(join(OUT, one.file), { force: true });
      one.file = twin.file;
      one.sameAs = `${twin.part} ${twin.option}`;
      one.caption = `${one.caption} (The same picture as ${twin.part} ${twin.option} at ${twin.width}.)`;
    } else {
      seen.set(sum, one);
    }
  }
  console.log(`${seen.size} distinct pictures`);
  for (const one of manifest) {
    one.frame = undefined;
  }
  await writeFile(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`captured ${manifest.length} pictures into captures/`);
} finally {
  await browser.close();
  server.stop(true);
}
