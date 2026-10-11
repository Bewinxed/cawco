/**
 * The recall wheel as one calm surface, measured on a stopped clock
 * (clock.mjs) in Chromium and WebKit, against the scratch hub with 40 sends
 * (seed-fleet.ts) and a build talking to it:
 *
 *   PNGJS=<dir holding node_modules/pngjs> \
 *     node artifacts/recall-wheel/calm-check.mjs <url> <session> <captures dir>
 *
 * Desktop 1440×900 and phone 390×844 (touch), each opened (↑, or a swipe up
 * on the phone) and put away (Esc, or a press outside), stepped a 60Hz frame
 * at a time. Prints JSON, per engine and size:
 * - backdrop: whether the engine draws backdrop-filter at all, by the tab
 *   strip's HeadFade with its layers forced in, against the same layers with
 *   none;
 * - meta: every row's age and state (`.m`) shown, never cut or overlapping
 *   its words, at every frame of the open and at rest;
 * - deck: each card peeking behind Send, its edge against the pill (≥ 3:1);
 * - placeholder: the field's hint drawn while the wheel is up, and mid-fold;
 * - showThrough: the transcript's strongest glyph in the shape's top band,
 *   against the same pixels with the transcript hidden (≤ 1.2:1);
 * - deckClear: how far any row whose words stand beside the deck runs into
 *   it, at every frame of the open and the fold (≤ 0);
 * - throughDeck: pixels inside each card that change when the cards behind
 *   it are hidden, at mid-open and at rest (0);
 * - rows: each row outside the far edge's band, its words' and its age's
 *   contrast against the shape (≥ 4.5:1);
 * - pop: the largest one-frame change of the pixels round the pill (where
 *   only the drop and the pill's own shadow change as it folds), as a share
 *   of their whole change over the fold (≤ 1/8).
 * Captures: <dir>/<engine>-<size>/{open,mid-open,mid-close}.png, the mid
 * frames at 50% of --dur-grow and of --dur-grow-exit.
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, webkit } from "playwright-core";
import { CLOCK } from "./clock.mjs";

const { PNG } = createRequire(`${process.env.PNGJS ?? import.meta.dirname}/`)(
  "pngjs"
);
const [base, session, out] = process.argv.slice(2);
const ONLY = process.env.ONLY?.split(",");
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
];
const ENGINES = { chromium, webkit };
const DPR = 2;

const channel = (v) => {
  const c = v / 255;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

async function shoot(page, path) {
  const bytes = await page.screenshot(path ? { path } : {});
  const png = PNG.sync.read(bytes);
  const at = (x, y) => {
    const px = Math.round(x * DPR);
    const py = Math.round(y * DPR);
    const i = (py * png.width + px) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2]];
  };
  return { png, at, lum: (x, y) => lum(...at(x, y)) };
}

async function openPage(engine, v) {
  const browser = await ENGINES[engine].launch();
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: DPR,
    isMobile: v.touch && engine === "chromium",
    hasTouch: v.touch,
  });
  await context.addInitScript(CLOCK);
  const page = await context.newPage();
  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".tr")?.textContent?.includes("Step 40 is done"),
    null,
    { timeout: 90_000 }
  );
  await page.waitForSelector(".cin .history-btn");
  await page.waitForTimeout(1500);
  return { browser, page };
}

const advance = (page, ms) =>
  page.evaluate((m) => window.__clock.advance(m), ms);
const durOf = (page, name) =>
  page.evaluate((n) => {
    const v = getComputedStyle(document.documentElement).getPropertyValue(n);
    return v.trim().endsWith("ms")
      ? Number.parseFloat(v)
      : Number.parseFloat(v) * 1000;
  }, name);

/** What a frame says about the rows, the deck and the field, read in the page. */
const frameRead = (page) =>
  page.evaluate(() => {
    const cards = [...document.querySelector(".cin .ctrls").children]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => e.getBoundingClientRect());
    const deckLeft = Math.min(...cards.map((b) => b.left));
    const deckTop = Math.min(...cards.map((b) => b.top));
    const deckBottom = Math.max(...cards.map((b) => b.bottom));
    const rows = [...document.querySelectorAll(".ghost")]
      .filter(
        (e) =>
          getComputedStyle(e).visibility === "visible" &&
          Number(getComputedStyle(e).opacity) *
            Number(getComputedStyle(e.parentElement).opacity) >
            0.05 &&
          !e.classList.contains("own")
      )
      .map((e) => {
        const b = e.getBoundingClientRect();
        const t = e.querySelector(".t");
        const m = e.querySelector(".m");
        const tb = t.getBoundingClientRect();
        const mb = m.getBoundingClientRect();
        // The words end where their own text does, not where their box does.
        const range = document.createRange();
        range.selectNodeContents(t);
        const words = range.getBoundingClientRect();
        return {
          text: e.textContent.trim().slice(0, 20),
          top: b.top,
          bottom: b.bottom,
          // Where its words and its age are drawn, top to foot.
          inkTop: Math.min(words.top, mb.height ? mb.top : words.top),
          inkBottom: Math.max(
            words.bottom,
            mb.height ? mb.bottom : words.bottom
          ),
          right: Math.max(
            Math.min(words.right, tb.right),
            mb.width ? mb.right : 0
          ),
          meta: m.textContent,
          metaShown: getComputedStyle(m).display !== "none" && mb.width > 0,
          metaCut: m.scrollWidth > m.clientWidth + 0.5,
          metaInRow: mb.left >= b.left - 0.5 && mb.right <= b.right + 0.5,
          overlap: tb.right - mb.left,
        };
      });
    // A row whose words stand beside the deck: how far they run into it.
    const intoDeck = rows
      .filter((r) => r.inkBottom > deckTop + 1 && r.inkTop < deckBottom - 1)
      .map((r) => r.right - deckLeft);
    return {
      deckLeft,
      rows,
      intoDeck: intoDeck.length ? Math.max(...intoDeck) : null,
      metaBad: rows.filter(
        (r) =>
          r.meta &&
          (!r.metaShown || r.metaCut || !r.metaInRow || r.overlap > 0.5)
      ),
    };
  });

