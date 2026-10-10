/**
 * The composer's recall wheel, measured in Chromium and WebKit against a
 * scratch hub holding 40 sends (seed-fleet.ts) and a production build
 * talking to it:
 *
 *   node artifacts/recall-wheel/wheel-check.mjs <dashboard url> <session id> <out dir>
 *
 * Desktop 1440×900 and phone 390×844 with touch. For each it prints JSON:
 * - deck: the pill's four buttons inside one box no wider than 1.5 buttons
 *   while the wheel is up, and back on their own boxes once it folds;
 * - rows: every visible row's edges against the grown outline (its SVG path,
 *   sampled) at the row's middle, less the field's inset; the line's row
 *   against the deck; the top row's top against the shape's top;
 * - edge: the far edge's blur layers (progressive-blur.ts);
 * - swipe (phone): a touch swiped up on the pill opens the wheel, and the
 *   drag after it rolls it;
 * - draft: three lines typed, ↑ into the wheel, ↓ back to the draft, ↓ out
 *   (and Esc), the field's height and its text's place sampled each frame;
 *   a three-line pick taken with Enter, and a one-line pick taken into a
 *   three-line draft;
 * - frames: frames over 25ms while it opens and folds.
 * Captures (open, mid-open, mid-close) are written to <out dir>.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, webkit } from "playwright-core";

const [base, session, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
];
const ENGINES = { chromium, webkit };
const report = {};

async function openPage(engine, v, reduced = false) {
  const browser = await ENGINES[engine].launch();
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 2,
    isMobile: v.touch && engine === "chromium",
    hasTouch: v.touch,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
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
  await page.waitForTimeout(1200);
  return { browser, page };
}

/** The four buttons' boxes. */
const deckBoxes = (page) =>
  page.evaluate(() =>
    [...document.querySelector(".cin .ctrls").children]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0)
      .map((b) => ({
        l: b.left,
        t: b.top,
        r: b.right,
        b: b.bottom,
        w: b.width,
      }))
  );

/** The grown shape's outline, the visible rows, the deck and the edge, as drawn. */
const geometry = (page) =>
  page.evaluate(() => {
    const halo = document.querySelector(".grown-halo");
    const path = halo.querySelector("path");
    const hb = halo.getBoundingClientRect();
    const total = path.getTotalLength();
    const points = [];
    for (let i = 0; i <= 4000; i += 1) {
      const p = path.getPointAtLength((total * i) / 4000);
      points.push([hb.left + p.x, hb.top + p.y]);
    }
    const sides = (y) => {
      const near = points.filter(([, py]) => Math.abs(py - y) < 0.75);
      return [
        Math.min(...near.map(([x]) => x)),
        Math.max(...near.map(([x]) => x)),
      ];
    };
    const field = document
      .querySelector(".cin textarea")
      .getBoundingClientRect();
    const pad = field.left - hb.left;
    const ctrls = [...document.querySelector(".cin .ctrls").children]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0);
    const deckLeft = Math.min(...ctrls.map((b) => b.left));
    const gap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-2")
    );
    const rows = [...document.querySelectorAll(".ghost")]
      .filter(
        (e) =>
          e.style.visibility === "visible" &&
          Number(e.style.opacity) > 0.05 &&
          !e.classList.contains("own")
      )
      .map((e) => {
        const b = e.getBoundingClientRect();
        const mid = (b.top + b.bottom) / 2;
        const [L, R] = sides(mid);
        const onLine = b.bottom > field.bottom - 2;
        const wantR = onLine ? deckLeft - gap : R - pad;
        return {
          text: e.textContent.trim().slice(0, 24),
          top: +b.top.toFixed(1),
          left: +b.left.toFixed(1),
          right: +b.right.toFixed(1),
          wantLeft: +(L + pad).toFixed(1),
          wantRight: +wantR.toFixed(1),
          errLeft: +Math.abs(b.left - (L + pad)).toFixed(2),
          errRight: +Math.abs(b.right - wantR).toFixed(2),
          onLine,
        };
      });
    const ghosts = document.querySelector(".ghosts");
    const bands = [...document.querySelectorAll(".grown-band")].map((e) => {
      const s = getComputedStyle(e);
      return {
        backdrop: s.backdropFilter || s.webkitBackdropFilter,
        mask: (s.maskImage || s.webkitMaskImage).slice(0, 60),
        opacity: s.opacity,
        z: s.zIndex,
        top: +e.getBoundingClientRect().top.toFixed(1),
        height: +e.getBoundingClientRect().height.toFixed(1),
      };
    });
    const pitch = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-composer-field"
      )
    );
    const topRow = Math.min(...rows.map((r) => r.top));
    return {
      shapeTop: +hb.top.toFixed(1),
      shapeWidth: +hb.width.toFixed(1),
      fieldWidth: +field.width.toFixed(1),
      rows,
      maxErr: Math.max(...rows.map((r) => Math.max(r.errLeft, r.errRight))),
      topRowGap: +(topRow - hb.top).toFixed(1),
      pitch,
      topWithinPitch: topRow - hb.top <= pitch,
      edge: {
        mechanism: "progressive-blur.ts (the ad078dd2 HeadFade layers)",
        ghostsZ: getComputedStyle(ghosts).zIndex,
        ghostsMask: getComputedStyle(ghosts).maskImage?.slice(0, 60),
        bands,
      },
    };
  });

