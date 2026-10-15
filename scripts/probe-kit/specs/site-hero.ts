/**
 * cawco.dev's hero, scene 1 (site/src/hero): the stage read from the engine, never the picture.
 * Its own site dev server, on a free port (or `SITE_URL`, one already running). In order:
 *
 * 1. The words (eyebrow, headline, subhead, install) are whole at first paint, scripts or none,
 *    and nothing animates them. Without scripts the stage shows scene 1's first frame.
 * 2. The paused timeline, sought to every label: the lid's frame, the typing, the cards' heights
 *    and their shadows projected on the floor (offset and length growing with height, sheared
 *    by the machines' key light), the room at night; the lid clip frame by frame at 24 fps; the
 *    1px settle; the typing cadence and the caret's 530ms blink, read from the timeline itself.
 * 3. The drift: 10 / 14 / 18 px/s along the floor's y axis, and the same place at the same time
 *    across two loads.
 * 4. At night the lit screen brightens the floor in front of the laptop. Desk-box's lamp is the
 *    product's online colour (color.presence-online) in both schemes.
 * 5. Reduced motion stands on the summary frame; the pause holds the timeline and is kept for
 *    the visit; hovering the stage holds the hand-off.
 * 6. At 1440 × 900 the eyebrow, headline, subhead, install, the laptop's screen, desk-box and all
 *    three cards are above the fold, and the open lid stands a lattice step (24px) clear of
 *    desk-box. The headline's glyphs never touch: c and l in "close" keep 2px, at 1440 and 390.
 * 7. At every width from 360 to 1920: the paper's node on the laptop's floor origin, desk-box a
 *    lattice vector from it, the cards inside the window and the stage, clear of each other, of
 *    each other's shadows and of the machines.
 * 8. Mobile Safari's edge strips: the page ground in both themes and through the switch, at
 *    least 12px, no pointer events; none under a mouse.
 *
 * With `HERO_CAPTURES=<dir>` it also writes the hero at 1440 × 900 and 390 × 844, in both schemes,
 * at `typed` (saved as "ajar"), `lid-shut` and `cards-in`, for a review of the picture.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Kit, ROOT, type Spec, type View } from "../kit";

const SITE = join(ROOT, "site");
const ID = "hero-scene-1";

/** The product's online colour, by day and at night (design/tokens/cawco.tokens.json). */
const ONLINE = (() => {
  const tokens = JSON.parse(
    readFileSync(join(ROOT, "design/tokens/cawco.tokens.json"), "utf8")
  ) as {
    color: {
      "presence-online"?: {
        $value: string;
        $extensions?: { "dev.cawco"?: { dark?: string } };
      };
    };
  };
  const online = tokens.color["presence-online"];
  if (!online) {
    throw new Error("design/tokens has no color.presence-online");
  }
  return {
    light: online.$value,
    dark: online.$extensions?.["dev.cawco"]?.dark ?? online.$value,
  };
})();

/** The machines' key light (site/src/hero/iso.ts): a shadow's shear, across per down. */
const LIGHT_SHEAR = 0.4543 / 0.3637;

/** What the spec reads of the stage's gsap timeline (site/src/hero/scene.ts). */
interface Timeline {
  duration: () => number;
  getChildren: (
    nested: boolean,
    tweens: boolean,
    timelines: boolean
  ) => { startTime: () => number; targets: () => Element[] }[];
  labels: Record<string, number>;
  pause: () => void;
  paused: () => boolean;
  progress: (value?: number) => number;
  seek: (at: number | string, suppressEvents?: boolean) => void;
  time: () => number;
}

declare global {
  interface Window {
    /** The composition registry: the stage's timeline under its `data-composition-id`. */
    __timelines?: Record<string, Timeline>;
  }
}

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

async function siteServer(): Promise<{ base: string; stop: () => void }> {
  const given = process.env.SITE_URL;
  if (given) {
    return { base: given, stop: () => undefined };
  }
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  const child = Bun.spawn(
    [
      "bunx",
      "vite",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: SITE, stdout: "ignore", stderr: "ignore" }
  );
  const base = `http://127.0.0.1:${port}/`;
  for (let tries = 0; tries < 120; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polling one server until it answers
    const up = await fetch(base).then(
      (r) => r.ok,
      () => false
    );
    if (up) {
      return { base, stop: () => child.kill() };
    }
    await Bun.sleep(250);
  }
  child.kill();
  throw new Error("the site's dev server never answered");
}

/** The stage held still (the pause kept for the visit), so a spec seeks it alone. */
const keepPaused = () => sessionStorage.setItem("cawco-demos", "paused");

async function load(page: Page, base: string): Promise<void> {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction((id) => Boolean(window.__timelines?.[id]), ID);
  await page.evaluate(() => document.fonts.ready);
}

/** Seeks the stage's timeline to `at`, held there, then runs `read` in the page. */
async function seek<T>(
  page: Page,
  at: number | string,
  read: () => T
): Promise<T> {
  await page.evaluate(
    ([id, label]) => {
      const tl = window.__timelines?.[id];
      if (!tl) {
        throw new Error("no timeline");
      }
      tl.pause();
      tl.seek(label, false);
    },
    [ID, at] as const
  );
  return (await page.evaluate(read)) as T;
}

const frameOn = () =>
  Number(document.querySelector(".m-lap .lid.on")?.getAttribute("data-frame"));