/** Steps `ms` a frame at a time, reading each frame. */
async function stepRead(page, ms, reads) {
  const step = 1000 / 60;
  for (let done = 0; done < ms - 0.01; done += step) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame a step
    await advance(page, Math.min(step, ms - done));
    reads.push(await frameRead(page));
  }
}

/** The tab strip's head blur, forced in, against the same layers with none. */
async function backdrop(page) {
  const sel = ".head-fade .layer";
  if (!(await page.$(sel))) {
    return { headFade: "absent" };
  }
  const box = await page.evaluate((s) => {
    const layers = [...document.querySelectorAll(s)];
    for (const l of layers) {
      l.style.animation = "none";
      l.style.opacity = "1";
    }
    const b = layers[0].parentElement.getBoundingClientRect();
    const st = getComputedStyle(layers.at(-1));
    return {
      x: b.left,
      y: b.top,
      w: b.width,
      h: b.height,
      backdrop: st.backdropFilter ?? null,
      webkitBackdrop: st.webkitBackdropFilter ?? null,
      supports: CSS.supports("backdrop-filter", "blur(4px)"),
      supportsPrefixed: CSS.supports("-webkit-backdrop-filter", "blur(4px)"),
    };
  }, sel);
  await advance(page, 50);
  const on = await shoot(page);
  await page.evaluate((s) => {
    for (const l of document.querySelectorAll(s)) {
      l.style.backdropFilter = "none";
      l.style.webkitBackdropFilter = "none";
    }
  }, sel);
  await advance(page, 50);
  const off = await shoot(page);
  let changed = 0;
  let most = 0;
  const { x: x0, y: y0, w, h } = box;
  for (let y = y0; y < y0 + h; y += 0.5) {
    for (let x = x0; x < x0 + w; x += 0.5) {
      const a = on.at(x, y);
      const b = off.at(x, y);
      const d = Math.max(...a.map((c, i) => Math.abs(c - b[i])));
      most = Math.max(most, d);
      if (d > 2) {
        changed += 1;
      }
    }
  }
  await page.evaluate((s) => {
    for (const l of document.querySelectorAll(s)) {
      l.style.cssText = l
        .getAttribute("style")
        .replace(/animation[^;]*;|opacity[^;]*;/g, "");
    }
  }, sel);
  return {
    ...box,
    pixelsChanged: changed,
    largestChannelChange: most,
    draws: changed > 0,
  };
}

