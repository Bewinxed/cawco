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
 * 4. The drawn pixels, where only drawing decides (one capture of the stage, read in the page):
 *    each card's floor shadow is dark against the ground (14 levels of luma at night, 25 by
 *    day) and its drawn ends lean along the key light; the closed laptop's shadow beside its
 *    base and desk-box's on open floor are as dark; at night the lit screen, turned down, is 40
 *    levels above any other surface of the laptop and 40 below the headline's glyphs, and its
 *    light falls on the deck and the floor straight in front, not beside. Desk-box's lamp is
 *    the product's online colour (color.presence-online) in both schemes.
 * 5. Reduced motion stands on the summary frame; the pause holds the timeline and is kept for
 *    the visit; hovering the stage holds the hand-off.
 * 6. At 1440 × 900 the eyebrow, headline, subhead, install, the laptop's screen, desk-box and all
 *    three cards are above the fold, and the open lid stands a lattice step (24px) clear of
 *    desk-box. The headline's glyphs never touch: c and l in "close" keep 2px, at 1440 and 390.
 * 7. At every width from 360 to 1920: the paper's node on the laptop's floor origin, desk-box a
 *    lattice vector from it, the open lid 12px clear of it, the cards 12px right of it, inside
 *    the window and the stage with their shadows, clear of each other, of each other's shadows
 *    and of the machines. On a phone the cards read at 10.5px from 390 (10px at 360), every
 *    glyph run in them too, the state as large as the title; below 552 they drop the harness
 *    glyph and the age.
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

/**
 * How far below the ground's luma a shadow's darkest band must fall: at night, by day. At night
 * 14, not 20: 20 levels under a ground of 24 is black, and black shadows read as holes.
 */
const BELOW = { dark: 14, light: 25 } as const;

/** At night the turned-down screen stands this far above the laptop's other faces and below
 * the headline's glyphs, in levels of luma. */
const SCREEN_APART = 40;

/**
 * How far below the paper a light card's 1px edge must draw: an ink line (ink 35% lands near
 * 80 below), not the pale ink 18% rule (near 44 below) the review read as no edge.
 */
const EDGE_BELOW = 60;

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

/** A capture of the stage, decoded in the page (`grab`), read in page coordinates. */
interface Ink {
  /** The page ground's luma (`--paper`), 0–255. */
  ground: number;
  /** The median luma of the square `half` css px either side of page point (x, y). */
  patch: (x: number, y: number, half: number) => number;
  /** Every device pixel's luma in the page rectangle (x0, y0)–(x1, y1). */
  region: (x0: number, y0: number, x1: number, y1: number) => number[];
}