async function words(kit: Kit, base: string): Promise<void> {
  for (const scripts of [true, false]) {
    // biome-ignore lint/performance/noAwaitInLoops: with scripts, then without, one page each
    const page = await kit.page("desk");
    if (!scripts) {
      await page.context().route("**/*.{ts,js}", (route) => route.abort());
    }
    await page.goto(base, { waitUntil: "domcontentloaded" });
    const v = await page.evaluate(() => ({
      opacity: [".eyebrow", "h1", ".lede", ".install"].map((s) =>
        Number(getComputedStyle(document.querySelector(s) as Element).opacity)
      ),
      moving: document
        .getAnimations()
        .filter((a) =>
          (a.effect as KeyframeEffect | null)?.target?.closest?.(
            ".eyebrow, h1, .lede, .install"
          )
        ).length,
      lid: document.querySelector(".m-lap .lid.on")?.getAttribute("data-frame"),
      typed: [...document.querySelectorAll("#m-screen .ch")].filter(
        (c) => getComputedStyle(c).display !== "none"
      ).length,
      caret: getComputedStyle(
        document.querySelector("#m-screen .caret") as Element
      ).visibility,
      cards: [...document.querySelectorAll(".session-card")].map((c) =>
        Number(getComputedStyle(c).opacity)
      ),
    }));
    kit.check(
      `the words are whole at first paint, nothing animates them (scripts ${scripts ? "on" : "off"})`,
      v.opacity.every((o) => o === 1) && v.moving === 0,
      JSON.stringify(v.opacity)
    );
    if (!scripts) {
      kit.check(
        "without scripts the stage shows the first frame: lid ajar, blank screen, a caret, no cards",
        v.lid === "0" &&
          v.typed === 0 &&
          v.caret === "visible" &&
          v.cards.every((o) => o === 0),
        JSON.stringify(v)
      );
    }
  }
}

const stateNow = () => ({
  frame: Number(
    document.querySelector(".m-lap .lid.on")?.getAttribute("data-frame")
  ),
  shadow: Number(
    document.querySelector(".m-lap .sh.on")?.getAttribute("data-frame")
  ),
  typed: [...document.querySelectorAll<HTMLElement>("#m-screen .ch")].filter(
    (c) => c.style.display === "inline"
  ).length,
  pool: Number(
    document.querySelector(".m-lap .pool")?.getAttribute("opacity") ?? 1
  ),
  dusk: Number(
    getComputedStyle(
      document.querySelector(".hero-stage") as Element
    ).getPropertyValue("--dusk")
  ),
  cards: [...document.querySelectorAll<HTMLElement>(".session-card")].map(
    (c) => {
      // The card's spot on the floor and its shadow there, in layout px (before any transform):
      // the shadow's offset from the card's foot, its length, its shear and its softness.
      const holder = c.parentElement as HTMLElement;
      const shadow = holder.querySelector(".card-shadow") as HTMLElement;
      const laptop = document.querySelector(".m-lap") as SVGSVGElement;
      const k =
        laptop.getBoundingClientRect().width / laptop.viewBox.baseVal.width;
      const hb = Number(getComputedStyle(holder).getPropertyValue("--hb"));
      const style = getComputedStyle(shadow);
      const shear = new DOMMatrix(style.transform).c;
      return {
        height: c.dataset.height,
        hb,
        lift: 1.0328 * hb * k,
        dx: shadow.offsetLeft,
        // How far the shadow lies below the card's foot on the floor, and below the card.
        floorDy: shadow.offsetTop - c.offsetHeight - 1.0328 * hb * k,
        gap: shadow.offsetTop - c.offsetHeight,
        length: shadow.offsetTop - c.offsetHeight + shadow.offsetHeight,
        shear,
        soft: Number.parseFloat(style.filter.replace(/[^\d.]/g, "")),
        alpha: (() => {
          const probe = document.createElement("canvas").getContext("2d");
          if (!probe) {
            return 0;
          }
          probe.fillStyle = style.backgroundColor;
          probe.fillRect(0, 0, 1, 1);
          return probe.getImageData(0, 0, 1, 1).data[3] ?? 0;
        })(),
        opacity: Number(getComputedStyle(c).opacity),
        shadowOpacity: Number(style.opacity),
        transform: getComputedStyle(c).transform,
        age: [...c.querySelectorAll("[data-age]")].find(
          (a) => getComputedStyle(a).visibility === "visible"
        )?.textContent,
      };
    }
  ),
});

