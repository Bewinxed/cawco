/**
 * The preview's proof, read from the engine: every document (the page at
 * 390, 680 and 1440; each desk frame at 1440 × 900; each phone frame at
 * 390 × 844), every state including the stretched ones, swept for
 *  - a box past the viewport's inline edges,
 *  - a box past its clipping ancestor (along the inline axis always; along
 *    the block axis unless that ancestor scrolls),
 *  - text cut with no ellipsis (scrollWidth past clientWidth),
 *  - text overlapping other text,
 * each in light and in dark; then the bar's glass group, BarGroup's own
 * (every item's box, the gaps, the glyphs: Files on its siblings' line and
 * at the machines' symbol size to 0.5px, its count inside its own box), the
 * folder's ink drawn from its SVG against the count (0 pixels shared), the
 * floating panels (inside the viewport, apart), the transcript's box in
 * every desk document (never moved), the selection pill on the chosen row,
 * the phone sheet's computed transform at mid-pull, and its segments (one
 * list at a time, each segment its count or its hits, pressed in turn).
 * With `--shots <dir>` it also captures every document, light and dark.
 *
 *   node files-preview/sweep.mjs <base url> [--shots <dir>]
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [, , base, flag, shotsDir] = process.argv;
const shots = flag === "--shots" ? shotsDir : null;

const FILLS = [
  "typical",
  "longname",
  "long",
  "noartifacts",
  "noattachments",
  "empty",
  "loading",
  "failed",
  "faileddetails",
];

const docs = [];
for (const width of [390, 680, 1440]) {
  docs.push({
    name: `page-${width}`,
    url: "./",
    width,
    height: 900,
    page: true,
  });
}
for (const width of [1440, 680]) {
  for (const count of ["beside", "mark"]) {
    for (const stage of ["closed", "open", "picked"]) {
      docs.push({
        name: `desk${width}-${stage}-count-${count}`,
        url: `./?frame=desk&stage=${stage}&count=${count}`,
        width,
        height: 900,
        desk: true,
      });
    }
  }
  for (const fill of FILLS.slice(1)) {
    for (const stage of ["open", "picked"]) {
      docs.push({
        name: `desk${width}-${stage}-${fill}`,
        url: `./?frame=desk&stage=${stage}&fill=${fill}`,
        width,
        height: 900,
        desk: true,
      });
    }
  }
  for (const q of ["pricing", "invoice"]) {
    docs.push({
      name: `desk${width}-open-search-${q}`,
      url: `./?frame=desk&stage=open&q=${q}`,
      width,
      height: 900,
      desk: true,
    });
  }
  docs.push({
    name: `desk${width}-open-long-search-pricing`,
    url: "./?frame=desk&stage=open&fill=long&q=pricing",
    width,
    height: 900,
    desk: true,
  });
}
for (const count of ["beside", "mark"]) {
  docs.push({
    name: `bar-count-${count}`,
    url: `./?frame=bar&count=${count}`,
    width: 1440,
    height: 44,
  });
  docs.push({
    name: `phone-closed-count-${count}`,
    url: `./?frame=phone&pull=closed&count=${count}`,
    width: 390,
    height: 844,
  });
}
docs.push({
  name: "phone-open",
  url: "./?frame=phone&pull=open",
  width: 390,
  height: 844,
  phone: true,
});
docs.push({
  name: "phone-open-search-pricing",
  url: "./?frame=phone&pull=open&q=pricing",
  width: 390,
  height: 844,
});
for (const fill of FILLS.slice(1)) {
  docs.push({
    name: `phone-open-${fill}`,
    url: `./?frame=phone&pull=open&fill=${fill}`,
    width: 390,
    height: 844,
  });
}

/** Runs in the page: every finding, as a line. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page.evaluate ships this one function alone, so its checks cannot live in helpers outside it
function sweep() {
  const found = [];
  const vw = document.documentElement.clientWidth;
  const EPS = 0.5;
  const shown = (el) => {
    // A shut hung card stays mounted, inert, up behind its cut: not drawn.
    if (el.closest("[aria-hidden='true'], [hidden], [inert]")) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") {
      return false;
    }
    const r = el.getBoundingClientRect();
    // sr-only: a 1px clipped box.
    return r.width > 1 && r.height > 1;
  };
  const label = (el) => {
    const id = el.id ? `#${el.id}` : "";
    const cls = [...el.classList]
      .filter((c) => !c.startsWith("svelte-"))
      .slice(0, 2)
      .join(".");
    const text = (el.textContent ?? "").trim().slice(0, 30);
    return `${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} "${text}"`;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n instanceof Element; n = n.parentElement) {
      o *= Number(getComputedStyle(n).opacity);
    }
    return o;
  };
  const all = [...document.body.querySelectorAll("*")].filter(
    (el) =>
      !(el instanceof SVGElement && !(el instanceof SVGSVGElement)) && shown(el)
  );
  for (const el of all) {
    const r = el.getBoundingClientRect();
    // A surface mid-gesture (the split's slide, the sheet's pull) stands
    // partly past its pane or the screen by design: what it holds is
    // checked against the surface's own box instead.
    const moving = el.closest("[data-opening], [data-pulling]");
    const surface = moving?.hasAttribute("data-opening")
      ? moving.firstElementChild
      : moving;
    const bound = surface
      ? surface.getBoundingClientRect()
      : { left: 0, right: vw };
    // A frame showing part of its document (Frame `view`) stands its
    // document past its box by design.
    if (moving === el || surface === el || el.matches("[data-view] > iframe")) {
      continue;
    }
    if (r.left < bound.left - EPS || r.right > bound.right + EPS) {
      found.push(
        `past the ${moving ? "moving surface" : "viewport"}: ${label(el)} [${r.left.toFixed(1)}, ${r.right.toFixed(1)}] of [${bound.left.toFixed(1)}, ${bound.right.toFixed(1)}]`
      );
    }
    if (moving) {
      continue;
    }
    for (
      let a = el.parentElement;
      a && a !== document.body;
      a = a.parentElement
    ) {
      const s = getComputedStyle(a);
      const clipsX = s.overflowX !== "visible";
      const clipsY = s.overflowY !== "visible";
      if (!(clipsX || clipsY)) {
        continue;
      }
      const c = a.getBoundingClientRect();
      const scrollsY = s.overflowY === "auto" || s.overflowY === "scroll";
      if (clipsX && (r.left < c.left - EPS || r.right > c.right + EPS)) {
        found.push(`past its container: ${label(el)} in ${label(a)}`);
      }
      if (
        clipsY &&
        !scrollsY &&
        (r.top < c.top - EPS || r.bottom > c.bottom + EPS)
      ) {
        found.push(`past its container (block): ${label(el)} in ${label(a)}`);
      }
      break;
    }
  }
  // Text: the elements holding words directly.
  const texts = all.filter(
    (el) =>
      [...el.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent.trim()
      ) && opacityOf(el) > 0.01
  );
  for (const el of texts) {
    const s = getComputedStyle(el);
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      s.textOverflow !== "ellipsis" &&
      s.overflowX !== "visible" &&
      el.tagName !== "PRE"
    ) {
      found.push(`cut with no ellipsis: ${label(el)}`);
    }
  }
  // Words overlapping words: the boxes of each text run (Range rects), cut
  // to every box that clips them (a truncated name's own span first), since
  // a range measures a run whole, past its ellipsis.
  const clipOf = (el) => {
    let box = { left: -1e9, right: 1e9, top: -1e9, bottom: 1e9 };
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX !== "visible" || s.overflowY !== "visible") {
        const c = a.getBoundingClientRect();
        box = {
          left: Math.max(box.left, c.left),
          right: Math.min(box.right, c.right),
          top: Math.max(box.top, c.top),
          bottom: Math.min(box.bottom, c.bottom),
        };
      }
    }
    return box;
  };
  const runs = [];
  for (const el of texts) {
    const clip = clipOf(el);
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const raw of range.getClientRects()) {
        const rect = {
          left: Math.max(raw.left, clip.left),
          right: Math.min(raw.right, clip.right),
          top: Math.max(raw.top, clip.top),
          bottom: Math.min(raw.bottom, clip.bottom),
        };
        if (rect.right - rect.left > 0.5 && rect.bottom - rect.top > 0.5) {
          runs.push({ el, rect });
        }
      }
    }
  }
  // A run under a scroller only counts where the scroller shows it.
  const visibleIn = (run) => {
    for (let a = run.el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowY === "auto" || s.overflowY === "scroll") {
        const c = a.getBoundingClientRect();
        return run.rect.bottom > c.top && run.rect.top < c.bottom;
      }
    }
    return true;
  };
  const live = runs.filter(visibleIn);
  for (let i = 0; i < live.length; i += 1) {
    for (let j = i + 1; j < live.length; j += 1) {
      const a = live[i];
      const b = live[j];
      if (a.el === b.el) {
        continue;
      }
      const w =
        Math.min(a.rect.right, b.rect.right) -
        Math.max(a.rect.left, b.rect.left);
      const h =
        Math.min(a.rect.bottom, b.rect.bottom) -
        Math.max(a.rect.top, b.rect.top);
      if (w > 1 && h > 1) {
        // A sticky head over the rows scrolled under it is the design.
        const sticky = (el) => el.closest(".files-head");
        if (sticky(a.el) || sticky(b.el)) {
          const other = sticky(a.el) ? b.el : a.el;
          if (
            !sticky(other) &&
            other.closest("[data-files-scroll]")?.scrollTop > 0
          ) {
            continue;
          }
        }
        found.push(`text over text: ${label(a.el)} × ${label(b.el)}`);
      }
    }
  }
  return found;
}

// `ONLY=<pattern>` sweeps just the documents whose names match it.
if (process.env.ONLY) {
  const only = new RegExp(process.env.ONLY);
  docs.splice(0, docs.length, ...docs.filter((doc) => only.test(doc.name)));
}
const browser = await chromium.launch();
let total = 0;
const report = [];
/** The transcript's box in each desk document, which Files must never move. */
const transcripts = [];
for (const doc of docs) {
  // biome-ignore lint/performance/noAwaitInLoops: one document at a time, each in its own context, so no capture reads another's layout
  const context = await browser.newContext({
    viewport: { width: doc.width, height: doc.height },
    colorScheme: "light",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(`console error: ${m.text()}`);
    }
  });
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  await page.goto(new URL(doc.url, base).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const found = [...errors];
  const extra = {};
  // vaul's drawer settles over 0.5s.
  const phoneSettle = doc.url.includes("frame=phone") ? 800 : 450;
  const settle = doc.page ? 1200 : phoneSettle;
  for (const scheme of ["light", "dark"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one page, its schemes in turn
    await page.emulateMedia({ colorScheme: scheme });
    await page.evaluate(() => {
      for (const s of document.querySelectorAll("[data-files-scroll]")) {
        s.scrollTop = 0;
      }
    });
    await page.waitForTimeout(settle);
    found.push(...(await page.evaluate(sweep)).map((f) => `(${scheme}) ${f}`));
    // A long list's foot: scrolled to its end and swept again.
    if (doc.url.includes("fill=long")) {
      await page.evaluate(() => {
        for (const s of document.querySelectorAll("[data-files-scroll]")) {
          s.scrollTop = s.scrollHeight;
        }
      });
      await page.waitForTimeout(150);
      found.push(
        ...(await page.evaluate(sweep)).map((f) => `(${scheme}, scrolled) ${f}`)
      );
      await page.evaluate(() => {
        for (const s of document.querySelectorAll("[data-files-scroll]")) {
          s.scrollTop = 0;
        }
      });
      await page.waitForTimeout(150);
    }
    const read = await page.evaluate(geometry);
    found.push(...read.findings.map((f) => `(${scheme}) ${f}`));
    const drawnInk = await page.evaluate(ink);
    if (drawnInk) {
      read.facts.ink = drawnInk;
      if (drawnInk.overlapPx > 0) {
        found.push(
          `(${scheme}) the count covers ${drawnInk.overlapPx} of the folder's ink pixels: ${JSON.stringify(drawnInk)}`
        );
      }
    }
    extra[scheme] = read.facts;
    if (shots && !(doc.page && doc.width === 680)) {
      mkdirSync(shots, { recursive: true });
      await page.screenshot({
        path: join(shots, `${doc.name}-${scheme}.png`),
        fullPage: !!doc.page,
      });
    }
  }
  if (extra.light?.transcript) {
    transcripts.push({
      name: doc.name,
      width: doc.width,
      rect: extra.light.transcript,
    });
  }
  // The phone's one list at a time: the segmented control under the search,
  // the chosen list filling the sheet, the other a press away; each segment
  // says its count, and while searching its hits.
  if (doc.url.includes("frame=phone&pull=open")) {
    const read = () =>
      page.evaluate(() => {
        const sheet = document
          .querySelector("[data-files-sheet]")
          ?.getBoundingClientRect();
        const list = document.querySelector(
          "[data-files-segment]"
        )?.parentElement;
        const shown = [
          ...document.querySelectorAll("[data-files-region]"),
        ].filter((r) => !r.hidden);
        const scroll = shown[0]?.querySelector("[data-files-scroll]");
        const box = (r) => [+r.top.toFixed(1), +r.bottom.toFixed(1)];
        return {
          segments: [...document.querySelectorAll("[data-files-segment]")].map(
            (segment) => ({
              name: segment.dataset.filesSegment,
              state: segment.dataset.state,
              words: segment.textContent.replace(/\s+/g, " ").trim(),
              w: +segment.getBoundingClientRect().width.toFixed(1),
            })
          ),
          shown: shown.map((r) => r.dataset.filesRegion),
          list: list && box(list.getBoundingClientRect()),
          pane: shown[0] && box(shown[0].getBoundingClientRect()),
          sheet: sheet && box(sheet),
          scroll: scroll && {
            scrollHeight: scroll.scrollHeight,
            clientHeight: scroll.clientHeight,
          },
        };
      });
    const before = await read();
    const segmented = { before };
    if (before.segments.length === 2) {
      await page.locator("[data-files-segment='attachments']").click();
      await page.waitForTimeout(400);
      segmented.attachments = await read();
      await page.locator("[data-files-segment='artifacts']").click();
      await page.waitForTimeout(400);
      segmented.back = await read();
    }
    const s = segmented;
    // Nothing to hold, nothing to switch: the empty state alone.
    const empty = doc.url.includes("fill=empty");
    if (empty !== (before.segments.length === 0)) {
      found.push(
        `segments ${empty ? "over" : "missing from"} this fill: ${JSON.stringify(s)}`
      );
    }
    const equal =
      s.before.segments.length === 2 &&
      Math.abs(s.before.segments[0].w - s.before.segments[1].w) < 0.5;
    const one = (r, name) => r && r.shown.length === 1 && r.shown[0] === name;
    const fills = (r) => r?.pane && r.sheet && r.pane[1] <= r.sheet[1] + 0.5;
    if (!(
      empty ||
      (equal &&
        one(s.before, "artifacts") &&
        one(s.attachments, "attachments") &&
        one(s.back, "artifacts") &&
        s.before.list[0] >= s.before.sheet[0] &&
        fills(s.before) &&
        fills(s.attachments))
    )) {
      found.push(
        `the segments did not show one list at a time: ${JSON.stringify(s)}`
      );
    }
    const words = s.before.segments.map((x) => x.words);
    const want = doc.url.includes("q=pricing")
      ? ["Artifacts 3 of 14", "Attachments 0 of 6"]
      : null;
    if (want && JSON.stringify(words) !== JSON.stringify(want)) {
      found.push(
        `the segments' counts are not the search's hits: ${JSON.stringify(words)}`
      );
    }
    if (
      /fill=long(&|$)/.test(doc.url) &&
      !(
        s.before.scroll?.scrollHeight > s.before.scroll?.clientHeight &&
        s.attachments.scroll?.scrollHeight > s.attachments.scroll?.clientHeight
      )
    ) {
      found.push(`a long list does not scroll: ${JSON.stringify(s)}`);
    }
    extra.light = { ...extra.light, segmented };
  }
  // Two long regions: each scrolls on its own, and scrolling one leaves the
  // other where it was.
  if (doc.desk && /fill=long(&|$)/.test(doc.url) && !doc.url.includes("q=")) {
    const own = await page.evaluate(async () => {
      const [a, b] = [...document.querySelectorAll("[data-files-region]")].map(
        (r) => r.querySelector("[data-files-scroll]")
      );
      if (!(a && b)) {
        return { findings: ["a long list without its two scrolls"] };
      }
      const frame = () =>
        new Promise((done) => requestAnimationFrame(() => done()));
      const read = () => [a.scrollTop, b.scrollTop];
      const out = {
        artifacts: {
          scrollHeight: a.scrollHeight,
          clientHeight: a.clientHeight,
        },
        attachments: {
          scrollHeight: b.scrollHeight,
          clientHeight: b.clientHeight,
        },
      };
      a.scrollTop = 300;
      await frame();
      out.afterArtifacts = read();
      a.scrollTop = 0;
      b.scrollTop = 300;
      await frame();
      out.afterAttachments = read();
      b.scrollTop = 0;
      const findings = [];
      if (!(
        a.scrollHeight > a.clientHeight && b.scrollHeight > b.clientHeight
      )) {
        findings.push(`a region does not scroll: ${JSON.stringify(out)}`);
      }
      if (out.afterArtifacts[1] !== 0 || out.afterAttachments[0] !== 0) {
        findings.push(
          `scrolling one region moved the other: ${JSON.stringify(out)}`
        );
      }
      return { findings, out };
    });
    found.push(...own.findings);
    extra.light = { ...extra.light, scrolls: own.out };
  }
  // Search, typed: both regions filter as the words change, a region with
  // no match says so in its place, and Clear brings everything back.
  if (doc.desk && /stage=open&count=beside$/.test(doc.url)) {
    const state = () =>
      page.evaluate(() => ({
        counts: [...document.querySelectorAll("[data-files-count]")].map((c) =>
          c.textContent.trim()
        ),
        cards: document.querySelectorAll("[data-files-card]").length,
        rows: document.querySelectorAll(
          "[data-files-region='attachments'] [data-files-row]"
        ).length,
        within: document.querySelectorAll("[data-files-card] mark").length,
        none: [...document.querySelectorAll("[data-files-none]")].map((n) =>
          n.textContent.trim()
        ),
        clear: !!document.querySelector("[data-files-search] button"),
      }));
    const field = page.locator("[data-files-search] input");
    const searched = { before: await state() };
    await field.pressSequentially("pricing", { delay: 20 });
    searched.pricing = await state();
    await field.fill("");
    await field.pressSequentially("invoice", { delay: 20 });
    searched.invoice = await state();
    await page.locator("[data-files-search] button").click();
    searched.cleared = await state();
    const s = searched;
    if (!(
      s.pricing.cards > 0 &&
      s.pricing.cards < s.before.cards &&
      s.pricing.within > 0 &&
      s.invoice.cards === 0 &&
      s.invoice.rows === 0 &&
      s.invoice.none.length === 2 &&
      s.cleared.cards === s.before.cards &&
      s.cleared.rows === s.before.rows &&
      !s.cleared.clear
    )) {
      found.push(`search did not filter as typed: ${JSON.stringify(s)}`);
    }
    extra.light = { ...extra.light, searched };
  }
  // vaul's own drag on the phone's bottom drawer, from its header: it opens
  // on its lower snap; dragged up it follows the finger and settles full, a
  // short drag down goes back, a longer one settles on the lower snap, and
  // a flick down from there puts it away.
  if (doc.phone && doc.url.includes("pull=open")) {
    const head = page.locator("[data-slot='drawer-header']");
    const H = doc.height;
    const read = () =>
      page.evaluate(() => {
        const sheet = document.querySelector("[data-slot='drawer-content']");
        const t = sheet && getComputedStyle(sheet).transform;
        return {
          y: t && t !== "none" ? Number.parseFloat(t.split(",")[5]) : 0,
          state: sheet?.dataset.state ?? "unmounted",
          direction: sheet?.dataset.vaulDrawerDirection ?? null,
        };
      });
    // A finger's pace: a step a frame, so vaul reads a drag, not a flick;
    // a flick is its few steps at once.
    const drag = async (dy, steps, paced = true) => {
      if ((await head.count()) === 0) {
        return { during: null, ...(await read()) };
      }
      const at = await head.boundingBox();
      const x = at.x + 40;
      const y = at.y + at.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= steps; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: a finger's moves, one after another
        await page.mouse.move(x, y + (dy * i) / steps);
        if (paced) {
          await page.waitForTimeout(16);
        }
      }
      const during = (await read()).y;
      await page.mouse.up();
      await page.waitForTimeout(900);
      return { during, ...(await read()) };
    };
    const dragged = { opened: await read() };
    // Each let go short of the snap it settles on, as a finger is: vaul
    // keeps no snap for a sheet let go exactly on one (its release returns
    // on a zero translate).
    dragged.up = await drag(-H * 0.2, 40);
    dragged.short = await drag(H * 0.05, 12);
    dragged.lower = await drag(H * 0.2, 40);
    dragged.flick = await drag(H * 0.2, 2, false);
    const lower = H * 0.25;
    const near = (a, b) => Math.abs(a - b) < 1;
    if (!(
      dragged.opened.direction === "bottom" &&
      near(dragged.opened.y, lower) &&
      dragged.up.during < lower &&
      near(dragged.up.y, 0) &&
      dragged.short.during > 0 &&
      near(dragged.short.y, 0) &&
      dragged.short.state === "open" &&
      near(dragged.lower.y, lower) &&
      dragged.flick.state !== "open"
    )) {
      found.push(
        `the drawer's drag did not follow, settle on its snaps and dismiss: ${JSON.stringify(dragged)}`
      );
    }
    extra.light = { ...extra.light, dragged };
  }
  // The open and the close run on `hang` (motion/hang): the card's own
  // translate, paused and sought through the DevTools Animation domain at
  // 0, ½ and 1 of its run.
  if (doc.desk && /stage=closed&count=beside$/.test(doc.url)) {
    await page.emulateMedia({ colorScheme: "light" });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Animation.enable");
    const started = [];
    cdp.on("Animation.animationStarted", ({ animation }) =>
      started.push(animation)
    );
    const translate = () =>
      page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector('.kit-hang[data-float="files"]')
          ).translate
      );
    const scrub = async (open) => {
      started.length = 0;
      await page.evaluate((next) => window.filesPreview.open(next), open);
      let run = null;
      for (let i = 0; i < 40 && !run; i += 1) {
        // biome-ignore lint/performance/noAwaitInLoops: a poll; each look follows the one before
        await page.waitForTimeout(25);
        run =
          started.find(
            (a) =>
              a.type === "WebAnimation" &&
              a.source?.keyframesRule?.keyframes?.some((k) =>
                k.style?.includes("translate")
              )
          ) ?? started.find((a) => a.type === "WebAnimation");
      }
      if (!run) {
        return {
          error: "no WebAnimation started",
          seen: started.map((a) => `${a.type}:${a.name}`),
        };
      }
      await cdp.send("Animation.setPaused", {
        animations: [run.id],
        paused: true,
      });
      const { duration } = run.source;
      const at = {};
      for (const [label, t] of [
        ["0", 0],
        ["½", duration / 2],
        ["1", duration],
      ]) {
        // biome-ignore lint/performance/noAwaitInLoops: one paused clock, sought to each point in turn
        await cdp.send("Animation.seekAnimations", {
          animations: [run.id],
          currentTime: t,
        });
        at[label] = await translate();
      }
      await cdp.send("Animation.setPaused", {
        animations: [run.id],
        paused: false,
      });
      await page.waitForTimeout(duration + 200);
      return {
        duration,
        easing: run.source.easing,
        at,
        rest: await translate(),
      };
    };
    const opened = await scrub(true);
    const closed = await scrub(false);
    // Open: from up behind the cut to its place; close: back. Each run is a
    // slide, so the middle stands apart from both ends.
    const OPEN = "0px 0%";
    const SHUT = /^0px calc\(-100% - \d+(\.\d+)?px\)$/;
    const slid = (r, from, to) =>
      r.at &&
      from(r.at["0"]) &&
      to(r.at["1"]) &&
      r.at["½"] !== r.at["0"] &&
      r.at["½"] !== r.at["1"];
    const isOpen = (t) => t === OPEN;
    const isShut = (t) => SHUT.test(t);
    if (!(slid(opened, isShut, isOpen) && slid(closed, isOpen, isShut))) {
      found.push(
        `the hang did not run down and back up: ${JSON.stringify({ opened, closed })}`
      );
    }
    extra.light = { ...extra.light, hangRun: { opened, closed } };
  }
  total += found.length;
  report.push({
    name: doc.name,
    findings: found,
    facts: extra.light,
    dark: extra.dark,
  });
  await context.close();
}
// The conversation never moves for Files or a file opening: one box per
// width, in every desk document at that width.
const firstAt = new Map();
for (const t of transcripts) {
  if (!firstAt.has(t.width)) {
    firstAt.set(t.width, t);
  }
  const first = firstAt.get(t.width);
  if (JSON.stringify(t.rect) !== JSON.stringify(first.rect)) {
    total += 1;
    report.push({
      name: "transcript",
      findings: [
        `${t.name} moved the transcript: ${JSON.stringify(t.rect)} against ${JSON.stringify(first.rect)}`,
      ],
    });
  }
}
await browser.close();
for (const r of report) {
  const lines = [`${r.name}: ${r.findings.length} findings`];
  for (const [k, v] of Object.entries(r.facts ?? {})) {
    lines.push(`  ${k} ${JSON.stringify(v)}`);
  }
  for (const f of r.findings) {
    lines.push(`  - ${f}`);
  }
  console.log(lines.join("\n"));
}
for (const [width, first] of firstAt) {
  const n = transcripts.filter((t) => t.width === width).length;
  console.log(
    `\ntranscript rect in every desk document at ${width}: ${JSON.stringify(first.rect)} (${n} documents)`
  );
}
console.log(`\nDOCUMENTS ${report.length}  TOTAL FINDINGS ${total}`);