/**
 * Samples, every frame until stopped, the field's height and its text's
 * place as painted: read in a task posted from the frame's callbacks, so
 * after every callback of that frame (the field's fit among them) has run.
 */
const startSampler = (page) =>
  page.evaluate(() => {
    const field = document.querySelector(".cin textarea");
    const style = getComputedStyle(field);
    const padTop = Number.parseFloat(style.paddingTop);
    const lh = Number.parseFloat(style.lineHeight);
    const post = new MessageChannel();
    window.__samples = [];
    window.__marks = {};
    window.__sampling = true;
    let at = 0;
    post.port1.onmessage = () => {
      const b = field.getBoundingClientRect();
      const lines = field.value.split("\n").length;
      const top = b.top + padTop - field.scrollTop;
      window.__samples.push({
        t: at,
        h: field.offsetHeight,
        // Its first line's top and its last line's foot, as drawn.
        y: top,
        foot: top + lines * lh,
        o: Number(getComputedStyle(field).opacity),
      });
    };
    const tick = (now) => {
      at = now;
      post.port2.postMessage(0);
      if (window.__sampling) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });

/** Frames over 25ms in a second of nothing moving: the engine's own pace here. */
const idleFrames = (page) =>
  page.evaluate(
    () =>
      new Promise((done) => {
        const gaps = [];
        let last = 0;
        const start = performance.now();
        const tick = (now) => {
          if (last) {
            gaps.push(now - last);
          }
          last = now;
          if (now - start < 1000) {
            requestAnimationFrame(tick);
          } else {
            done({
              frames: gaps.length,
              over25: gaps.filter((g) => g > 25).length,
              worstMs: +Math.max(...gaps).toFixed(1),
            });
          }
        };
        requestAnimationFrame(tick);
      })
  );

/**
 * Waits until the composer stands still: its buttons, its rows and its
 * field drawn in the same place three reads running, 200ms apart (headless
 * WebKit stalls its frames for up to ~170ms mid-motion).
 */
async function still(page) {
  const read = () =>
    page.evaluate(() =>
      JSON.stringify([
        ...[
          ...document.querySelectorAll(
            ".cin .ctrls > *, .ghost, .cin textarea"
          ),
        ].map((e) => {
          const b = e.getBoundingClientRect();
          return [b.left, b.top, b.width, getComputedStyle(e).opacity];
        }),
        !!document.querySelector(".ghosts"),
      ])
    );
  let was = await read();
  let same = 0;
  for (let i = 0; i < 40 && same < 2; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each read waits on the last
    await page.waitForTimeout(200);
    const now = await read();
    same = now === was ? same + 1 : 0;
    was = now;
  }
}
const mark = (page, name) =>
  page.evaluate((n) => {
    window.__marks[n] = performance.now();
  }, name);
const stopSampler = (page) =>
  page.evaluate(() => {
    window.__sampling = false;
    return { samples: window.__samples, marks: window.__marks };
  });

/** Largest step between frames, overall and while the text is drawn. */
function steps({ samples, marks }, key) {
  let max = 0;
  let maxShown = 0;
  let over = 0;
  // A jump is a step out of line with the steps around it; a motion's steps
  // change by little from one frame to the next, however fast it runs.
  let lurch = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const d = samples[i][key] - samples[i - 1][key];
    max = Math.max(max, Math.abs(d));
    if (samples[i].o > 0.1 && samples[i - 1].o > 0.1) {
      maxShown = Math.max(maxShown, Math.abs(d));
      if (Math.abs(d) > 4) {
        over += 1;
      }
      if (i > 1) {
        lurch = Math.max(
          lurch,
          Math.abs(d - (samples[i - 1][key] - samples[i - 2][key]))
        );
      }
    }
  }
  const slow = (from, to) => {
    let n = 0;
    let worst = 0;
    for (let i = 1; i < samples.length; i += 1) {
      if (samples[i].t >= from && samples[i].t <= to) {
        const gap = samples[i].t - samples[i - 1].t;
        worst = Math.max(worst, gap);
        if (gap > 25) {
          n += 1;
        }
      }
    }
    return { over25: n, worstMs: +worst.toFixed(1) };
  };
  const frames = {};
  for (const [name, at] of Object.entries(marks)) {
    frames[name] = slow(at, at + 600);
  }
  return {
    maxStep: +max.toFixed(2),
    maxStepWhileDrawn: +maxShown.toFixed(2),
    stepsOver4WhileDrawn: over,
    maxStepChangeWhileDrawn: +lurch.toFixed(2),
    frames,
  };
}