async function labels(kit: Kit, page: Page): Promise<void> {
  const times = await page.evaluate((id) => {
    const tl = window.__timelines?.[id];
    return { length: tl?.duration() ?? 0, at: tl?.labels ?? {} };
  }, ID);
  kit.check(
    "the scene is one 7.6s timeline",
    Math.abs(times.length - 7.6) < 1e-9,
    String(times.length)
  );
  const ajar = await seek(page, "ajar", stateNow);
  kit.check(
    "ajar: lid frame 0, nothing typed, no cards",
    ajar.frame === 0 &&
      ajar.typed === 0 &&
      ajar.cards.every((c) => c.opacity === 0)
  );
  const typed = await seek(page, "typed", stateNow);
  const typedAt = times.at.typed ?? 0;
  kit.check(
    "typed: all 23 characters by ~1.4s, the lid still open",
    typed.typed === 23 && typed.frame === 0 && typedAt > 1.3 && typedAt < 1.45,
    `t ${typedAt.toFixed(3)}`
  );
  const shut = await seek(page, "lid-shut", stateNow);
  kit.check(
    "lid-shut: the lid's last frame (16) and its shadow; the screen's pool out",
    shut.frame === 16 && shut.shadow === 16 && shut.pool === 0,
    `t ${(times.at["lid-shut"] ?? 0).toFixed(3)}`
  );
  const { cards } = await seek(page, "cards-in", stateNow);
  const [h1, , h2] = cards;
  kit.check(
    "cards-in: heights h1 / h1 / h2, every card and its floor shadow in",
    cards.map((c) => c.height).join() === "1,1,2" &&
      cards.every(
        (c) =>
          c.opacity === 1 &&
          c.shadowOpacity === 1 &&
          c.transform === "matrix(1, 0, 0, 1, 0, 0)"
      )
  );
  kit.check(
    "each card's shadow lies on the floor along the machines' key light: offset in proportion to its height, sheared 1.249 across per down",
    cards.every(
      (c) =>
        Math.abs(c.dx / c.floorDy - LIGHT_SHEAR) < 0.02 &&
        Math.abs(c.shear - LIGHT_SHEAR) < 0.01
    ),
    cards
      .map(
        (c) =>
          `h${c.height} (${c.hb}mm): +${c.dx.toFixed(1)}, +${c.floorDy.toFixed(1)} past its foot, shear ${c.shear.toFixed(3)}`
      )
      .join("; ")
  );
  kit.check(
    "the needs-you card (h2) is held highest: its shadow farther off, longer, softer and fainter than a working card's (h1)",
    h1 !== undefined &&
      h2 !== undefined &&
      h2.lift > h1.lift &&
      h2.dx > h1.dx &&
      h2.gap > h1.gap &&
      h2.length > h1.length &&
      h2.soft > h1.soft &&
      h2.alpha < h1.alpha,
    [h1, h2]
      .map(
        (c) =>
          c &&
          `h${c.height}: lift ${c.lift.toFixed(1)}px, shadow ${c.gap.toFixed(1)}px below the card, reaching ${c.length.toFixed(1)}px, blur ${c.soft}px, alpha ${c.alpha}`
      )
      .join("; ")
  );
  const summary = await seek(page, "summary", stateNow);
  kit.check(
    "summary: lid shut, every card in at 4m, the room down",
    summary.frame === 16 &&
      summary.dusk === 1 &&
      summary.cards.every((c) => c.age === "4m" && c.opacity === 1)
  );
}

async function lidClip(kit: Kit, page: Page): Promise<void> {
  const close = await page.evaluate(
    (id) => window.__timelines?.[id]?.labels.close ?? 0,
    ID
  );
  const frames: number[] = [];
  for (let i = 0; i < 18; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame of the clip after another
    frames.push(await seek(page, close + i / 24 + 0.001, frameOn));
  }
  frames.push(await seek(page, close - 0.01, frameOn));
  kit.check(
    "the lid clip shows one baked pose per 1/24s, 0 to 16, and frame 0 when sought before it",
    frames.slice(0, 17).every((f, i) => f === i) &&
      frames[17] === 16 &&
      frames[18] === 0,
    frames.join(" ")
  );
  const shut = await page.evaluate(
    (id) => window.__timelines?.[id]?.labels["lid-shut"] ?? 0,
    ID
  );
  const lap = () =>
    getComputedStyle(document.querySelector(".m-lap") as Element).transform;
  const down = await seek(page, shut + 0.06, lap);
  const back = await seek(page, shut + 0.4, lap);
  kit.check(
    "the catch settles the laptop 1px and back",
    down === "matrix(1, 0, 0, 1, 0, 1)" && back === "matrix(1, 0, 0, 1, 0, 0)",
    `${down} → ${back}`
  );
}

async function cadence(kit: Kit, page: Page): Promise<void> {
  const keys = await page.evaluate((id) => {
    const children =
      window.__timelines?.[id]?.getChildren(false, true, false) ?? [];
    const characters = [...document.querySelectorAll("#m-screen .ch")];
    const caret = document.querySelector("#m-screen .caret");
    const startsOf = (pick: (target: Element | undefined) => boolean) =>
      children.filter((c) => pick(c.targets()[0])).map((c) => c.startTime());
    return {
      typed: startsOf((t) => characters.includes(t as Element)),
      blinks: startsOf((t) => t === caret),
    };
  }, ID);
  const gaps = keys.typed
    .slice(1)
    .map((t, i) => (t - (keys.typed[i] ?? 0)) * 1000);
  kit.check(
    "the line types 45 ± 15ms a character, from 0.3s",
    (keys.typed[0] ?? 0) > 0.3 &&
      Math.min(...gaps) >= 30 &&
      Math.max(...gaps) <= 60,
    `${Math.min(...gaps).toFixed(1)}–${Math.max(...gaps).toFixed(1)}ms`
  );
  const steps = keys.blinks
    .slice(2)
    .map((t, i) => t - (keys.blinks[i + 1] ?? 0));
  kit.check(
    "the caret blinks in 530ms steps once typed",
    steps.every((s) => Math.abs(s - 0.53) < 1e-3),
    keys.blinks.map((b) => b.toFixed(3)).join(" ")
  );
}

const driftBoxes = () =>
  [...document.querySelectorAll("[data-drift]")].map((d) => {
    const b = d.getBoundingClientRect();
    return [b.x, b.y];
  });

const cardPlaces = () =>
  JSON.stringify(
    [...document.querySelectorAll(".session-card")].map((c) => {
      const b = c.getBoundingClientRect();
      return [Number(b.x.toFixed(3)), Number(b.y.toFixed(3))];
    })
  );

