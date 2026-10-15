/**
 * Films the real dashboard, frame by frame, on the stand-in hub's fleet.
 *
 * Nothing on the page runs on the wall clock while a take is filmed:
 * Playwright's clock owns Date, timers, requestAnimationFrame and
 * performance.now, and every Web Animation on the page (CSS transitions,
 * CSS animations, `element.animate`) is paused and set to the time it would
 * show at the frame being filmed. So a take is the same every time, and each
 * frame is exactly 1/FPS of the product's own motion after the last, however
 * long a screenshot takes. The frames go straight into ffmpeg.
 *
 *   node marketing/hero-film/capture/capture.ts <light|dark> [out.mp4]
 *
 * Needs the stand-in hub (hub.ts) on :4877 and the dashboard's `vite dev` on
 * :5197 with CAWCO_DEV_HUB_URL=http://127.0.0.1:4877.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { chromium, type Locator, type Page } from "playwright-core";

const THEME = process.argv[2] === "dark" ? "dark" : "light";
const OUT = resolve(
  process.argv[3] ??
    resolve(import.meta.dirname, `../assets/footage/board-${THEME}.mp4`)
);

const HUB = "http://127.0.0.1:4877";
const DASHBOARD = "http://127.0.0.1:5197";
/** The fleet's epoch (fleet.ts NOW): the take's first frame is filmed at it. */
const NOW = Date.UTC(2026, 9, 15, 14, 32, 0);
const LEDGER = "0d9e7c51-6b0a-4c3e-9f61-2a1b3c4d5e01";

/** The window the dashboard is drawn in, CSS px, and its device scale. */
const VIEW = { width: 1200, height: 750 };
/** 3: the 3600 × 2250 the candidates are cut from. FILM_SCALE=1 for a quick trial take. */
const SCALE = Number(process.env.FILM_SCALE ?? 3);
const FPS = 60;
/**
 * The take: a second of the board at rest (what the loop's seam fades back
 * into), then the twelve seconds the film loops. Twelve is six of the
 * board's 2s breaths and ten of its 1.2s loops, so everything that breathes
 * is in the same phase at both ends.
 */
const PRE = 1;
const LOOP = 12;
const FRAMES = (PRE + LOOP) * FPS;

/** Where the pointer rests between presses: the bar's empty middle. */
const REST = { x: 640, y: 22 };

type Act = (page: Page) => Promise<void>;

const beat =
  (name: string): Act =>
  async () => {
    const answer = await fetch(`${HUB}/__film/beat/${name}`, {
      method: "POST",
    });
    if (!answer.ok) {
      throw new Error(`beat ${name}: ${answer.status} ${await answer.text()}`);
    }
  };

type Target = (page: Page) => Locator;

