/**
 * The transcript's head blur on the web, captured and measured for the owner,
 * against a scratch hub holding one long transcript (seed-fleet.ts), with
 * this branch's dashboard and origin/main's both talking to it:
 *
 *   node artifacts/head-fade/web-capture.mjs <after url> <before url> <session id> <out dir>
 *
 * - stills: the tab strip and the top 240px of the pane, at 1440×900 and
 *   390×844 (2×), scrolled so a line of text sits across the transcript's top
 *   edge (~300px), after and before; after at scrollTop 0 too;
 * - sharpness: the band's rows, horizontal gradient energy with the blur on
 *   over the same rows with it hidden (1 = untouched, lower = blurred);
 * - frames: a wheel scroll down and back up, frame intervals from
 *   requestAnimationFrame and dropped frames from a CDP trace, after and
 *   before;
 * - video: the same scroll, recorded with a CDP screencast at real speed and
 *   resampled to 60fps MP4s cut to the still's region.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

// `--frames-only`: the frame trace alone, again, for its spread between runs.
const FRAMES_ONLY = process.argv.includes("--frames-only");
const [after, before, session, out] = process.argv
  .slice(2)
  .filter((a) => !a.startsWith("--"));
const CHROME =
  "/home/bewinxed/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];
const BUILDS = { after, before };
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

async function newPage(v, scale = 2) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: scale,
    isMobile: v.mobile,
    hasTouch: v.mobile,
  });
  return context.newPage();
}

/** Opens the session and waits for its last reply to be drawn. */
async function open(page, base) {
  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".tr")?.textContent?.includes("Step 12 is done"),
    null,
    { timeout: 90_000 }
  );
  await page.waitForTimeout(1500);
}

/** The tab strip over the transcript and the top 240px of the pane. */
function region(page) {
  return page.evaluate(() => {
    const tr = document.querySelector(".tr").getBoundingClientRect();
    const [strip] = [...document.querySelectorAll("[role=tablist]")]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.top < tr.top && b.right > tr.left)
      .sort((a, b) => b.top - a.top);
    const top = Math.max(0, Math.floor((strip?.top ?? tr.top) - 8));
    return {
      x: Math.floor(tr.left),
      y: top,
      width: Math.floor(tr.width),
      height: Math.ceil(tr.top + 240 - top),
    };
  });
}

/** Scrolls the transcript to `y` until it stays there. */
async function scrollTo(page, y) {
  for (let tries = 0; tries < 10; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each try reads where the last one rested
    await page.evaluate((to) => {
      document.querySelector(".tr").scrollTop = to;
    }, y);
    await page.waitForTimeout(500);
    const at = await page.evaluate(
      () => document.querySelector(".tr").scrollTop
    );
    if (Math.abs(at - y) < 2) {
      break;
    }
  }
  await page.waitForTimeout(500);
  return page.evaluate(() => ({
    scrollTop: Math.round(document.querySelector(".tr").scrollTop),
    layers: [...document.querySelectorAll(".head-fade .layer")].map(
      (e) => getComputedStyle(e).opacity
    ),
  }));
}

/** The scroll near `near` that sets a line of text's middle on the edge. */
async function lineOnEdge(page, near) {
  await scrollTo(page, near);
  return page.evaluate((target) => {
    const tr = document.querySelector(".tr");
    const edge = tr.getBoundingClientRect().top;
    const walker = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT);
    let best = target;
    let gap = Number.POSITIVE_INFINITY;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const middle = r.top + r.height / 2 - edge + tr.scrollTop;
        if (Math.abs(middle - target) < gap) {
          gap = Math.abs(middle - target);
          best = Math.round(middle);
        }
      }
    }
    return best;
  }, near);
}

/** Per-row horizontal gradient energy of a PNG, summed over bands of rows. */
function energy(page, png, rowsPerBand) {
  return page.evaluate(
    async ({ b64, rowsPerBand: per }) => {
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const g = c.getContext("2d");
      g.drawImage(bmp, 0, 0);
      const { data, width, height } = g.getImageData(
        0,
        0,
        bmp.width,
        bmp.height
      );
      const bands = [];
      for (let y0 = 0; y0 < height; y0 += per) {
        let sum = 0;
        for (let y = y0; y < Math.min(height, y0 + per); y += 1) {
          for (let x = 1; x < width; x += 1) {
            const i = (y * width + x) * 4;
            const j = i - 4;
            sum +=
              Math.abs(data[i] - data[j]) +
              Math.abs(data[i + 1] - data[j + 1]) +
              Math.abs(data[i + 2] - data[j + 2]);
          }
        }
        bands.push(sum);
      }
      return bands;
    },
    { b64: png.toString("base64"), rowsPerBand }
  );
}