/** The field's own ink with the rows hidden: its hint, if it is drawn. */
async function fieldInk(page) {
  const box = await page.evaluate(() => {
    document.querySelector(".ghosts")?.style.setProperty("display", "none");
    const b = document.querySelector(".cin textarea").getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  });
  const s = await shoot(page);
  await page.evaluate(() =>
    document.querySelector(".ghosts")?.style.removeProperty("display")
  );
  let bg = 0;
  let darkest = 1;
  for (let y = box.y + 1; y < box.y + box.h - 1; y += 0.5) {
    for (let x = box.x + 1; x < box.x + box.w - 1; x += 0.5) {
      const l = s.lum(x, y);
      bg = Math.max(bg, l);
      darkest = Math.min(darkest, l);
    }
  }
  return +ratio(bg, darkest).toFixed(2);
}

/** The shape's outline, its top band, and which points of the band it fills. */
const bandPoints = (page) =>
  page.evaluate(() => {
    const halo = document.querySelector(".grown-halo");
    const svg = halo.querySelector("svg");
    const path = svg.querySelector("path");
    const hb = halo.getBoundingClientRect();
    const view = svg.viewBox.baseVal;
    const sx = view.width / hb.width;
    const sy = view.height / hb.height;
    const row = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-composer-field"
      )
    );
    const room = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    );
    const edge = row + room;
    const points = [];
    const point = svg.createSVGPoint();
    for (let y = hb.top; y < hb.top + edge; y += 0.5) {
      for (let x = hb.left; x < hb.right; x += 0.5) {
        point.x = (x - hb.left) * sx;
        point.y = (y - hb.top) * sy;
        if (path.isPointInFill(point)) {
          points.push([x, y]);
        }
      }
    }
    return { top: hb.top, edge, points };
  });

/** The transcript's strongest glyph in the shape's top band. */
async function showThrough(page) {
  const { points, top, edge } = await bandPoints(page);
  const shown = await shoot(page);
  await page.evaluate(() =>
    document.querySelector(".tr").style.setProperty("visibility", "hidden")
  );
  await advance(page, 34);
  const hidden = await shoot(page);
  await page.evaluate(() =>
    document.querySelector(".tr").style.removeProperty("visibility")
  );
  await advance(page, 34);
  let worst = 1;
  for (const [x, y] of points) {
    worst = Math.max(worst, ratio(shown.lum(x, y), hidden.lum(x, y)));
  }
  return {
    bandTop: +top.toFixed(1),
    band: edge,
    points: points.length,
    worst: +worst.toFixed(3),
  };
}

/** Each card behind Send: its edge against the pill. */
async function deckEdges(page, s) {
  const cards = await page.evaluate(() =>
    [...document.querySelector(".cin .ctrls").children]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const b = e.getBoundingClientRect();
        return {
          name: e.getAttribute("aria-label") ?? e.className,
          l: b.left,
          t: b.top,
          b: b.bottom,
          r: b.right,
        };
      })
  );
  const front = cards.at(-1);
  const behind = cards.slice(0, -1);
  const deckLeft = Math.min(...cards.map((c) => c.l));
  const mid = (front.t + front.b) / 2;
  const pill = s.lum(deckLeft - 4, mid);
  return behind.map((c) => {
    let edge = 1;
    for (let x = c.l - 0.5; x <= c.l + 1.5; x += 0.5) {
      edge = Math.min(edge, s.lum(x, mid));
    }
    return {
      card: String(c.name).slice(0, 28),
      peek: +(cards[cards.indexOf(c) + 1].l - c.l).toFixed(2),
      contrast: +ratio(edge, pill).toFixed(2),
    };
  });
}

/** A real frame drawn, the clock left where it stands. */
const repaint = (page) =>
  page.evaluate(
    () =>
      new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done))
      )
  );

/**
 * Each card of the deck: pixels inside it that change when every card
 * behind it is hidden (something behind showing through it).
 */