async function drift(kit: Kit, page: Page, base: string): Promise<void> {
  const a = await seek(page, 5, driftBoxes);
  const b = await seek(page, 6, driftBoxes);
  const speeds = a.map(([x = 0, y = 0], i) => {
    const [x1 = 0, y1 = 0] = b[i] ?? [];
    return {
      speed: Math.hypot(x1 - x, y1 - y),
      angle: (Math.atan2(y1 - y, x1 - x) * 180) / Math.PI,
    };
  });
  // Card 1 (middle), card 2 (front), card 3 (back): the nearest fastest.
  kit.check(
    "the cards drift back along the floor's y axis (30° up and to the right), 14 / 18 / 10 px/s, the nearest fastest",
    speeds.map((s) => Math.round(s.speed)).join() === "14,18,10" &&
      speeds.every((s) => Math.abs(s.angle + 30) < 0.5),
    speeds
      .map((s) => `${s.speed.toFixed(2)}px/s at ${s.angle.toFixed(1)}°`)
      .join(", ")
  );
  const runs: string[] = [];
  for (const run of [0, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: two loads, one after the other
    const fresh = await kit.page("desk", { init: [keepPaused] });
    await load(fresh, base);
    const places: string[] = [];
    for (const t of [3.4, 5.25, 7.6]) {
      // biome-ignore lint/performance/noAwaitInLoops: one seek of one timeline after another
      places.push(await seek(fresh, t, cardPlaces));
    }
    runs[run] = places.join("|");
  }
  kit.check(
    "the drift lands at the same place at the same time across two loads",
    runs[0] === runs[1]
  );
}

async function night(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { theme: "dark", init: [keepPaused] });
  await load(page, base);
  const pool = () =>
    Number(
      document.querySelector(".m-lap .pool")?.getAttribute("opacity") ?? 1
    );
  const shown = await page.evaluate(() =>
    [...document.querySelectorAll(".machine .pool, .machine .glow")].map(
      (e) => getComputedStyle(e).display
    )
  );
  const close = await page.evaluate(
    (id) => window.__timelines?.[id]?.labels.close ?? 0,
    ID
  );
  const lit = await seek(page, "typed", pool);
  const mid = await seek(page, close + 10.5 / 24, pool);
  const out = await seek(page, "lid-shut", pool);
  kit.check(
    "at night the screen's pool and the lamp's glow are drawn, and the pool goes out as the lid shuts",
    shown.every((d) => d !== "none") &&
      lit === 1 &&
      mid > 0 &&
      mid < 1 &&
      out === 0,
    `pool ${lit} → ${mid} → ${out}`
  );
  // What drawing alone decides: the light itself. One lattice tile of floor in front of the
  // laptop, against one at the same depth off to its side, while the screen is lit.
  await seek(page, "typed", frameOn);
  const spots = await page.evaluate(() => {
    const laptop = document.querySelector(".m-lap") as SVGSVGElement;
    const m = laptop.getScreenCTM() as DOMMatrix;
    // Floor points in the drawing's own units: (x - y) * 0.8944, (x + y) * 0.5164.
    const at = (x: number, y: number) =>
      new DOMPoint((x - y) * 0.8944, (x + y) * 0.5164).matrixTransform(m);
    const front = at(0, 175);
    const side = at(-330, 175);
    return [front, side].map((p) => ({
      x: p.x - 12 + scrollX,
      y: p.y - 20.8 + scrollY,
    }));
  });
  const lumas: number[] = [];
  for (const spot of spots) {
    // biome-ignore lint/performance/noAwaitInLoops: one patch after the other on one page
    lumas.push(await meanLuma(page, { ...spot, width: 24, height: 41.6 }));
  }
  const [inFront = 0, aside = 0] = lumas;
  kit.check(
    "at night the lit screen visibly brightens the floor in front of the laptop",
    inFront - aside >= 6,
    `mean luma ${inFront.toFixed(1)} in front against ${aside.toFixed(1)} aside`
  );
}

/** The mean luma (0–255) of a patch of the page, from a capture read back in the page. */
async function meanLuma(
  page: Page,
  clip: { height: number; width: number; x: number; y: number }
): Promise<number> {
  const png = (await page.screenshot({ clip, fullPage: true })).toString(
    "base64"
  );
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      sum +=
        0.2126 * (pixels[i] ?? 0) +
        0.7152 * (pixels[i + 1] ?? 0) +
        0.0722 * (pixels[i + 2] ?? 0);
    }
    return sum / (pixels.length / 4);
  }, png);
}

async function lampColour(kit: Kit, base: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one scheme after the other
    const page = await kit.page("desk", { theme });
    await load(page, base);
    const v = await page.evaluate((token) => {
      // Both colours as sRGB bytes, through a canvas, so oklch and rgb compare alike.
      const ctx = document
        .createElement("canvas")
        .getContext("2d") as CanvasRenderingContext2D;
      const rgb = (colour: string) => {
        ctx.fillStyle = "#000";
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
      };
      const use = document.querySelector(".m-desk use.lamp") as Element;
      return { lamp: rgb(getComputedStyle(use).fill), token: rgb(token) };
    }, ONLINE[theme]);
    kit.check(
      `desk-box's lamp is lit in the product's online colour (${theme})`,
      v.lamp === v.token,
      `lamp ${v.lamp}, color.presence-online ${v.token} (${ONLINE[theme]})`
    );
  }
}