const edgeAt = {};
const report = { stills: [], sharpness: {}, frames: {}, videos: [] };

// ── Stills and sharpness ────────────────────────────────────────────────
for (const v of FRAMES_ONLY ? [] : VIEWPORTS) {
  for (const [label, base] of Object.entries(BUILDS)) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each width in turn
    const page = await newPage(v);
    await open(page, base);
    const clip = await region(page);
    edgeAt[v.name] ??= await lineOnEdge(page, 300);
    const states =
      label === "after"
        ? [
            ["top", 0],
            ["scrolled", edgeAt[v.name]],
          ]
        : [["scrolled", edgeAt[v.name]]];
    for (const [state, y] of states) {
      // biome-ignore lint/performance/noAwaitInLoops: each frame scrolls the one page
      const seen = await scrollTo(page, y);
      const file = join(out, `${label}-${v.name}-${state}.png`);
      await page.screenshot({ path: file, clip });
      report.stills.push({ file, ...seen });
      console.log(
        `${file}: scrollTop ${seen.scrollTop}, layer opacity ${seen.layers.join("/") || "none"}`
      );
    }
    if (label === "after") {
      // The band and 8px under it, blur on and hidden, at the edge scroll
      // and at the very top.
      const band = await page.evaluate(() => {
        const r = document.querySelector(".tr").getBoundingClientRect();
        return { x: r.left, y: r.top, width: r.width, height: 32 };
      });
      const hide = await page.addStyleTag({ content: "/* blur on */" });
      const measure = async () => {
        await hide.evaluate((s) => {
          s.textContent = "";
        });
        await page.waitForTimeout(200);
        const on = await page.screenshot({ clip: band });
        await hide.evaluate((s) => {
          s.textContent = ".head-fade{display:none!important}";
        });
        await page.waitForTimeout(200);
        const off = await page.screenshot({ clip: band });
        // 4 CSS px per band of rows at 2×.
        const [a, b] = [await energy(page, on, 8), await energy(page, off, 8)];
        return a.map((e, i) => (b[i] ? +(e / b[i]).toFixed(3) : null));
      };
      await scrollTo(page, edgeAt[v.name]);
      const scrolled = await measure();
      await scrollTo(page, 0);
      const top = await measure();
      report.sharpness[v.name] = { scrolled, top };
      console.log(
        `sharpness ${v.name} (per 4px from the edge, blur on / off): scrolled ${scrolled.join(" ")}; top ${top.join(" ")}`
      );
    }
    await page.context().close();
  }
}