async function throughDeck(page) {
  const cards = await page.evaluate(() =>
    [...document.querySelector(".cin .ctrls").children]
      .map((e, i) => ({
        i,
        b: e.getBoundingClientRect(),
        name: e.getAttribute("aria-label") ?? e.className,
      }))
      .filter(({ b }) => b.width > 0)
      .map(({ i, b, name }) => ({
        i,
        name: String(name).slice(0, 24),
        x: b.left,
        y: b.top,
        w: b.width,
        h: b.height,
      }))
  );
  const a = await shoot(page);
  const found = [];
  for (const card of cards.slice(1)) {
    // biome-ignore lint/performance/noAwaitInLoops: one card at a time
    await page.evaluate((k) => {
      for (const [i, e] of [
        ...document.querySelector(".cin .ctrls").children,
      ].entries()) {
        if (i < k) {
          e.style.setProperty("visibility", "hidden");
        }
      }
    }, card.i);
    await repaint(page);
    const b = await shoot(page);
    await page.evaluate(() => {
      for (const e of document.querySelector(".cin .ctrls").children) {
        e.style.removeProperty("visibility");
      }
    });
    let n = 0;
    let most = 0;
    // Inside its rounded box, clear of its antialiased rim.
    for (let y = card.y + 3; y < card.y + card.h - 3; y += 0.5) {
      for (let x = card.x + 3; x < card.x + card.w - 3; x += 0.5) {
        const d = Math.max(
          ...a.at(x, y).map((c, i) => Math.abs(c - b.at(x, y)[i]))
        );
        most = Math.max(most, d);
        if (d > 4) {
          n += 1;
        }
      }
    }
    found.push({ card: card.name, pixels: n, largestChannelChange: most });
  }
  await repaint(page);
  return found;
}

/** Rows outside the far edge's band: their words and their age against the shape. */
async function rowContrast(page, s) {
  const rows = await page.evaluate(() => {
    const halo = document.querySelector(".grown-halo").getBoundingClientRect();
    const row = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-composer-field"
      )
    );
    const room = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    );
    const field = document
      .querySelector(".cin textarea")
      .getBoundingClientRect();
    return [...document.querySelectorAll(".ghost")]
      .filter(
        (e) =>
          getComputedStyle(e).visibility === "visible" &&
          !e.classList.contains("own")
      )
      .map((e) => {
        const b = e.getBoundingClientRect();
        const part = (sel) => {
          const r = e.querySelector(sel).getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        };
        return {
          text: e.textContent.trim().slice(0, 20),
          top: b.top,
          inBand: b.top < halo.top + row + room,
          onLine: b.bottom > field.bottom - 2,
          t: part(".t"),
          m: part(".m"),
          box: { l: b.left, t: b.top, r: b.right, b: b.bottom },
        };
      });
  });
  const measure = (r, box) => {
    if (r.r - r.l < 1) {
      return null;
    }
    let ink = 1;
    for (let y = r.t; y < r.b; y += 0.5) {
      for (let x = r.l; x < r.r; x += 0.5) {
        ink = Math.min(ink, s.lum(x, y));
      }
    }
    // The shape's own surface, just past the row's leading end.
    const surface = s.lum(box.l + 2, box.t + 2);
    return +ratio(surface, ink).toFixed(2);
  };
  return rows
    .filter((r) => !(r.inBand || r.onLine))
    .map((r) => ({
      text: r.text,
      words: measure(r.t, r.box),
      age: measure(r.m, r.box),
    }));
}

/** Opens the wheel: ↑ on desktop, a swipe up held on the phone. */
async function open(page, v) {
  if (!v.touch) {
    await page.keyboard.press("ArrowUp");
    return;
  }
  await page.evaluate(() => {
    const field = document.querySelector(".cin textarea");
    const b = field.getBoundingClientRect();
    const y = b.top + b.height / 2;
    for (const [type, dy] of [
      ["pointerdown", 0],
      ["pointermove", -12],
      ["pointermove", -24],
      ["pointermove", -36],
    ]) {
      (type === "pointerdown" ? field : document.body).dispatchEvent(
        new PointerEvent(type, {
          pointerId: 8,
          pointerType: "touch",
          isPrimary: true,
          clientX: b.left + 40,
          clientY: y + dy,
          bubbles: true,
          cancelable: true,
        })
      );
    }
  });
}
const lift = (page) =>
  page.evaluate(() =>
    document.body.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 8,
        pointerType: "touch",
        bubbles: true,
      })
    )
  );
async function putAway(page, v) {
  if (!v.touch) {
    await page.keyboard.press("Escape");
    return;
  }
  await page.evaluate(() =>
    (document.querySelector(".tr") ?? document.body).dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 9,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 200,
      })
    )
  );
}
const folding = (page) =>
  page.evaluate(() => !document.querySelector(".cin.wheeling"));

/** The pixels round the pill, where only the shadows change as it folds. */
const ringBox = (page) =>
  page.evaluate(() => {
    const b = document.querySelector(".cin").getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom };
  });