async function clearField(page) {
  await page.click(".cin textarea");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(300);
}

async function typeThree(page) {
  await clearField(page);
  await page.keyboard.type("Line one of the draft");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Line two of the draft");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Line three of the draft");
  await page.waitForTimeout(400);
}

/** ↑ until the wheel is up (the caret climbs the draft's lines first). */
async function upIntoWheel(page) {
  for (let i = 0; i < 6; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each press reads whether the wheel came up
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(30);
    if (await page.$(".ghosts")) {
      return;
    }
  }
  throw new Error("the wheel did not come up");
}

const fieldState = (page) =>
  page.evaluate(() => {
    const f = document.querySelector(".cin textarea");
    const b = f.getBoundingClientRect();
    return {
      value: f.value,
      height: f.offsetHeight,
      top: +b.top.toFixed(2),
      opacity: getComputedStyle(f).opacity,
      translate: getComputedStyle(f).translate,
    };
  });

/** Three lines, ↑ into the wheel, then `keys` back (↓ ↓, or Esc). */
async function draftRoundTrip(page, keys) {
  await typeThree(page);
  const before = await fieldState(page);
  await startSampler(page);
  await mark(page, "open");
  await upIntoWheel(page);
  await still(page);
  await mark(page, "close");
  for (const key of keys) {
    // biome-ignore lint/performance/noAwaitInLoops: the keys go in order
    await page.keyboard.press(key);
    await still(page);
  }
  const run = await stopSampler(page);
  const after = await fieldState(page);
  return {
    keys: keys.join(" "),
    endsAsItWas:
      before.value === after.value &&
      before.height === after.height &&
      before.top === after.top,
    before,
    after,
    height: steps(run, "h"),
    textY: steps(run, "y"),
  };
}

/** Takes the row `ups` presses up with Enter, from `draft` lines typed. */
async function takeRun(page, lines, ups) {
  if (lines === 3) {
    await typeThree(page);
  } else {
    await clearField(page);
  }
  await upIntoWheel(page);
  await still(page);
  for (let i = 0; i < ups; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one row a press
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(250);
  }
  await still(page);
  const picked = await page.evaluate(() => {
    const f = document.querySelector(".cin textarea");
    const id = f.getAttribute("aria-activedescendant");
    return document.getElementById(id)?.textContent.trim().slice(0, 60);
  });
  const lineFoot = await page.evaluate(() => {
    const f = document.querySelector(".cin textarea");
    return f.getBoundingClientRect().bottom;
  });
  await startSampler(page);
  await mark(page, "take");
  await page.keyboard.press("Enter");
  await still(page);
  const run = await stopSampler(page);
  const after = await fieldState(page);
  return {
    from: lines === 3 ? "three-line draft" : "empty draft",
    picked,
    lineFoot: +lineFoot.toFixed(1),
    lines: after.value.split("\n").length,
    height: steps(run, "h"),
    firstLineTop: steps(run, "y"),
    lastLineFoot: steps(run, "foot"),
  };
}