async function playing(kit: Kit, base: string): Promise<void> {
  const still = await kit.page("desk");
  await still.emulateMedia({ reducedMotion: "reduce" });
  await load(still, base);
  await still.waitForTimeout(300);
  const r = await still.evaluate((id) => {
    const tl = window.__timelines?.[id];
    return {
      progress: tl?.progress(),
      paused: tl?.paused(),
      frame: document
        .querySelector(".m-lap .lid.on")
        ?.getAttribute("data-frame"),
      pause:
        document.querySelector<HTMLButtonElement>("[data-demo-pause]")?.hidden,
    };
  }, ID);
  kit.check(
    "reduced motion: the summary frame, still, no pause to press",
    r.progress === 1 &&
      r.paused === true &&
      r.frame === "16" &&
      r.pause === true,
    JSON.stringify(r)
  );

  const page = await kit.page("desk");
  await load(page, base);
  const time = () =>
    page.evaluate((id) => window.__timelines?.[id]?.time() ?? -1, ID);
  const progress = () =>
    page.evaluate((id) => window.__timelines?.[id]?.progress() ?? -1, ID);
  await page.waitForFunction(
    (id) => (window.__timelines?.[id]?.time() ?? 0) > 0.5,
    ID
  );
  await page.click("[data-demo-pause]");
  const t1 = await time();
  await page.waitForTimeout(700);
  const t2 = await time();
  const label = await page.textContent("[data-demo-pause-label]");
  kit.check(
    "Pause holds the timeline and says Play demos",
    t1 === t2 && label === "Play demos",
    `${t1.toFixed(3)} → ${t2.toFixed(3)}`
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await load(page, base);
  await page.waitForTimeout(400);
  const kept = {
    progress: await progress(),
    frame: await page.evaluate(frameOn),
    label: await page.textContent("[data-demo-pause-label]"),
  };
  kit.check(
    "the pause is kept for the visit: after a reload, the summary frame and Play demos",
    kept.progress === 1 && kept.frame === 16 && kept.label === "Play demos",
    JSON.stringify(kept)
  );
  await page.click("[data-demo-pause]");
  await page.waitForTimeout(400);
  const t3 = await time();
  kit.check(
    "Play starts scene 1 over at once",
    t3 > 0.2 && t3 < 1,
    t3.toFixed(3)
  );
  await page.evaluate((id) => window.__timelines?.[id]?.progress(0.999), ID);
  await page.waitForFunction(
    (id) => window.__timelines?.[id]?.progress() === 1,
    ID
  );
  await page.hover(".hero-stage", { position: { x: 300, y: 300 } });
  await page.waitForTimeout(3200);
  const holding = await progress();
  await page.mouse.move(5, 5);
  await page.waitForTimeout(2900);
  const after = await progress();
  kit.check(
    "hovering the stage holds the hand-off; leaving it lets beat 1 come round",
    holding === 1 && after < 0.2,
    `${holding} → ${after.toFixed(3)}`
  );
}

/** How low each thing the fold must show reaches, in the window, unscrolled. */
const foldNow = () => {
  // The screen is drawn only while the lid is open.
  const bottom = (s: string) =>
    document.querySelector(s)?.getBoundingClientRect().bottom ?? 0;
  return {
    eyebrow: bottom(".eyebrow"),
    headline: bottom("h1"),
    subhead: bottom(".lede"),
    install: bottom(".install"),
    screen: bottom(".m-lap .lid.on .scr"),
    deskBox: bottom(".m-desk > path.t"),
    cards: Math.max(
      ...[...document.querySelectorAll(".session-card")].map(
        (c) => c.getBoundingClientRect().bottom
      )
    ),
  };
};

/** The least distance between the shown lid's outline and desk-box's, in px on screen. */
const lidToBox = () => {
  const outline = (s: string) => {
    const path = document.querySelector(s) as SVGPathElement;
    const m = path.getScreenCTM() as DOMMatrix;
    const length = path.getTotalLength();
    const points: DOMPoint[] = [];
    for (let at = 0; at <= length; at += 1) {
      const p = path.getPointAtLength(at);
      points.push(new DOMPoint(p.x, p.y).matrixTransform(m));
    }
    return points;
  };
  const lid = outline(".m-lap .lid.on > path");
  const box = outline(".m-desk > path.t");
  let least = Number.POSITIVE_INFINITY;
  for (const a of lid) {
    for (const b of box) {
      least = Math.min(least, Math.hypot(a.x - b.x, a.y - b.y));
    }
  }
  return least;
};

async function desktopFold(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { init: [keepPaused] });
  await load(page, base);
  const reach: Record<string, number> = {};
  for (const label of ["typed", "cards-in", "summary"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one label of one timeline after another
    const at = await seek(page, label, foldNow);
    for (const [part, bottom] of Object.entries(at)) {
      if (label === "typed" ? part !== "cards" : part === "cards") {
        reach[part] = Math.max(reach[part] ?? 0, bottom);
      }
    }
  }
  kit.check(
    "1440 × 900: eyebrow, headline, subhead, install, the laptop's screen, desk-box and all three cards end above y 900",
    Object.values(reach).every((bottom) => bottom <= 900),
    Object.entries(reach)
      .map(([part, bottom]) => `${part} ${bottom.toFixed(1)}`)
      .join(", ")
  );
  const k = await page.evaluate(() => {
    const laptop = document.querySelector(".m-lap") as SVGSVGElement;
    return laptop.getBoundingClientRect().width / laptop.viewBox.baseVal.width;
  });
  kit.check(
    "1440: the machines are drawn at k 0.8",
    Math.abs(k - 0.8) < 1e-3,
    k.toFixed(4)
  );
  const gap = await seek(page, "typed", lidToBox);
  kit.check(
    "1440: the open lid stands at least a lattice step (24px) clear of desk-box",
    gap >= 24,
    `${gap.toFixed(1)}px`
  );
}

interface Glyph {
  ch: string;
  left: number;
  line: number;
  right: number;
}

/** The headline's glyphs in order (the stem and tail 1), from `Range.getClientRects`; null between words. */
const headlineGlyphs = () => {
  const h1 = document.querySelector("h1") as Element;
  const characters: [Text, number][] = [];
  for (const part of [".stem", ".tail.is-on"]) {
    const walker = document.createTreeWalker(
      h1.querySelector(part) as Element,
      NodeFilter.SHOW_TEXT
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      for (let i = 0; i < text.data.length; i += 1) {
        characters.push([text, i]);
      }
    }
    characters.push([document.createTextNode(" "), 0]);
  }
  const glyphs: (Glyph | null)[] = [];
  for (const [node, i] of characters) {
    const ch = node.data[i] ?? " ";
    if (ch === " ") {
      glyphs.push(null);
      continue;
    }
    const range = document.createRange();
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const box = range.getClientRects()[0] as DOMRect;
    glyphs.push({
      ch,
      left: box.left,
      right: box.right,
      line: Math.round(box.top),
    });
  }
  const box = h1.getBoundingClientRect();
  return {
    glyphs,
    size: getComputedStyle(h1).fontSize,
    clip: {
      x: box.left + scrollX - 20,
      y: box.top + scrollY - 10,
      width: box.width + 40,
      height: box.height + 20,
    },
  };
};

/**
 * Paints only the glyphs of line `line` whose index is `set` mod 4; the rest of the headline is
 * clear, so a capture holds no neighbour's ink and no other line's.
 */
const paintSet = ([set, line]: [number, number]) => {
  const h1 = document.querySelector("h1") as HTMLElement;
  h1.style.color = "transparent";
  let style = document.getElementById("glyph-sets");
  if (!style) {
    style = document.createElement("style");
    style.id = "glyph-sets";
    style.textContent = "::highlight(glyph-set) { color: #000; }";
    document.head.append(style);
  }
  const ranges: Range[] = [];
  let index = 0;
  const parts = [".stem", ".tail.is-on"].map(
    (part) => h1.querySelector(part) as Element
  );
  for (const part of parts) {
    const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      for (let i = 0; i < text.data.length; i += 1) {
        if (text.data[i] === " ") {
          continue;
        }
        const range = document.createRange();
        range.setStart(text, i);
        range.setEnd(text, i + 1);
        const top = Math.round((range.getClientRects()[0] as DOMRect).top);
        if (index % 4 === set && top === line) {
          ranges.push(range);
        }
        index += 1;
      }
    }
  }
  CSS.highlights.set("glyph-set", new Highlight(...ranges));
};