function ringDiff(a, b, box, vw, vh) {
  let sum = 0;
  const pad = 36;
  for (let y = box.t + 4; y < Math.min(vh - 1, box.b + pad); y += 1) {
    for (
      let x = Math.max(0, box.l - pad);
      x < Math.min(vw - 1, box.r + pad);
      x += 1
    ) {
      const inside = x >= box.l - 1 && x <= box.r + 1 && y <= box.b + 1;
      if (inside) {
        continue;
      }
      const p = a.at(x, y);
      const q = b.at(x, y);
      sum +=
        Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
    }
  }
  return sum;
}

async function run(engine, v) {
  const dir = join(out, `${engine}-${v.name}`);
  mkdirSync(dir, { recursive: true });
  const { browser, page } = await openPage(engine, v);
  const r = {};
  const grow = await durOf(page, "--dur-grow");
  const fold = await durOf(page, "--dur-grow-exit");
  if (!v.touch) {
    await page.click(".cin textarea");
  }
  await page.evaluate(() => window.__clock.stop());
  if (v.name === "desktop") {
    r.backdrop = await backdrop(page);
  }
  r.placeholderClosed = await fieldInk(page);
  // Open, a frame at a time; mid-open at 50% of --dur-grow.
  const opening = [];
  await open(page, v);
  await stepRead(page, grow / 2, opening);
  await shoot(page, join(dir, "mid-open.png"));
  r.throughDeckMidOpen = await throughDeck(page);
  if (v.touch) {
    await lift(page);
  }
  await stepRead(page, 1500 - grow / 2, opening);
  const rest = await shoot(page, join(dir, "open.png"));
  r.deck = await deckEdges(page, rest);
  r.rows = await rowContrast(page, rest);
  r.throughDeckOpen = await throughDeck(page);
  r.placeholderOpen = await fieldInk(page);
  r.showThrough = await showThrough(page);
  r.metaAtRest = (await frameRead(page)).rows.map((x) => ({
    text: x.text,
    meta: x.meta,
    shown: x.metaShown,
    cut: x.metaCut,
    inRow: x.metaInRow,
    overlap: +x.overlap.toFixed(1),
  }));
  // Put away: the roll home, then the fold; mid-close at 50% of the fold.
  const ring = await ringBox(page);
  const before = rest;
  const closing = [];
  await putAway(page, v);
  // A frame at a time until the fold starts.
  const untilFold = async (left) => {
    if (left > 0 && !(await folding(page))) {
      await stepRead(page, 1000 / 60, closing);
      await untilFold(left - 1);
    }
  };
  await untilFold(90);
  const frames = [await shoot(page)];
  const step = 1000 / 60;
  for (let at = 0; at < fold + 200; at += step) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame a step
    await stepRead(page, step, closing);
    if (Math.abs(at + step - fold / 2) < step / 2) {
      await shoot(page, join(dir, "mid-close.png"));
      r.placeholderMidClose = await fieldInk(page);
    }
    frames.push(await shoot(page));
  }
  const total = ringDiff(before, frames.at(-1), ring, v.width, v.height);
  let worst = 0;
  for (let i = 1; i < frames.length; i += 1) {
    worst = Math.max(
      worst,
      ringDiff(frames[i - 1], frames[i], ring, v.width, v.height)
    );
  }
  const first = ringDiff(before, frames[0], ring, v.width, v.height);
  r.pop = {
    total,
    worstFrame: worst,
    worstShare: total ? +(Math.max(worst, first) / total).toFixed(3) : 0,
  };
  await advance(page, 600);
  r.placeholderAfter = await fieldInk(page);
  const all = [...opening, ...closing];
  r.deckClear = {
    worstIntoDeckOpen: Math.max(...opening.map((f) => f.intoDeck ?? -99)),
    worstIntoDeckFold: Math.max(...closing.map((f) => f.intoDeck ?? -99)),
  };
  r.metaEveryFrame = {
    frames: all.length,
    bad: all.flatMap((f) => f.metaBad).slice(0, 4),
  };
  await browser.close();
  return r;
}

const report = {};
for (const engine of Object.keys(ENGINES)) {
  for (const v of VIEWPORTS) {
    const key = `${engine}-${v.name}`;
    if (ONLY && !ONLY.includes(key)) {
      continue;
    }
    console.error(`measuring ${key}`);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one browser at a time
      report[key] = await run(engine, v);
    } catch (error) {
      report[key] = { error: String(error).slice(0, 300) };
    }
  }
}
console.log(JSON.stringify(report, null, 1));