/** A touch on the pill, by pointer events: down, up by `rise`, then down by `drag`. */
function swipe(page, rise, drag) {
  return page.evaluate(
    async ({ rise: up, drag: down }) => {
      const pill = document.querySelector(".cin");
      const field = pill.querySelector("textarea");
      const b = field.getBoundingClientRect();
      const x = b.left + 40;
      let y = b.top + b.height / 2;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const fire = (type, target) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            pointerId: 7,
            pointerType: "touch",
            isPrimary: true,
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
          })
        );
      const active = () => field.getAttribute("aria-activedescendant");
      fire("pointerdown", field);
      for (let i = 0; i < up / 6; i += 1) {
        y -= 6;
        fire("pointermove", field);
        // biome-ignore lint/performance/noAwaitInLoops: a frame a move, as a finger
        await frame();
      }
      const opened = !!document.querySelector(".ghosts");
      await new Promise((r) => setTimeout(r, 400));
      const onOpen = active();
      for (let i = 0; i < down / 6; i += 1) {
        y += 6;
        fire("pointermove", document.body);
        // biome-ignore lint/performance/noAwaitInLoops: a frame a move, as a finger
        await frame();
      }
      const onDrag = active();
      fire("pointerup", document.body);
      await new Promise((r) => setTimeout(r, 600));
      return {
        opened,
        onOpen,
        onDrag,
        rolled: onOpen !== onDrag,
        settled: active(),
      };
    },
    { rise, drag }
  );
}

/** A real touch drag through CDP (Chromium): up off the pill, then down. */
async function cdpSwipe(page) {
  const cdp = await page.context().newCDPSession(page);
  const b = await page.evaluate(() => {
    const r = document.querySelector(".cin textarea").getBoundingClientRect();
    return { x: r.left + 40, y: r.top + r.height / 2 };
  });
  const touch = (type, y) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: b.x, y }],
    });
  await touch("touchStart", b.y);
  for (let d = 6; d <= 60; d += 6) {
    // biome-ignore lint/performance/noAwaitInLoops: a move at a time, as a finger
    await touch("touchMove", b.y - d);
    await page.waitForTimeout(16);
  }
  const opened = !!(await page.$(".ghosts"));
  await page.waitForTimeout(400);
  const active = () =>
    page.evaluate(() =>
      document
        .querySelector(".cin textarea")
        .getAttribute("aria-activedescendant")
    );
  const onOpen = await active();
  for (let d = 54; d >= -40; d -= 6) {
    // biome-ignore lint/performance/noAwaitInLoops: a move at a time, as a finger
    await touch("touchMove", b.y - d);
    await page.waitForTimeout(16);
  }
  const onDrag = await active();
  await touch("touchEnd", 0);
  await page.waitForTimeout(500);
  return { opened, onOpen, onDrag, rolled: onOpen !== onDrag };
}

/** Puts the wheel away with a press outside the composer. */
const pressOutside = (page) =>
  page.evaluate(() => {
    const target = document.querySelector(".tr") ?? document.body;
    target.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 9,
        pointerType: "touch",
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 200,
      })
    );
  });