/**
 * Runs in the page: the Files folder's ink, drawn from its own SVG at 4×
 * its size, every pixel with any coverage counted, against the count's box.
 * The count may stand beside the folder or above it, never on its ink.
 */
async function ink() {
  const files = document.querySelector("[data-files-control]");
  if (!files || files.getClientRects().length === 0) {
    return null;
  }
  const svg = files.querySelector(".bar-symbol");
  const num = files.querySelector("[data-slot='num']");
  const g = svg.getBoundingClientRect();
  const SCALE = 4;
  const w = Math.round(g.width * SCALE);
  const h = Math.round(g.height * SCALE);
  const copy = svg.cloneNode(true);
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(w));
  copy.setAttribute("height", String(h));
  const picture = new Image();
  picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(copy.outerHTML)}`;
  await picture.decode();
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const pen = canvas.getContext("2d");
  pen.drawImage(picture, 0, 0);
  const alpha = pen.getImageData(0, 0, w, h).data;
  const m = num?.getBoundingClientRect();
  let inkPx = 0;
  let overlapPx = 0;
  const inkBox = { left: 1e9, right: -1e9, top: 1e9, bottom: -1e9 };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (alpha[(y * w + x) * 4 + 3] === 0) {
        continue;
      }
      inkPx += 1;
      const px = g.left + x / SCALE;
      const py = g.top + y / SCALE;
      inkBox.left = Math.min(inkBox.left, px);
      inkBox.right = Math.max(inkBox.right, px + 1 / SCALE);
      inkBox.top = Math.min(inkBox.top, py);
      inkBox.bottom = Math.max(inkBox.bottom, py + 1 / SCALE);
      if (
        m &&
        px + 1 / SCALE > m.left &&
        px < m.right &&
        py + 1 / SCALE > m.top &&
        py < m.bottom
      ) {
        overlapPx += 1;
      }
    }
  }
  const r = (n) => +n.toFixed(2);
  return {
    scale: SCALE,
    glyph: [r(g.left), r(g.top), r(g.width), r(g.height)],
    inkBox: [r(inkBox.left), r(inkBox.top), r(inkBox.right), r(inkBox.bottom)],
    inkPx,
    count: m && [r(m.left), r(m.top), r(m.right), r(m.bottom)],
    overlapPx,
  };
}

/** Runs in the page: the group's geometry, the floating panels, the pill, the sheet. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: page.evaluate ships this one function alone, so its checks cannot live in helpers outside it
function geometry() {
  const findings = [];
  const facts = {};
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return {
      x: +r.left.toFixed(2),
      y: +r.top.toFixed(2),
      w: +r.width.toFixed(2),
      h: +r.height.toFixed(2),
    };
  };
  // The phone's glass shows Files and Caw alone (Jump and the machines are
  // in its sidebar). Each item by its own mark: BarGroup's Jump, the
  // machines, Caw, and the page's Files.
  const items = [...document.querySelectorAll("[data-bar-item]")].filter(
    (el) => el.getClientRects().length > 0
  );
  const nameOf = (el) => {
    if (el.hasAttribute("data-files-control")) {
      return "files";
    }
    if (el.hasAttribute("data-machines")) {
      return "machines";
    }
    if (el.hasAttribute("data-needs-caw")) {
      return "caw";
    }
    return el.classList.contains("jump") ? "jump" : "?";
  };
  if (items.length) {
    const members = items.map((el) => {
      const glyph = el.querySelector(".bar-symbol");
      return {
        name: nameOf(el),
        ...box(el),
        glyph: glyph ? box(glyph) : null,
      };
    });
    const gaps = members
      .slice(1)
      .map((m, i) => +(m.x - (members[i].x + members[i].w)).toFixed(2));
    const group = document.querySelector("[data-bar-group]");
    const glass = box(group);
    const drawn = getComputedStyle(group, "::before");
    facts.group = {
      glass,
      material: {
        background: drawn.backgroundColor,
        border: drawn.borderColor,
        backdrop: drawn.backdropFilter,
      },
      gaps,
      members: members.map(({ name, x, y, w, h, glyph }) => ({
        name,
        x,
        y,
        w,
        h,
        glyph: glyph && `${glyph.w}×${glyph.h}`,
      })),
    };
    const at = (name) => members.find((m) => m.name === name);
    const files = at("files");
    // Files stands on the group's line as its siblings do, and its folder
    // is the machines' symbol size (Jump draws its glyph bare, smaller).
    for (const sib of ["jump", "machines", "caw"].filter(at)) {
      const s = at(sib);
      if (Math.abs(files.h - s.h) > 0.5 || Math.abs(files.y - s.y) > 0.5) {
        findings.push(
          `Files box ${files.w}×${files.h}@${files.y} off ${sib}'s line ${s.w}×${s.h}@${s.y}`
        );
      }
    }
    const machines = at("machines");
    if (
      machines &&
      (Math.abs(files.glyph.w - machines.glyph.w) > 0.5 ||
        Math.abs(files.glyph.h - machines.glyph.h) > 0.5)
    ) {
      findings.push(
        `Files glyph ${files.glyph.w}×${files.glyph.h} differs from the machines' ${machines.glyph.w}×${machines.glyph.h}`
      );
    }
    if (gaps.length && Math.max(...gaps) - Math.min(...gaps) > 0.5) {
      findings.push(`gaps differ: ${gaps.join(", ")}`);
    }
    // The count stays in Files' own box, on the glass and on the screen.
    const num = document.querySelector(
      "[data-files-control] [data-slot='num']"
    );
    if (num) {
      const m = box(num);
      facts.count = m;
      if (
        m.x < files.x - 0.5 ||
        m.x + m.w > files.x + files.w + 0.5 ||
        m.y < glass.y - 0.5 ||
        m.y + m.h > glass.y + glass.h + 0.5 ||
        m.y < 0
      ) {
        findings.push(
          `the count stands past Files' box or the glass: ${JSON.stringify(m)} in ${JSON.stringify({ files, glass })}`
        );
      }
    }
  }
  // A hung card counts while it stands drawn out of the glass (`data-shown`).
  const floats = [...document.querySelectorAll("[data-float]")]
    .filter(
      (el) =>
        !el.classList.contains("kit-hang") || el.hasAttribute("data-shown")
    )
    .map((el) => ({
      name: el.dataset.float,
      // The hung card is itself the surface; the file's wrapper holds its own.
      ...box(el.classList.contains("kit-pop") ? el : el.firstElementChild),
    }));
  if (floats.length) {
    facts.floats = floats;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    for (const f of floats) {
      if (f.x < 0 || f.y < 0 || f.x + f.w > vw + 0.5 || f.y + f.h > vh + 0.5) {
        findings.push(
          `floating ${f.name} past the viewport: ${JSON.stringify(f)}`
        );
      }
    }
    if (floats.length === 2) {
      const [a, b] = floats;
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      facts.between = +(
        Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)
      ).toFixed(2);
      if (w > 0 && h > 0) {
        findings.push(`the floating panels overlap by ${w}×${h}`);
      }
    }
  }
  // Both regions in sight: each head inside the panel's visible box.
  // The desk's two regions, each under its head (the phone's take turns
  // under the segments, checked by the sweep's own presses).
  const regions = [...document.querySelectorAll("[data-files-region]")].filter(
    (r) => !r.closest("[inert]") && r.querySelector(".files-head")
  );
  if (regions.length) {
    const panel = regions[0].closest(".kit-pop, [data-files-sheet]");
    const p = panel.getBoundingClientRect();
    const vh = document.documentElement.clientHeight;
    const visible = { top: Math.max(p.top, 0), bottom: Math.min(p.bottom, vh) };
    facts.regions = regions.map((r) => {
      const head = r.querySelector(".files-head").getBoundingClientRect();
      if (head.top < visible.top - 0.5 || head.bottom > visible.bottom + 0.5) {
        findings.push(
          `the ${r.dataset.filesRegion} head stands outside the panel: ${head.top}–${head.bottom} of ${visible.top}–${visible.bottom}`
        );
      }
      const region = r.getBoundingClientRect();
      if (region.bottom > p.bottom + 0.5) {
        findings.push(
          `the ${r.dataset.filesRegion} region runs past the panel`
        );
      }
      return {
        name: r.dataset.filesRegion,
        head: [+head.top.toFixed(1), +head.bottom.toFixed(1)],
        h: +region.height.toFixed(1),
      };
    });
    facts.panel = [+p.top.toFixed(1), +p.bottom.toFixed(1)];
  }
  // Files hung from the glass: its neck across the glass's span, the glass
  // joined to it, the card wearing the hang's shape.
  const hung = document.querySelector('.kit-hang[data-float="files"]');
  if (hung?.hasAttribute("data-shown")) {
    const card = hung.getBoundingClientRect();
    const style = getComputedStyle(hung);
    const px = (name) => Number.parseFloat(style.getPropertyValue(name));
    const group = document.querySelector("[data-bar-group]");
    const glassBox = group.getBoundingClientRect();
    const button = document
      .querySelector("[data-files-control]")
      .getBoundingClientRect();
    const neck = {
      left: +(card.left + px("--neck-start")).toFixed(2),
      right: +(card.left + px("--neck-end")).toFixed(2),
      flareStart: px("--neck-flare-start") || 0,
      flareEnd: px("--neck-flare-end") || 0,
    };
    facts.hang = {
      neck,
      glass: [+glassBox.left.toFixed(2), +glassBox.right.toFixed(2)],
      filesButton: [+button.left.toFixed(2), +button.right.toFixed(2)],
      cardTop: +card.top.toFixed(2),
      glassFoot: +glassBox.bottom.toFixed(2),
      joined: group.hasAttribute("data-joined"),
      joinOpacity: getComputedStyle(group.querySelector(".join")).opacity,
      classes: [...hung.classList].filter(
        (c) => c === "kit-hang" || c === "glass-card" || c === "kit-pop"
      ),
      clipPath: style.clipPath.slice(0, 40),
      neckCut: style.getPropertyValue("--neck-cut").trim().slice(0, 30),
      flush: hung.dataset.flush ?? null,
    };
    // At settle the neck is the glass's span in the card's own coordinates,
    // to a hundredth of a pixel (HangCard redraws it as the glass's span
    // changes, f844ee878).
    const inCard = {
      neckStart: px("--neck-start"),
      neckEnd: px("--neck-end"),
      glassStart: glassBox.left - card.left,
      glassEnd: glassBox.right - card.left,
    };
    facts.neckInCard = inCard;
    if (
      Math.abs(inCard.neckStart - inCard.glassStart) > 0.01 ||
      Math.abs(inCard.neckEnd - inCard.glassEnd) > 0.01
    ) {
      findings.push(
        `the neck ${inCard.neckStart}–${inCard.neckEnd} is not the glass's span ${inCard.glassStart}–${inCard.glassEnd} in the card`
      );
    }
    if (!facts.hang.joined) {
      findings.push("the glass is not joined to its open card");
    }
    if (!(
      hung.classList.contains("kit-hang") &&
      hung.classList.contains("glass-card")
    )) {
      findings.push("the card does not wear kit-hang and glass-card");
    }
    // On the glass's foot; under 900px on the row's floor, through Caw's
    // neck (bar-glass `glassPlacement`: the neck less the floor's line).
    const neckBelow = matchMedia("(max-width: 899px)").matches
      ? Number.parseFloat(
          getComputedStyle(group).getPropertyValue("--caw-neck")
        ) - 1
      : 0;
    if (Math.abs(card.top - (glassBox.bottom + neckBelow)) > 0.5) {
      findings.push(
        `the card's top ${card.top} is not ${neckBelow}px under the glass's foot ${glassBox.bottom}`
      );
    }
  }
  const transcript = document.querySelector("[data-transcript]");
  if (transcript) {
    facts.transcript = box(transcript);
  }
  // The masonry: no card over another, every name whole or ellipsized.
  const cards = [...document.querySelectorAll("[data-files-card]")];
  if (cards.length) {
    const boxes = cards.map((c) => c.getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const w =
          Math.min(boxes[i].right, boxes[j].right) -
          Math.max(boxes[i].left, boxes[j].left);
        const h =
          Math.min(boxes[i].bottom, boxes[j].bottom) -
          Math.max(boxes[i].top, boxes[j].top);
        if (w > 0.5 && h > 0.5) {
          overlaps += 1;
        }
      }
    }
    const names = cards.map((c) => c.querySelector(".name"));
    const cut = names.filter((n) => n.scrollWidth > n.clientWidth + 0.5);
    const unmarked = cut.filter(
      (n) =>
        getComputedStyle(n).textOverflow !== "ellipsis" || !n.closest("[title]")
    );
    const lanes = document.querySelectorAll(
      "[data-files-cards] > .lane"
    ).length;
    facts.masonry = {
      cards: cards.length,
      lanes,
      overlaps,
      ellipsized: cut.length,
      laneWidth: +boxes[0].width.toFixed(1),
    };
    if (overlaps > 0) {
      findings.push(`${overlaps} masonry cards overlap`);
    }
    if (unmarked.length > 0) {
      findings.push(
        `${unmarked.length} card names cut with no ellipsis or title`
      );
    }
  }
  const current =
    document.querySelector('[data-files-card][aria-current="true"]') ??
    document.querySelector('[data-files-row]:has(> [aria-current="true"])');
  if (current) {
    const pill = current.closest(".kit-highlight")?.querySelector(".kit-pill");
    facts.pill = pill
      ? {
          row: box(current),
          pill: box(pill),
          opacity: getComputedStyle(pill).opacity,
          bg: getComputedStyle(pill).backgroundColor,
        }
      : "no pill";
    // The pill is placed while the kit popover scales in and is not
    // re-aimed after (house highlight; reported): its delta is told, and
    // only a pill off its row by more than a pixel is a finding.
    if (pill) {
      const p = box(pill);
      const r = box(current);
      const delta = Math.max(
        Math.abs(p.x - r.x),
        Math.abs(p.y - r.y),
        Math.abs(p.x + p.w - (r.x + r.w)),
        Math.abs(p.y + p.h - (r.y + r.h))
      );
      facts.pillDelta = +delta.toFixed(2);
      if (delta > 1) {
        findings.push(`the pill is ${delta.toFixed(2)}px off the chosen row`);
      }
    } else {
      findings.push("no pill on the chosen row");
    }
  }
  const sheet = document.querySelector("[data-files-sheet]");
  if (sheet) {
    facts.sheet = {
      transform: getComputedStyle(sheet).transform,
      ...box(sheet),
    };
  }
  return { findings, facts };
}