declare global {
  interface Window {
    __ink?: Ink;
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
      // Fractional px from the computed style: offsetLeft and offsetTop round to whole px.
      const left = Number.parseFloat(style.left);
      const top = Number.parseFloat(style.top);
      const tall = Number.parseFloat(getComputedStyle(holder).height);
      return {
        height: c.dataset.height,
        hb,
        lift: 1.0328 * hb * k,
        dx: left,
        // How far the shadow lies below the card's foot on the floor, and below the card.
        floorDy: top - tall - 1.0328 * hb * k,
        gap: top - tall,
        length: top - tall + Number.parseFloat(style.height),
        shear,
        soft: Number.parseFloat(style.filter.replace(/[^\d.]/g, "")),
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
    "the needs-you card (h2) is held highest: its shadow farther off, longer and softer than a working card's (h1)",
    h1 !== undefined &&
      h2 !== undefined &&
      h2.lift > h1.lift &&
      h2.dx > h1.dx &&
      h2.gap > h1.gap &&
      h2.length > h1.length &&
      h2.soft > h1.soft,
    [h1, h2]
      .map(
        (c) =>
          c &&
          `h${c.height}: lift ${c.lift.toFixed(1)}px, shadow ${c.gap.toFixed(1)}px below the card, reaching ${c.length.toFixed(1)}px, blur ${c.soft}px`
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
}

/**
 * Captures the stage (or the element `around` names) as it is drawn now, 40px either way, and
 * decodes it in the page as `window.__ink`, so the readers below sample its pixels at page
 * coordinates worked out from the engine.
 */
async function grab(page: Page, around = ".hero-stage"): Promise<void> {
  const area = await page.evaluate((selector) => {
    const b = (
      document.querySelector(selector) as Element
    ).getBoundingClientRect();
    const top = Math.max(0, Math.floor(b.top + scrollY - 40));
    return {
      x: 0,
      y: top,
      width: innerWidth,
      height: Math.ceil(b.height + 80),
    };
  }, around);
  const png = (await page.screenshot({ clip: area, fullPage: true })).toString(
    "base64"
  );
  await page.evaluate(
    async ([data, clip]) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      const scale = image.width / clip.width;
      const luma = (r: number, g: number, b: number) =>
        0.2126 * r + 0.7152 * g + 0.0722 * b;
      // The ground: the page's paper, as sRGB bytes through a canvas.
      const probe = document.createElement("div");
      probe.style.background = "var(--paper)";
      document.body.append(probe);
      const swatch = document.createElement("canvas").getContext("2d", {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D;
      swatch.fillStyle = getComputedStyle(probe).backgroundColor;
      probe.remove();
      swatch.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = swatch.getImageData(
        0,
        0,
        1,
        1
      ).data;
      const region = (x0: number, y0: number, x1: number, y1: number) => {
        const values: number[] = [];
        const px0 = Math.max(0, Math.round((x0 - clip.x) * scale));
        const px1 = Math.min(
          image.width - 1,
          Math.round((x1 - clip.x) * scale)
        );
        const py0 = Math.max(0, Math.round((y0 - clip.y) * scale));
        const py1 = Math.min(
          image.height - 1,
          Math.round((y1 - clip.y) * scale)
        );
        for (let py = py0; py <= py1; py += 1) {
          for (let px = px0; px <= px1; px += 1) {
            const at = (py * image.width + px) * 4;
            values.push(
              luma(pixels[at] ?? 0, pixels[at + 1] ?? 0, pixels[at + 2] ?? 0)
            );
          }
        }
        return values;
      };
      window.__ink = {
        ground: luma(red, green, blue),
        region,
        patch: (x, y, half) => {
          const values = region(x - half, y - half, x + half, y + half);
          values.sort((p, q) => p - q);
          return values[Math.floor(values.length / 2)] ?? Number.NaN;
        },
      };
    },
    [png, area] as const
  );
}

/**
 * Each card's floor shadow as drawn: its darkest band (the median of small patches along its
 * middle, the darkest of them), and the lean of its two ends, fitted to where each row of the
 * middle half crosses halfway from the ground to that row's core (a run of 3px below it, so a
 * lattice dot is never an edge). An end that lies in another shadow (desk-box's) has no edge to
 * read, one shade being one shade: only rows whose floor outside the end is the ground count.
 */
const cardInk = () => {
  const ink = window.__ink as Ink;
  const step = 0.5;
  // Where row y, scanned inward from `from` (side 1: to the right), falls to `level` and stays.
  const crossing = (
    y: number,
    from: number,
    side: 1 | -1,
    level: number,
    span: number
  ) => {
    let previous = ink.patch(from, y, 0);
    for (let i = 1; i <= span / step; i += 1) {
      const x = from + side * i * step;
      const here = ink.patch(x, y, 0);
      if (
        here <= level &&
        previous > level &&
        [1, 2, 3].every((d) => ink.patch(x + side * d, y, 0) <= level)
      ) {
        const back = x - side * step;
        return back + (x - back) * ((previous - level) / (previous - here));
      }
      previous = here;
    }
    return null;
  };
  // The least-squares lean, across per down, of (y, x) points.
  const fit = (points: [number, number][]) => {
    const n = points.length;
    const my = points.reduce((s, [y]) => s + y, 0) / n;
    const mx = points.reduce((s, [, x]) => s + x, 0) / n;
    const sxy = points.reduce((s, [y, x]) => s + (y - my) * (x - mx), 0);
    const syy = points.reduce((s, [y]) => s + (y - my) ** 2, 0);
    return { rows: n, lean: syy > 0 ? sxy / syy : Number.NaN };
  };
  return [...document.querySelectorAll<HTMLElement>("[data-drift]")].map(
    (holder) => {
      const card = holder.querySelector(".session-card") as HTMLElement;
      const shadow = holder.querySelector(".card-shadow") as HTMLElement;
      const box = holder.getBoundingClientRect();
      const style = getComputedStyle(shadow);
      const left = box.left + scrollX + Number.parseFloat(style.left);
      const top = box.top + scrollY + Number.parseFloat(style.top);
      const w = Number.parseFloat(style.width);
      const h = Number.parseFloat(style.height);
      // Where to look, from the drawing's own shear; the lean itself is measured.
      const lean = new DOMMatrix(style.transform).c;
      const half = Math.max(1, Math.min(3, h * 0.2));
      let darkest = Number.POSITIVE_INFINITY;
      for (let at = 0.15; at <= 0.85; at += 0.05) {
        darkest = Math.min(
          darkest,
          ink.patch(left + lean * (h / 2) + at * w, top + h / 2, half)
        );
      }
      const end = (side: 1 | -1) => {
        const points: [number, number][] = [];
        for (let y = top + 0.3 * h; y <= top + 0.7 * h; y += step) {
          const edge = left + (side === 1 ? 0 : w) + lean * (y - top);
          const from = edge - side * 2 * h;
          if (Math.abs(ink.patch(from, y, 0.5) - ink.ground) > 4) {
            continue;
          }
          const level =
            (ink.ground + ink.patch(edge + side * 0.5 * w, y, 0)) / 2;
          const x = crossing(y, from, side, level, 4 * h);
          if (x !== null) {
            points.push([y, x]);
          }
        }
        return fit(points);
      };
      const ends = [end(1), end(-1)];
      // The card's 1px edge: the darkest device pixel across its left side, row by row down
      // its middle, and the median of those rows.
      const face = card.getBoundingClientRect();
      const rows: number[] = [];
      for (
        let y = face.top + 0.3 * face.height;
        y <= face.top + 0.7 * face.height;
        y += 1
      ) {
        let least = Number.POSITIVE_INFINITY;
        for (let d = -1; d <= 2; d += 0.25) {
          least = Math.min(
            least,
            ink.patch(face.left + scrollX + d, y + scrollY, 0)
          );
        }
        rows.push(least);
      }
      rows.sort((p, q) => p - q);
      return {
        height: card.dataset.height,
        ground: ink.ground,
        edge: rows[Math.floor(rows.length / 2)] ?? Number.NaN,
        darkest,
        // The ends on open floor, read over 4 rows or more; [left, right] as read.
        leans: ends.filter((e) => e.rows >= 4).map((e) => e.lean),
        rows: ends.map((e) => e.rows),
      };
    }
  );
};

/**
 * The closed laptop's shadow beside its base: bands of floor parallel to the base's right side,
 * 1.25 to 5px out (past the outline's ink), each the median of 16 patches along it.
 */
const laptopBand = () => {
  const ink = window.__ink as Ink;
  const svg = document.querySelector(".m-lap") as SVGSVGElement;
  const m = svg.getScreenCTM() as DOMMatrix;
  const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const bands: number[] = [];
  for (let px = 1.25; px <= 5; px += 0.5) {
    // A floor point d mm out from the right side lies 0.8935·d·k px from its foot on screen.
    const out = 152 + px / (0.8935 * k);
    const values: number[] = [];
    for (let y = -60; y <= 60; y += 8) {
      const p = new DOMPoint(
        0.8944 * (out - y),
        0.5164 * (out + y)
      ).matrixTransform(m);
      values.push(ink.patch(p.x + scrollX, p.y + scrollY, 0.5));
    }
    values.sort((p, q) => p - q);
    bands.push(values[Math.floor(values.length / 2)] ?? Number.NaN);
  }
  return { ground: ink.ground, darkest: Math.min(...bands), bands };
};

/**
 * The laptop's surfaces at night, open: the screen (the mean of its pixels on an 8mm grid, rows
 * and type with the ground), the deck, the base's two sides, the bezel.
 */
const laptopSurfaces = () => {
  const ink = window.__ink as Ink;
  const svg = document.querySelector(".m-lap") as SVGSVGElement;
  const m = svg.getScreenCTM() as DOMMatrix;
  const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const at = (x: number, y: number, z: number) => {
    const p = new DOMPoint(
      0.8944 * (x - y),
      0.5164 * (x + y) - 1.0328 * z
    ).matrixTransform(m);
    return [p.x + scrollX, p.y + scrollY] as const;
  };
  const face = document.querySelector(".m-lap .lid.on .face") as SVGGElement;
  const fm = face.getScreenCTM() as DOMMatrix;
  const onFace = (u: number, v: number) => {
    const p = new DOMPoint(u, v).matrixTransform(fm);
    return [p.x + scrollX, p.y + scrollY] as const;
  };
  // The base's sides are 7.4mm tall: a patch a fifth of that either side of their middle.
  const side = Math.max(0.5, 1.5 * k);
  const shown: number[] = [];
  for (let u = 12; u <= 292; u += 8) {
    for (let v = 12; v <= 193; v += 8) {
      shown.push(ink.patch(...onFace(u, v), 0));
    }
  }
  return {
    screen: shown.reduce((sum, value) => sum + value, 0) / shown.length,
    deck: ink.patch(...at(-100, 60, 7.4), Math.max(1, 4 * k)),
    front: ink.patch(...at(-60, 107.5, 3.7), side),
    right: ink.patch(...at(152, 0, 3.7), side),
    bezel: ink.patch(...onFace(4.3, 100), 0.5),
  };
};

/** Where the screen's light lands: the deck, the floor straight ahead, the floor either side. */
const poolSpots = () => {
  const ink = window.__ink as Ink;
  const svg = document.querySelector(".m-lap") as SVGSVGElement;
  const m = svg.getScreenCTM() as DOMMatrix;
  const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
  const read = (x: number, y: number, z: number) => {
    const p = new DOMPoint(
      0.8944 * (x - y),
      0.5164 * (x + y) - 1.0328 * z
    ).matrixTransform(m);
    return ink.patch(p.x + scrollX, p.y + scrollY, Math.max(1.5, 5 * k));
  };
  return {
    deck: read(-100, 60, 7.4),
    ahead: read(0, 147.5, 0),
    left: read(-202, 147.5, 0),
    right: read(202, 147.5, 0),
  };
};

/**
 * The headline's ink as drawn: of the shown lines' pixels, those at least three quarters of the
 * way from the ground to the farthest one (the glyphs' cores, not their antialiased rims), and
 * the median of those.
 */
const headlineLuma = () => {
  const ink = window.__ink as Ink;
  const values = [
    ...document.querySelectorAll("#hero-title .stem, #hero-title .tail.is-on"),
  ].flatMap((line) => {
    const r = line.getBoundingClientRect();
    return ink.region(
      r.left + scrollX,
      r.top + scrollY,
      r.right + scrollX,
      r.bottom + scrollY
    );
  });
  const far = values.reduce(
    (most, value) => Math.max(most, Math.abs(value - ink.ground)),
    0
  );
  const glyphs = values
    .filter((value) => Math.abs(value - ink.ground) >= 0.75 * far)
    .sort((p, q) => p - q);
  return {
    glyphs: glyphs[Math.floor(glyphs.length / 2)] ?? Number.NaN,
    pixels: glyphs.length,
  };
};

/**
 * Desk-box's cast shadow where it lies on open floor: points of its shade three of its blurs
 * (5mm) inside the outline, clear of its contact and its faces by as much and of every card and
 * card shadow, each the median of a 2px patch; the darkest of them.
 */
const deskShade = () => {
  const ink = window.__ink as Ink;
  const svg = document.querySelector(".m-desk") as SVGSVGElement;
  const shade = svg.querySelector(".shade > path") as SVGGeometryElement;
  const contact = svg.querySelector(".ct") as SVGGeometryElement;
  const faces = [...svg.querySelectorAll(".t, .sa, .sb")].filter(
    (e): e is SVGGeometryElement => e instanceof SVGGeometryElement
  );
  const toPage = shade.getScreenCTM() as DOMMatrix;
  const within = (e: SVGGeometryElement, x: number, y: number) => {
    const page = new DOMPoint(x, y).matrixTransform(toPage);
    return e.isPointInFill(
      page.matrixTransform((e.getScreenCTM() as DOMMatrix).inverse())
    );
  };
  const reach = 15;
  const ring = (x: number, y: number) => [
    [x, y],
    ...Array.from({ length: 8 }, (_, i) => [
      x + reach * Math.cos((i * Math.PI) / 4),
      y + reach * Math.sin((i * Math.PI) / 4),
    ]),
  ];
  const cards = [
    ...document.querySelectorAll(".session-card, .card-shadow"),
  ].map((e) => e.getBoundingClientRect());
  const { x: left, y: top, width, height } = shade.getBBox();
  let darkest = Number.POSITIVE_INFINITY;
  let points = 0;
  for (let x = left; x <= left + width; x += 6) {
    for (let y = top; y <= top + height; y += 6) {
      const near = ring(x, y);
      if (
        !near.every(([px = 0, py = 0]) => within(shade, px, py)) ||
        near.some(
          ([px = 0, py = 0]) =>
            within(contact, px, py) || faces.some((f) => within(f, px, py))
        )
      ) {
        continue;
      }
      const p = new DOMPoint(x, y).matrixTransform(toPage);
      if (
        cards.some(
          (r) =>
            p.x > r.left - 6 &&
            p.x < r.right + 6 &&
            p.y > r.top - 6 &&
            p.y < r.bottom + 6
        )
      ) {
        continue;
      }
      points += 1;
      darkest = Math.min(darkest, ink.patch(p.x + scrollX, p.y + scrollY, 1));
    }
  }
  return { ground: ink.ground, darkest, points };
};

const showPools = (on: boolean) => {
  for (const pool of document.querySelectorAll<SVGElement>(".machine .pool")) {
    pool.style.display = on ? "" : "none";
  }
};

async function cardShadows(kit: Kit, base: string): Promise<void> {
  for (const view of ["desk", "phone"] as View[]) {
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one width and scheme at a time
      const page = await kit.page(view, { theme, init: [keepPaused] });
      await load(page, base);
      await seek(page, "cards-in", frameOn);
      await grab(page);
      const cards = await page.evaluate(cardInk);
      const width = view === "desk" ? 1440 : 390;
      kit.check(
        `${width} ${theme}: every card's floor shadow is ${BELOW[theme]}+ levels below the ground at its darkest band, and its drawn ends lean along the key light (${LIGHT_SHEAR.toFixed(3)}, within 10%)`,
        cards.every(
          (c) =>
            c.ground - c.darkest >= BELOW[theme] &&
            c.leans.length > 0 &&
            c.leans.every((lean) => Math.abs(lean / LIGHT_SHEAR - 1) <= 0.1)
        ),
        `ground ${cards[0]?.ground.toFixed(1)}; ${cards
          .map(
            (c) =>
              `h${c.height}: darkest ${c.darkest.toFixed(1)} (${(c.ground - c.darkest).toFixed(1)} below), lean ${c.leans.map((lean) => lean.toFixed(3)).join(" / ")} (rows on open floor, left / right: ${c.rows.join(" / ")})`
          )
          .join("; ")}`
      );
      if (theme === "light") {
        kit.check(
          `${width} light: every card's 1px edge is drawn as an ink line, ${EDGE_BELOW}+ levels below the paper`,
          cards.every((c) => c.ground - c.edge >= EDGE_BELOW),
          `ground ${cards[0]?.ground.toFixed(1)}; edges ${cards
            .map(
              (c) =>
                `h${c.height} ${c.edge.toFixed(1)} (${(c.ground - c.edge).toFixed(1)} below)`
            )
            .join(", ")}`
        );
      }
    }
  }
}

const baseShade = () => {
  const shade = document.querySelector(".m-lap .shade > .sh-base");
  return {
    drawn: shade !== null && getComputedStyle(shade).display !== "none",
    framed: shade?.hasAttribute("data-frame") ?? true,
    lid: Number(
      document.querySelector(".m-lap .lid.on")?.getAttribute("data-frame")
    ),
  };
};

async function closedLaptop(kit: Kit, base: string): Promise<void> {
  const engine = await kit.page("desk", { init: [keepPaused] });
  await load(engine, base);
  const close = await engine.evaluate(
    (id) => window.__timelines?.[id]?.labels.close ?? 0,
    ID
  );
  const through: { drawn: boolean; framed: boolean; lid: number }[] = [];
  for (const at of ["ajar", close + 8 / 24 + 0.001, "lid-shut", "summary"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one seek of one timeline after another
    through.push(await seek(engine, at, baseShade));
  }
  kit.check(
    "the base's cast shadow is not a frame of the lid clip: drawn before, through and after it",
    through.every((s) => s.drawn && !s.framed),
    through.map((s) => `lid ${s.lid}: ${s.drawn ? "drawn" : "gone"}`).join(", ")
  );
  for (const view of ["desk", "phone"] as View[]) {
    for (const theme of ["light", "dark"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one width and scheme at a time
      const page = await kit.page(view, { theme, init: [keepPaused] });
      await load(page, base);
      const bands: { darkest: number; ground: number }[] = [];
      const desk: { darkest: number; ground: number; points: number }[] = [];
      for (const label of ["lid-shut", "summary"]) {
        // biome-ignore lint/performance/noAwaitInLoops: one label, then its capture
        await seek(page, label, frameOn);
        await grab(page);
        bands.push(await page.evaluate(laptopBand));
        desk.push(await page.evaluate(deskShade));
      }
      const width = view === "desk" ? 1440 : 390;
      const below = (b: { darkest: number; ground: number }) =>
        `${b.darkest.toFixed(1)} (${(b.ground - b.darkest).toFixed(1)} below)`;
      kit.check(
        `${width} ${theme}: the closed laptop casts a shadow beside its base, ${BELOW[theme]}+ levels below the ground (lid-shut, summary)`,
        bands.every((b) => b.ground - b.darkest >= BELOW[theme]),
        `ground ${bands[0]?.ground.toFixed(1)}; darkest ${bands.map(below).join(", ")}`
      );
      kit.check(
        `${width} ${theme}: desk-box's cast shadow on open floor is ${BELOW[theme]}+ levels below the ground (lid-shut, summary)`,
        desk.every((d) => d.points > 0 && d.ground - d.darkest >= BELOW[theme]),
        `ground ${desk[0]?.ground.toFixed(1)}; darkest ${desk
          .map((d) => `${below(d)} over ${d.points} points`)
          .join(", ")}`
      );
    }
  }
}

async function nightScreen(kit: Kit, base: string): Promise<void> {
  for (const view of ["desk", "phone"] as View[]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time
    const page = await kit.page(view, { theme: "dark", init: [keepPaused] });
    await load(page, base);
    await seek(page, "typed", frameOn);
    await grab(page);
    const s = await page.evaluate(laptopSurfaces);
    const lit = await page.evaluate(poolSpots);
    await page.evaluate(showPools, false);
    await grab(page);
    const unlit = await page.evaluate(poolSpots);
    await page.evaluate(showPools, true);
    await grab(page, "#hero-title");
    const title = await page.evaluate(headlineLuma);
    const brightness = await page.evaluate(() =>
      getComputedStyle(
        document.querySelector(".hero-stage") as Element
      ).getPropertyValue("--screen")
    );
    const width = view === "desk" ? 1440 : 390;
    const rest = Math.max(s.deck, s.front, s.right, s.bezel);
    kit.check(
      `${width} at night, typed: the lit screen, turned down, is ${SCREEN_APART}+ levels above the laptop's brightest other face`,
      s.screen - rest >= SCREEN_APART,
      `screen mean ${s.screen.toFixed(1)} at brightness ${brightness.trim()}; deck ${s.deck.toFixed(1)}, front ${s.front.toFixed(1)}, right side ${s.right.toFixed(1)}, bezel ${s.bezel.toFixed(1)}`
    );
    kit.check(
      `${width} at night, typed: the headline's glyphs are ${SCREEN_APART}+ levels above the screen's mean, the words first`,
      title.glyphs - s.screen >= SCREEN_APART,
      `headline glyphs ${title.glyphs.toFixed(1)} (${title.pixels} px), screen mean ${s.screen.toFixed(1)}`
    );
    const gain = {
      deck: lit.deck - unlit.deck,
      ahead: lit.ahead - unlit.ahead,
      left: lit.left - unlit.left,
      right: lit.right - unlit.right,
    };
    kit.check(
      `${width} at night, typed: the screen's light falls on the deck and the floor straight ahead, not beside`,
      gain.deck >= 6 &&
        gain.ahead >= 6 &&
        Math.abs(gain.left) <= 1.5 &&
        Math.abs(gain.right) <= 1.5 &&
        lit.ahead - Math.max(lit.left, lit.right) >= 6,
      `luma with the light (and without): deck ${lit.deck.toFixed(1)} (${unlit.deck.toFixed(1)}), ahead ${lit.ahead.toFixed(1)} (${unlit.ahead.toFixed(1)}), beside ${lit.left.toFixed(1)} / ${lit.right.toFixed(1)} (${unlit.left.toFixed(1)} / ${unlit.right.toFixed(1)})`
    );
  }
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
 * The cards' boxes and shadows (with the shadow's blur), how far right of desk-box each card
 * starts, how many of each card's edge points fall on the laptop, and whether one covers
 * desk-box's lamp. A card never passes in front of desk-box, the laptop or the lamp.
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
  const desk = (
    document.querySelector(".m-desk > path.t") as Element
  ).getBoundingClientRect();
  return [...document.querySelectorAll(".session-card")].map((card) => {
    const r = card.getBoundingClientRect();
    const shadow = (card.parentElement as Element).querySelector(
      ".card-shadow"
    ) as Element;
    const s = shadow.getBoundingClientRect();
    const blur = Number.parseFloat(
      getComputedStyle(shadow).filter.replace(/[^\d.]/g, "")
    );
    const edge = Array.from(
      { length: 11 },
      (_, at) => r.left + (r.width * at) / 10
    );
    return {
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      shadow: { left: s.left, right: s.right, top: s.top, bottom: s.bottom },
      reach: s.right + 2 * blur,
      clear: r.left - desk.right,
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

/** How the narrow stage sits: desk-box's inset from the stage, and the floor left between
 * desk-box's shadow and the shut laptop. */
const narrowNow = () => {
  const box = (s: string) =>
    (document.querySelector(s) as Element).getBoundingClientRect();
  const stage = box(".hero-stage");
  return {
    inset: box(".m-desk > path.t").left - stage.left,
    gap: box(".m-lap .lid.on > path").top - box(".m-desk .shade").bottom,
  };
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
  cards.flatMap(({ box, clear, covers, lamp, reach, shadow }, i) =>
    (
      [
        [box.left < 0 || box.right > floor.width, " leaves the window"],
        [reach > floor.width, "'s shadow runs out of the window"],
        [clear < 12, ` starts ${clear.toFixed(1)}px right of desk-box`],
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

/**
 * Each card's type as drawn: its title's size, its state's, the least size of any glyph run it
 * shows (text whose element is rendered and visible), whether its harness glyph and age show.
 */
const cardType = () =>
  [...document.querySelectorAll<HTMLElement>(".session-card")].map((card) => {
    const size = (e: Element) =>
      Number.parseFloat(getComputedStyle(e).fontSize);
    const runs: number[] = [];
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const holder = node.parentElement as Element;
      if (
        node.textContent?.trim() &&
        holder.checkVisibility({ visibilityProperty: true })
      ) {
        runs.push(size(holder));
      }
    }
    const shows = (selector: string) =>
      card.querySelector(selector)?.checkVisibility() ?? false;
    return {
      text: size(card.querySelector(".card-title") as Element),
      state: size(card.querySelector(".st, .pill") as Element),
      least: Math.min(...runs),
      glyph: shows(".hg"),
      age: shows(".card-age"),
    };
  });

async function phoneCards(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { init: [keepPaused] });
  for (const [width, least] of [
    [360, 10],
    [390, 10.5],
    [551, 10.5],
    [552, 10.5],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time on one page
    await page.setViewportSize({ width, height: 900 });
    await load(page, base);
    const cards = await seek(page, "cards-in", cardType);
    const k = await page.evaluate(() => {
      const svg = document.querySelector(".m-lap") as SVGSVGElement;
      return svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    });
    const slim = width < 552;
    kit.check(
      `${width}px: the cards read at ${least}px+, every glyph run in them too, the state as large as the title; ${slim ? "the harness glyph and the age dropped" : "the glyph and the age kept"}`,
      cards.every(
        (c) =>
          c.text >= least - 0.005 &&
          c.least >= least - 0.005 &&
          c.state >= c.text - 0.005 &&
          c.glyph === !slim &&
          c.age === !slim
      ),
      `${cards
        .map(
          (c) =>
            `title ${c.text.toFixed(2)}px, state ${c.state.toFixed(2)}px, least run ${c.least.toFixed(2)}px${c.glyph ? ", glyph" : ""}${c.age ? ", age" : ""}`
        )
        .join("; ")}; k ${k.toFixed(3)}`
    );
  }
}

async function layout(kit: Kit, base: string): Promise<void> {
  const page = await kit.page("desk", { init: [keepPaused] });
  for (const width of [
    360, 390, 500, 551, 552, 600, 768, 1024, 1199, 1200, 1440, 1920,
  ]) {
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
    let clear = Number.POSITIVE_INFINITY;
    for (const label of ["cards-in", "summary"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one label of one timeline after another
      const cards = await seek(page, label, cardsNow);
      bad.push(...cardFaults(label, cards, floor));
      clear = Math.min(clear, ...cards.map((c) => c.clear));
    }
    const lid = await seek(page, "typed", lidToBox);
    if (lid < 12) {
      bad.push(`typed: the open lid ${lid.toFixed(1)}px from desk-box`);
    }
    const stand = await seek(page, "cards-in", narrowNow);
    const node = Math.hypot(nx - lx, ny - ly);
    // A lattice vector: whole rows of 20.8px, and across whole 24px steps, offset 12px on odd rows.
    const row = Math.round(dy / 20.8);
    const across = (dx - 12 * Math.abs(row % 2)) / 24;
    const onLattice =
      Math.abs(dy / 20.8 - row) < 0.01 &&
      Math.abs(across - Math.round(across)) < 0.01;
    kit.check(
      `${width}px: the paper's node on the laptop's origin, desk-box a lattice step away, the open lid 12px+ clear of it, the cards 12px+ right of it and clear, their shadows in the window`,
      node < 0.05 && onLattice && floor.scroll === width && bad.length === 0,
      `node ${node.toFixed(3)}px, box (${dx.toFixed(1)}, ${dy.toFixed(1)}), lid ${lid.toFixed(1)}px clear, cards ${clear.toFixed(1)}px right of desk-box${width < 600 ? `, desk-box ${stand.inset.toFixed(1)}px in, ${stand.gap.toFixed(1)}px of floor from its shadow to the shut laptop` : ""}${bad.length > 0 ? `, ${bad.join("; ")}` : ""}`
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
      await nightScreen(kit, server.base);
      await cardShadows(kit, server.base);
      await closedLaptop(kit, server.base);
      await lampColour(kit, server.base);
      await playing(kit, server.base);
      await desktopFold(kit, server.base);
      await headlineInk(kit, server.base);
      await installHead(kit, server.base);
      await phoneCards(kit, server.base);
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