// ── The scroll: frames, trace and video ─────────────────────────────────
/** Wheels the transcript from the top down `px` and back, ~4px a frame. */
async function wheelScroll(page, px) {
  const middle = await page.evaluate(() => {
    const b = document.querySelector(".tr").getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(middle.x, middle.y);
  const steps = Math.round(px / 6);
  for (const dir of [1, -1]) {
    for (let i = 0; i < steps; i += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one wheel step a frame apart
      await page.mouse.wheel(0, dir * 6);
      await page.waitForTimeout(12);
    }
    await page.waitForTimeout(400);
  }
}

/** A trace's frames: each PipelineReporter's state (presented, dropped, …),
    presented frames whose pipeline ran over 16.7ms, and the gaps between the
    compositor's draws while the scroll moved (over 16.7ms: a missed vsync). */
function framesOf(events) {
  const states = {};
  let long = 0;
  const begun = new Map();
  for (const e of events) {
    if (e.name !== "PipelineReporter") {
      continue;
    }
    const id = e.id2?.local ?? e.id;
    if (e.ph === "b") {
      begun.set(id, e);
    } else if (e.ph === "e" && begun.has(id)) {
      const b = begun.get(id);
      const state = b.args?.frame_reporter?.state ?? "unknown";
      states[state] = (states[state] ?? 0) + 1;
      if (state === "STATE_PRESENTED_ALL" && (e.ts - b.ts) / 1000 > 16.7) {
        long += 1;
      }
    }
  }
  const draws = events
    .filter((e) => e.name === "DrawFrame" && e.ph !== "e")
    .map((e) => e.ts / 1000)
    .sort((a, b) => a - b);
  const gaps = draws.slice(1).map((t, i) => t - draws[i]);
  return {
    states,
    presentedPipelineOver16_7ms: long,
    draws: draws.length,
    drawGapsOver16_7ms: gaps.filter((g) => g > 16.7 + 0.5 && g < 200).length,
  };
}

async function traced(page, run) {
  const cdp = await page.context().newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", ({ value }) => events.push(...value));
  const done = new Promise((settle) =>
    cdp.once("Tracing.tracingComplete", settle)
  );
  await cdp.send("Tracing.start", {
    categories:
      "devtools.timeline,disabled-by-default-devtools.timeline.frame,benchmark,rail",
    transferMode: "ReportEvents",
  });
  await page.evaluate(() => {
    window.__deltas = [];
    let last = performance.now();
    const tick = (t) => {
      window.__deltas.push(t - last);
      last = t;
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });
  await run();
  const deltas = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__deltas.slice(1);
  });
  await cdp.send("Tracing.end");
  await done;
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    rafFrames: deltas.length,
    rafOver16_7ms: deltas.filter((d) => d > 16.7 + 0.5).length,
    rafOver33ms: deltas.filter((d) => d > 33.4).length,
    rafP95ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
    ...framesOf(events),
  };
}

async function screencast(page, run, name, clip, viewportWidth) {
  const cdp = await page.context().newCDPSession(page);
  // Absolute: ffmpeg's concat list resolves its paths from its own folder.
  const dir = resolve(out, `.${name}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: metadata.timestamp });
    await cdp
      .send("Page.screencastFrameAck", { sessionId })
      .catch(() => undefined);
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(500);
  await run();
  await cdp.send("Page.stopScreencast");
  // Each frame held until the next one arrived: the scroll at its own speed.
  const list = frames
    .map((f, i) => {
      const next = frames[i + 1]?.t ?? f.t + 0.5;
      return `file '${f.file}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}`;
    })
    .join("\n");
  writeFileSync(
    join(dir, "list.txt"),
    `${list}\nfile '${frames.at(-1).file}'\n`
  );
  const file = join(out, `${name}.mp4`);
  // The frames' own pixels per CSS pixel: headless casts CSS pixels, 1×.
  const width = Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width",
      "-of",
      "csv=p=0",
      frames[0].file,
    ]).toString()
  );
  const scale = width / viewportWidth;
  const crop = `crop=${clip.width * scale}:${clip.height * scale}:${clip.x * scale}:${clip.y * scale}`;
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    join(dir, "list.txt"),
    "-vf",
    `${crop},fps=60,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "60",
    file,
  ]);
  rmSync(dir, { recursive: true, force: true });
  report.videos.push({ file, frames: frames.length });
  console.log(`${file}: ${frames.length} screencast frames`);
}

for (const v of VIEWPORTS) {
  for (const [label, base] of Object.entries(BUILDS)) {
    // The trace on a page of its own: a screencast adds work to every frame.
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, so the trace measures one scroll
    const page = await newPage(v);
    await open(page, base);
    // One scroll first, not measured: a fresh page's first scroll misses
    // vsyncs with or without the blur (0 layers: 2, 4, 2; 4 layers: 10, 2,
    // 2, the 10 on the first page), and the build measured first took it.
    await scrollTo(page, 0);
    await wheelScroll(page, 480);
    await scrollTo(page, 0);
    const frames = await traced(page, () => wheelScroll(page, 480));
    report.frames[`${label}-${v.name}`] = frames;
    console.log(`frames ${label}-${v.name}: ${JSON.stringify(frames)}`);
    if (!FRAMES_ONLY) {
      const clip = await region(page);
      await scrollTo(page, 0);
      await screencast(
        page,
        () => wheelScroll(page, 360),
        `${label}-${v.name}-scroll`,
        clip,
        v.width
      );
    }
    await page.context().close();
  }
}

if (!FRAMES_ONLY) {
  writeFileSync(
    join(out, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`
  );
}
await browser.close();