const hover =
  (target: Target): Act =>
  async (page) => {
    const box = await target(page).first().boundingBox({ timeout: 2000 });
    if (!box) {
      throw new Error("nothing to press there");
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  };

const rest: Act = async (page) => {
  await page.mouse.move(REST.x, REST.y);
};

/** The composer's Approve (the Needs-you card's carries the ask in its name). */
const APPROVE: Target = (page) =>
  page.getByRole("button", { name: "Approve", exact: true });
/** The focal row's mark in the rail's Working list, which unfolds its delegate. */
const FOLD: Target = (page) =>
  page
    .locator(".rail")
    .getByRole("button", { name: "Show 1 delegate", exact: true });

/**
 * The story, in seconds after the rest: the ask parks, Approve is pressed
 * in the composer, the plan comes back, the delegate goes to dev-vm and is
 * unfolded under its parent, it reports, and the session says what it means.
 */
const SCRIPT: [number, Act][] = [
  [1.2, beat("ask")],
  [2.9, hover(APPROVE)],
  [3.3, (page) => page.mouse.down()],
  // The press itself sends the answer: the hub plays "answered" on it.
  [3.42, (page) => page.mouse.up()],
  [3.8, rest],
  [4.4, beat("plan")],
  [5.4, beat("delegate")],
  // On and off the row inside the 350ms its peek card waits for
  // (SessionHover OPEN_AFTER): a press, not a dwell.
  [6.1, hover(FOLD)],
  [6.27, (page) => page.mouse.down()],
  [6.36, (page) => page.mouse.up()],
  [6.42, rest],
  [7.3, beat("delegate-working")],
  [9.0, beat("report")],
  [9.9, beat("done")],
];

/**
 * Installed before the page's own scripts: every animation is born paused
 * at the page's (faked) clock, and `__film.sync()` sets each to the time the
 * clock says, finishing the ones whose time is up so their ends run.
 */
function filmClock(): void {
  const born = new WeakMap<Animation, number>();
  const make = Element.prototype.animate;
  Element.prototype.animate = function animate(
    this: Element,
    ...args: Parameters<Element["animate"]>
  ) {
    const animation = make.apply(this, args);
    born.set(animation, performance.now());
    animation.pause();
    return animation;
  };
  const sync = () => {
    const now = performance.now();
    for (const animation of document.getAnimations()) {
      // Scroll-driven animations follow the scroll, not the clock.
      if (
        animation.playState === "finished" ||
        animation.timeline !== document.timeline
      ) {
        continue;
      }
      if (!born.has(animation)) {
        born.set(animation, now);
      }
      const local = now - (born.get(animation) ?? now);
      const end = animation.effect?.getComputedTiming().endTime;
      if (
        typeof end === "number" &&
        Number.isFinite(end) &&
        animation.playbackRate > 0 &&
        local >= end
      ) {
        animation.finish();
        continue;
      }
      if (animation.playState !== "paused") {
        animation.pause();
      }
      animation.currentTime = Math.max(0, local * animation.playbackRate);
    }
  };
  Object.assign(window, { __film: { sync } });
}

/** Real time for the page to take what the hub sent before the next frame. */
const settle = () => new Promise((done) => setTimeout(done, 220));

async function main(): Promise<void> {
  await fetch(`${HUB}/__film/reset`);
  mkdirSync(dirname(OUT), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEW,
    deviceScaleFactor: SCALE,
    colorScheme: THEME,
    timezoneId: "UTC",
    locale: "en-GB",
  });
  const faults: string[] = [];
  page.on("pageerror", (error) => faults.push(error.stack ?? error.message));
  await page.clock.install({ time: NOW - 120_000 });
  await page.addInitScript(filmClock);

  // Set up in running time: the board read, the transcript drawn, the
  // Delegates switch on, and everything that came in settled.
  await page.goto(`${DASHBOARD}/session/${LEDGER}`, {
    waitUntil: "domcontentloaded",
  });
  await page
    .getByText("I'll read the plan on the replica", { exact: false })
    .waitFor();
  await page.locator(".rail").getByText("Projects").waitFor();
  const delegates = page.getByRole("button", {
    name: "Delegates",
    exact: true,
  });
  if ((await delegates.getAttribute("aria-pressed")) !== "true") {
    await delegates.click();
  }
  await rest(page);
  await page.waitForTimeout(3000);

  await page.clock.pauseAt(NOW);
  await page.evaluate(() =>
    (window as unknown as { __film: { sync: () => void } }).__film.sync()
  );

  const ffmpeg = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "image2pipe",
      "-framerate",
      String(FPS),
      "-i",
      "-",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "6",
      "-pix_fmt",
      "yuv444p",
      "-movflags",
      "+faststart",
      OUT,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  const encoded = new Promise<number>((done) =>
    ffmpeg.on("close", (status) => done(status ?? 1))
  );

  const script = [...SCRIPT];
  let elapsed = 0;
  for (let frame = 0; frame < FRAMES; frame += 1) {
    const at = Math.round((frame * 1000) / FPS);
    if (at > elapsed) {
      // biome-ignore lint/performance/noAwaitInLoops: a film is one frame after another; each frame is drawn on the clock the last one left
      await page.clock.runFor(at - elapsed);
      elapsed = at;
    }
    let acted = false;
    while (script.length > 0 && (script[0]?.[0] ?? 0) + PRE <= at / 1000) {
      const [, act] = script.shift() as [number, Act];
      // biome-ignore lint/performance/noAwaitInLoops: the story's beats land in order, each on the board the one before left
      await act(page);
      acted = true;
    }
    if (acted) {
      await settle();
    }
    await page.evaluate(() =>
      (window as unknown as { __film: { sync: () => void } }).__film.sync()
    );
    const png = await page.screenshot({ type: "png" });
    if (!ffmpeg.stdin.write(png)) {
      await new Promise((done) => ffmpeg.stdin.once("drain", done));
    }
    if (frame % FPS === 0) {
      console.log(`[capture ${THEME}] ${frame / FPS}s`);
    }
  }
  ffmpeg.stdin.end();
  const code = await encoded;
  await browser.close();
  if (faults.length > 0) {
    console.log(`[capture ${THEME}] page faults:\n${faults.join("\n")}`);
  }
  if (code !== 0) {
    throw new Error(`ffmpeg exited ${code}`);
  }
  console.log(`[capture ${THEME}] ${FRAMES} frames → ${OUT}`);
}

await main();