/**
 * The least distance between each pair of neighbouring glyphs' ink, in css px, from the captures
 * of the headline (`sets`, keyed "line:set", each with every fourth glyph of one line painted):
 * a glyph's ink is the dark pixels of its own capture within half an em of its box.
 */
const inkGaps = async ([sets, glyphs, clip, size]: [
  Record<string, string>,
  (Glyph | null)[],
  { width: number; x: number; y: number },
  number,
]) => {
  const keys = Object.keys(sets);
  const decoded = await Promise.all(
    keys.map(async (key) => {
      const data = sets[key] as string;
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(image, 0, 0);
      return ctx.getImageData(0, 0, image.width, image.height);
    })
  );
  const images = new Map(keys.map((key, i) => [key, decoded[i] as ImageData]));
  const scale = (decoded[0]?.width ?? 1) / clip.width;
  const inkOf = (glyph: Glyph, set: number) => {
    const image = images.get(`${glyph.line}:${set}`) as ImageData;
    const from = Math.max(
      0,
      Math.floor((glyph.left - size / 2 - clip.x + scrollX) * scale)
    );
    const to = Math.min(
      image.width,
      Math.ceil((glyph.right + size / 2 - clip.x + scrollX) * scale)
    );
    const dark = (x: number, y: number) => {
      const at = (y * image.width + x) * 4;
      return (
        (image.data[at] ?? 255) +
          (image.data[at + 1] ?? 255) +
          (image.data[at + 2] ?? 255) <
        384
      );
    };
    const edge: [number, number][] = [];
    for (let y = 1; y < image.height - 1; y += 1) {
      for (
        let x = Math.max(1, from);
        x < Math.min(image.width - 1, to);
        x += 1
      ) {
        if (
          dark(x, y) &&
          !(
            dark(x - 1, y) &&
            dark(x + 1, y) &&
            dark(x, y - 1) &&
            dark(x, y + 1)
          )
        ) {
          edge.push([x, y]);
        }
      }
    }
    return edge;
  };
  const pairs: { gap: number; pair: string }[] = [];
  let index = 0;
  let before: { glyph: Glyph; set: number } | null = null;
  for (const glyph of glyphs) {
    if (!glyph) {
      before = null;
      continue;
    }
    const set = index % 4;
    index += 1;
    if (before && before.glyph.line === glyph.line) {
      const a = inkOf(before.glyph, before.set);
      const b = inkOf(glyph, set);
      let least = Number.POSITIVE_INFINITY;
      for (const [ax, ay] of a) {
        for (const [bx, by] of b) {
          least = Math.min(least, Math.hypot(ax - bx, ay - by));
        }
      }
      pairs.push({
        pair: before.glyph.ch + glyph.ch,
        gap: (least - 1) / scale,
      });
    }
    before = { glyph, set };
  }
  return pairs;
};