async function desktop(engine, v) {
  const { browser, page } = await openPage(engine, v);
  const shot = (state) =>
    page.screenshot({ path: join(out, `${engine}-${v.name}-${state}.png`) });
  const r = { idle: await idleFrames(page) };
  await clearField(page);
  await still(page);
  const closed = await deckBoxes(page);
  // Mid-open, then open.
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(90);
  await shot("mid-open");
  await still(page);
  await shot("open");
  const open = await deckBoxes(page);
  r.geometry = await geometry(page);
  // Mid-close, then closed.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(140);
  await shot("mid-close");
  await still(page);
  const back = await deckBoxes(page);
  r.deck = deckResult(closed, open, back);
  r.draftDownDown = await draftRoundTrip(page, ["ArrowDown", "ArrowDown"]);
  r.draftEsc = await draftRoundTrip(page, ["Escape"]);
  // Step 35 is the sixth row up from the empty draft: three lines.
  r.takeThreeLines = await takeRun(page, 0, 5);
  r.takeOneIntoThree = await takeRun(page, 3, 1);
  await browser.close();
  return r;
}

function deckResult(closed, open, back) {
  const button = closed[0]?.w ?? 0;
  const left = Math.min(...open.map((b) => b.l));
  const right = Math.max(...open.map((b) => b.r));
  const restored = closed.every(
    (b, i) =>
      Math.abs(b.l - back[i].l) < 0.5 &&
      Math.abs(b.t - back[i].t) < 0.5 &&
      Math.abs(b.r - back[i].r) < 0.5 &&
      Math.abs(b.b - back[i].b) < 0.5
  );
  return {
    buttons: closed.length,
    buttonWidth: button,
    deckWidth: +(right - left).toFixed(2),
    limit: 1.5 * button,
    withinDeck: right - left <= 1.5 * button,
    restored,
  };
}

async function phone(engine, v) {
  const { browser, page } = await openPage(engine, v);
  const shot = (state) =>
    page.screenshot({ path: join(out, `${engine}-${v.name}-${state}.png`) });
  const r = { idle: await idleFrames(page) };
  await still(page);
  const closed = await deckBoxes(page);
  r.swipe = await swipe(page, 48, 80);
  await still(page);
  await shot("open");
  const open = await deckBoxes(page);
  r.geometry = await geometry(page);
  await pressOutside(page);
  await page.waitForTimeout(110);
  await shot("mid-close");
  await still(page);
  const back = await deckBoxes(page);
  r.deck = deckResult(closed, open, back);
  // Mid-open, by a swipe that stops rising.
  const midOpen = page.evaluate(() => {
    const field = document.querySelector(".cin textarea");
    const b = field.getBoundingClientRect();
    const fire = (type, at) =>
      field.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 8,
          pointerType: "touch",
          isPrimary: true,
          clientX: b.left + 40,
          clientY: at,
          bubbles: true,
          cancelable: true,
        })
      );
    const y = b.top + b.height / 2;
    fire("pointerdown", y);
    fire("pointermove", y - 12);
    fire("pointermove", y - 24);
  });
  await midOpen;
  await page.waitForTimeout(90);
  await shot("mid-open");
  await page.evaluate(() =>
    document.body.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 8,
        pointerType: "touch",
        bubbles: true,
      })
    )
  );
  await still(page);
  await pressOutside(page);
  await still(page);
  if (engine === "chromium") {
    r.cdpSwipe = await cdpSwipe(page);
    await pressOutside(page);
    await still(page);
  }
  await browser.close();
  return r;
}

async function reducedDeck(engine) {
  const [v] = VIEWPORTS;
  const { browser, page } = await openPage(engine, v, true);
  await clearField(page);
  await page.keyboard.press("ArrowUp");
  await still(page);
  const cards = await page.evaluate(() =>
    [...document.querySelector(".cin .ctrls").children]
      .filter((e) => e.getBoundingClientRect().width > 0)
      .map((e) => {
        const s = getComputedStyle(e);
        return { opacity: s.opacity, translate: s.translate, scale: s.scale };
      })
  );
  await page.keyboard.press("Escape");
  await browser.close();
  return cards;
}

for (const engine of Object.keys(ENGINES)) {
  report[engine] = {};
  for (const v of VIEWPORTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time keeps the frame timings honest
    report[engine][v.name] = await (v.touch ? phone : desktop)(engine, v);
  }
  report[engine].reducedMotionDeck = await reducedDeck(engine);
}
console.log(JSON.stringify(report, null, 1));
