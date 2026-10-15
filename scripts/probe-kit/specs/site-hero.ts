/**
 * cawco.dev's hero, scene 1 (site/src/hero): the stage read from the engine, never the picture.
 * Its own site dev server, on a free port (or `SITE_URL`, one already running). In order:
 *
 * 1. The words (eyebrow, headline, subhead, install) are whole at first paint, scripts or none,
 *    and nothing animates them. Without scripts the stage shows scene 1's first frame.
 * 2. The paused timeline, sought to every label: the lid's frame, the typing, the cards' heights
 *    and shadows, the room at night; the lid clip frame by frame at 24 fps; the 1px settle; the
 *    typing cadence and the caret's 530ms blink, read from the timeline itself.
 * 3. The drift: 10 / 14 / 18 px/s along the floor's y axis, and the same place at the same time
 *    across two loads.
 * 4. Reduced motion stands on the summary frame; the pause holds the timeline and is kept for
 *    the visit; hovering the stage holds the hand-off.
 * 5. At every width from 360 to 1920: the paper's node on the laptop's floor origin, desk-box a
 *    lattice vector from it, the cards inside the window and the stage, clear of each other and
 *    of the machines.
 * 6. Mobile Safari's edge strips: the page ground in both themes and through the switch, at
 *    least 12px, no pointer events; none under a mouse.
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Kit, ROOT, type Spec } from "../kit";

const SITE = join(ROOT, "site");
const ID = "hero-scene-1";

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
    (c) => ({
      height: c.dataset.height,
      rise: getComputedStyle(c.parentElement as Element)
        .getPropertyValue("--rise")
        .trim(),
      opacity: Number(getComputedStyle(c).opacity),
      transform: getComputedStyle(c).transform,
      shadow: getComputedStyle(c).boxShadow.replace(
        /(oklab|oklch|rgba?)\([^)]*\)\s*/g,
        ""
      ),
      age: [...c.querySelectorAll("[data-age]")].find(
        (a) => getComputedStyle(a).visibility === "visible"
      )?.textContent,
    })
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
  kit.check(
    "cards-in: heights h1 / h1 / h2, the shadows (10, 8) blur 14 and (18, 14) blur 22, the h2 card 10px up",
    cards.map((c) => c.height).join() === "1,1,2" &&
      cards[0]?.shadow.startsWith("10px 8px 14px 0px") === true &&
      cards[2]?.shadow.startsWith("18px 14px 22px 0px") === true &&
      cards[2]?.rise === "10px" &&
      cards[0]?.rise === "0px" &&
      cards.every(
        (c) => c.opacity === 1 && c.transform === "matrix(1, 0, 0, 1, 0, 0)"
      ),
    JSON.stringify(
      cards.map(({ height, rise, shadow }) => ({ height, rise, shadow }))
    )
  );
  const summary = await seek(page, "summary", stateNow);
  kit.check(
    "summary: lid shut, every card in at 4m, the room down",
    summary.frame === 16 &&
      summary.dusk === 1 &&
      summary.cards.every((c) => c.age === "4m" && c.opacity === 1)
  );
}

async function clip(kit: Kit, page: Page): Promise<void> {
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
  kit.check(
    "the cards drift at 10 / 14 / 18 px/s along the floor's y axis (150° on screen)",
    speeds.map((s) => Math.round(s.speed)).join() === "10,14,18" &&
      speeds.every((s) => Math.abs(s.angle - 150) < 0.5),
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

/** The cards' boxes, and how many of each card's edge points fall on a machine. */
const cardsNow = () => {
  const bodies = [
    ".m-lap > path.t",
    ".m-lap .lid.on > path",
    ".m-desk > path.t",
  ].map((s) => document.querySelector(s) as SVGGeometryElement);
  const onMachine = (x: number, y: number) =>
    bodies.some((body) =>
      body.isPointInFill(
        new DOMPoint(x, y).matrixTransform(
          (body.getScreenCTM() as DOMMatrix).inverse()
        )
      )
    );
  return [...document.querySelectorAll(".session-card")].map((card) => {
    const r = card.getBoundingClientRect();
    const edge = Array.from(
      { length: 11 },
      (_, s) => r.left + (r.width * s) / 10
    );
    return {
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
      covers: edge.filter((x) => onMachine(x, r.top) || onMachine(x, r.bottom))
        .length,
    };
  });
};

const meet = (a: Box, b: Box) =>
  Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
  Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > -2;

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
      cards.forEach(({ box, covers }, i) => {
        if (box.left < 0 || box.right > floor.width) {
          bad.push(`${label}: card ${i + 1} leaves the window`);
        }
        if (box.bottom > floor.stage + 0.5) {
          bad.push(`${label}: card ${i + 1} leaves the stage`);
        }
        if (covers > 0) {
          bad.push(`${label}: card ${i + 1} covers a machine`);
        }
        if (cards.slice(i + 1).some((other) => meet(box, other.box))) {
          bad.push(`${label}: card ${i + 1} meets another`);
        }
      });
    }
    const node = Math.hypot(nx - lx, ny - ly);
    const onLattice =
      Math.abs(dx / 24 - Math.round(dx / 24)) < 0.01 &&
      Math.abs(dy / 41.6 - Math.round(dy / 41.6)) < 0.01;
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
      await clip(kit, page);
      await cadence(kit, page);
      await drift(kit, page, server.base);
      await night(kit, server.base);
      await playing(kit, server.base);
      await layout(kit, server.base);
      await edges(kit, server.base);
    } finally {
      server.stop();
    }
  },
} satisfies Spec;