async function headlineInk(kit: Kit, base: string): Promise<void> {
  for (const view of ["desk", "phone"] as View[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width after the other
    const page = await kit.page(view);
    await load(page, base);
    const { glyphs: list, size, clip } = await page.evaluate(headlineGlyphs);
    const lines = [
      ...new Set(list.filter((g): g is Glyph => g !== null).map((g) => g.line)),
    ];
    const sets: Record<string, string> = {};
    for (const line of lines) {
      for (const set of [0, 1, 2, 3]) {
        // biome-ignore lint/performance/noAwaitInLoops: one glyph set painted, then captured, on one page
        await page.evaluate(paintSet, [set, line] as [number, number]);
        const shot = await page.screenshot({ clip, fullPage: true });
        sets[`${line}:${set}`] = shot.toString("base64");
      }
    }
    const pairs = await page.evaluate(inkGaps, [
      sets,
      list,
      clip,
      Number.parseFloat(size),
    ] as [
      Record<string, string>,
      (Glyph | null)[],
      { width: number; x: number; y: number },
      number,
    ]);
    const cl = pairs.find((p) => p.pair === "cl");
    const [tightest] = [...pairs].sort((a, b) => a.gap - b.gap);
    kit.check(
      `${view === "desk" ? 1440 : 390}: "close" keeps c and l 2px apart, and no two glyphs of the headline touch`,
      cl !== undefined && cl.gap >= 2 && pairs.every((p) => p.gap > 0.5),
      `at ${size}, measured on the rendered ink: c–l ${cl?.gap.toFixed(2)}px, tightest ${tightest?.pair} ${tightest?.gap.toFixed(2)}px`
    );
  }
}

/** The install's label and its channel switch: apart, and the switch's corners not a pill's. */
async function installHead(kit: Kit, base: string): Promise<void> {
  for (const view of ["desk", "phone"] as View[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width after the other
    const page = await kit.page(view);
    await load(page, base);
    const v = await page.evaluate(() => {
      const label = (
        document.querySelector(".install-label") as Element
      ).getBoundingClientRect();
      const group = document.querySelector("[data-channel]") as Element;
      const box = group.getBoundingClientRect();
      const tab = group.querySelector(".tab") as Element;
      const apart =
        box.top >= label.bottom + 4 ||
        box.bottom <= label.top - 4 ||
        box.left >= label.right + 4 ||
        box.right <= label.left - 4;
      return {
        apart,
        outer: getComputedStyle(group).borderTopLeftRadius,
        inner: getComputedStyle(tab).borderTopLeftRadius,
        tabHeight: tab.getBoundingClientRect().height,
      };
    });
    kit.check(
      `${view === "desk" ? 1440 : 390}: the install label and the channel switch stand apart; the switch is a 12px track round 8px tabs, no pill`,
      v.apart && v.outer === "12px" && v.inner === "8px",
      JSON.stringify(v)
    );
  }
}

/** The hero for a review of the picture: 1440 and 390, both schemes, three moments. */
async function captures(kit: Kit, base: string, dir: string): Promise<void> {
  const moments = [
    ["typed", "ajar"],
    ["lid-shut", "lid-shut"],
    ["cards-in", "cards-in"],
  ] as const;
  for (const view of ["desk", "phone"] as View[]) {
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one capture after another
      const page = await kit.page(view, { theme, init: [keepPaused] });
      await load(page, base);
      const clip = await page.evaluate(() => {
        const hero = (
          document.querySelector(".hero") as Element
        ).getBoundingClientRect();
        return {
          x: 0,
          y: 0,
          width: innerWidth,
          height: Math.ceil(hero.bottom + scrollY),
        };
      });
      for (const [label, name] of moments) {
        // biome-ignore lint/performance/noAwaitInLoops: one moment sought, then captured, on one page
        await seek(page, label, frameOn);
        await page.screenshot({
          path: join(
            dir,
            `hero-${view === "desk" ? 1440 : 390}-${theme}-${name}.png`
          ),
          clip,
          fullPage: true,
        });
      }
    }
  }
  kit.note(`12 captures in ${dir}`);
}

/** Where the floor stands at this width: the paper's node, both machines' floor origins. */
const registration = () => {
  const stage = (
    document.querySelector(".hero-stage") as Element
  ).getBoundingClientRect();
  const origin = (selector: string) => {
    const svg = document.querySelector(selector) as SVGSVGElement;
    const b = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const k = b.width / vb.width;
    return [b.left - vb.x * k, b.top - vb.y * k];
  };
  const layers = getComputedStyle(
    document.querySelector(".hero-stage") as Element,
    "::before"
  ).backgroundPosition.split(",");
  const [nx = 0, ny = 0] = (layers[1] ?? "")
    .trim()
    .split(" ")
    .map(Number.parseFloat);
  return {
    node: [stage.left + stage.width / 2 - innerWidth / 2 + nx, stage.top + ny],
    laptop: origin(".m-lap"),
    desk: origin(".m-desk"),
    stage: stage.bottom,
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  };
};

/**
 * The cards' boxes and shadows, how many of each card's edge points fall on the laptop, and
 * whether one covers desk-box's lamp. A card may pass in front of desk-box's side, which it
 * rises off; never in front of the laptop, nor of the lamp.
 */
const cardsNow = () => {
  const bodies = [".m-lap > path.t", ".m-lap .lid.on > path"].map(
    (s) => document.querySelector(s) as SVGGeometryElement
  );
  const onMachine = (x: number, y: number) =>
    bodies.some((body) =>
      body.isPointInFill(
        new DOMPoint(x, y).matrixTransform(
          (body.getScreenCTM() as DOMMatrix).inverse()
        )
      )
    );
  const lamp = (
    document.querySelector(".m-desk use.lamp") as Element
  ).getBoundingClientRect();
  return [...document.querySelectorAll(".session-card")].map((card) => {
    const r = card.getBoundingClientRect();
    const s = (
      (card.parentElement as Element).querySelector(".card-shadow") as Element
    ).getBoundingClientRect();
    const edge = Array.from(
      { length: 11 },
      (_, at) => r.left + (r.width * at) / 10
    );
    return {
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      shadow: { left: s.left, right: s.right, top: s.top, bottom: s.bottom },
      covers: edge.filter((x) => onMachine(x, r.top) || onMachine(x, r.bottom))
        .length,
      lamp:
        lamp.left + lamp.width / 2 > r.left &&
        lamp.left + lamp.width / 2 < r.right &&
        lamp.top + lamp.height / 2 > r.top &&
        lamp.top + lamp.height / 2 < r.bottom,
    };
  });
};

const meet = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > -2;

/** What is wrong with the cards at one label, a line each; none when every card stands clear. */
const cardFaults = (
  label: string,
  cards: ReturnType<typeof cardsNow>,
  floor: { stage: number; width: number }
): string[] =>
  cards.flatMap(({ box, covers, lamp, shadow }, i) =>
    (
      [
        [box.left < 0 || box.right > floor.width, " leaves the window"],
        [box.bottom > floor.stage + 0.5, " leaves the stage"],
        [covers > 0, " covers the laptop"],
        [lamp, " covers desk-box's lamp"],
        [
          cards.slice(i + 1).some((other) => meet(box, other.box)),
          " meets another",
        ],
        [
          cards.some((other, j) => j !== i && meet(other.box, shadow)),
          "'s shadow lies under another card",
        ],
      ] as [boolean, string][]
    )
      .filter(([hit]) => hit)
      .map(([, what]) => `${label}: card ${i + 1}${what}`)
  );

async function layout(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { init: [keepPaused] });
  for (const width of [360, 390, 500, 600, 768, 1024, 1199, 1200, 1440, 1920]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time on one page
    await page.setViewportSize({ width, height: 900 });
    await load(page, base);
    const floor = await page.evaluate(registration);
    const [lx = 0, ly = 0] = floor.laptop;
    const [bx = 0, by = 0] = floor.desk;
    const [nx = 0, ny = 0] = floor.node;
    const dx = bx - lx;
    const dy = by - ly;
    const bad: string[] = [];
    for (const label of ["cards-in", "summary"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one label of one timeline after another
      const cards = await seek(page, label, cardsNow);
      bad.push(...cardFaults(label, cards, floor));
    }
    const node = Math.hypot(nx - lx, ny - ly);
    // A lattice vector: whole rows of 20.8px, and across whole 24px steps, offset 12px on odd rows.
    const row = Math.round(dy / 20.8);
    const across = (dx - 12 * Math.abs(row % 2)) / 24;
    const onLattice =
      Math.abs(dy / 20.8 - row) < 0.01 &&
      Math.abs(across - Math.round(across)) < 0.01;
    kit.check(
      `${width}px: the paper's node on the laptop's origin, desk-box a lattice step away, the cards clear`,
      node < 0.05 && onLattice && floor.scroll === width && bad.length === 0,
      `node ${node.toFixed(3)}px, box (${dx.toFixed(1)}, ${dy.toFixed(1)})${bad.length > 0 ? `, ${bad.join("; ")}` : ""}`
    );
  }
}

/** Every colour as sRGB bytes through a canvas, so oklch, hex and rgb compare alike. */
const edgesNow = () => {
  const ctx = document
    .createElement("canvas")
    .getContext("2d") as CanvasRenderingContext2D;
  const rgb = (colour: string) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)].join(",");
  };
  const after = (s: string) =>
    getComputedStyle(document.querySelector(s) as Element, "::after");
  const meta = [
    ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  ].find((m) => !m.media || matchMedia(m.media).matches);
  const probe = document.createElement("div");
  probe.style.background = "var(--paper)";
  document.body.append(probe);
  const ground = rgb(getComputedStyle(probe).backgroundColor);
  probe.remove();
  const strips = [after(".edge-top"), after(".edge-bottom")];
  return {
    ground,
    colours: [
      ...strips.map((s) => rgb(s.backgroundColor)),
      rgb(getComputedStyle(document.documentElement).backgroundColor),
      rgb(getComputedStyle(document.body).backgroundColor),
      meta ? rgb(meta.content) : "none",
    ],
    heights: strips.map((s) => Number.parseFloat(s.height)),
    inert: strips.every(
      (s) => s.pointerEvents === "none" && s.position === "fixed"
    ),
  };
};

async function edges(kit: Kit, base: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one system scheme at a time
    const page = await kit.page("phone", { theme });
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-theme-switch]:not([hidden])");
    for (const pick of [
      theme,
      theme === "light" ? "dark" : "light",
      "system",
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: one pick after another on one page
      await page.click(`[data-theme-switch] [data-tab="${pick}"]`);
      const v = await page.evaluate(edgesNow);
      kit.check(
        `Safari's edges on a phone (${theme} system, ${pick} picked): both strips, html, body and theme-color are the ground, 12px+, inert`,
        v.colours.every((x) => x === v.ground) &&
          v.heights.every((h) => h >= 12) &&
          v.inert,
        `ground ${v.ground}; ${v.colours.join(" | ")}; ${v.heights.join("/")}px`
      );
    }
  }
  const desk = await kit.page("desk");
  await desk.goto(base, { waitUntil: "domcontentloaded" });
  const drawn = await desk.evaluate(() =>
    [".edge-top", ".edge-bottom"].map(
      (s) =>
        getComputedStyle(document.querySelector(s) as Element, "::after")
          .content
    )
  );
  kit.check(
    "under a mouse the strips are not drawn",
    drawn.every((d) => d === "none"),
    drawn.join(" ")
  );
}

export default {
  name: "site-hero",
  run: async (kit: Kit) => {
    const server = await siteServer();
    try {
      await words(kit, server.base);
      const page = await kit.page("desk", { init: [keepPaused] });
      await load(page, server.base);
      await labels(kit, page);
      await lidClip(kit, page);
      await cadence(kit, page);
      await drift(kit, page, server.base);
      await night(kit, server.base);
      await lampColour(kit, server.base);
      await playing(kit, server.base);
      await desktopFold(kit, server.base);
      await headlineInk(kit, server.base);
      await installHead(kit, server.base);
      await layout(kit, server.base);
      await edges(kit, server.base);
      const dir = process.env.HERO_CAPTURES;
      if (dir) {
        await captures(kit, server.base, dir);
      }
    } finally {
      server.stop();
    }
  },
} satisfies Spec;
