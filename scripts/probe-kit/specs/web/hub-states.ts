/**
 * What the dashboard shows while its hub is away, restarting or answering
 * badly, read from the engine: a real hub (a scratch fleet's, no machine),
 * the dashboard's socket run through a proxy the spec holds
 * (`routeWebSocket`), so it can be dropped, refused, or told the hub
 * restarts, and the hub's REST answers delayed or swapped for a tunnel's
 * HTML 502 (`page.route`). At 390, 680 and 1440, light and dark:
 *
 *  (a) the socket dropped: exactly one element says so (the connection
 *      band); its button's label stands at the button's centre with equal
 *      inline paddings; its enter and its leave are transitions on one
 *      clock whose duration and curve are DESIGN's tokens, read by pausing
 *      them and seeking each through its fractions;
 *  (b) an announced update restart (the hub's own `hub.restart`, and the
 *      hub telling it on its own machine's `installing`): the band says the
 *      update, calmly, and nothing says the hub is unreachable until the
 *      deadline; past it, the band says so;
 *  (c) a search whose answer is held 800 ms: placeholder rows from the
 *      first frame after the query, then the answer, and every change of
 *      the card's height over 2 px between two frames is the card's height
 *      animation, never a step;
 *  (d) a search and a project's board answered by an HTML 502: one
 *      sentence, no `<` drawn;
 *
 * and each state swept for spills and overlaps (journeys/scan.ts).
 */
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { scan } from "../../journeys/scan";
import {
  entrySlug,
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const BAND = '[data-slot="hub-band"]';
const CARD = "[data-glass-card-frame]";
/** A tunnel's own page for a hub that didn't answer, as Cloudflare draws it. */
const PROXY_502 = `<!DOCTYPE html><html lang="en-US"><head><title>outpost.example | 502: Bad gateway</title></head><body><div id="cf-wrapper"><h1><span>Bad gateway</span> <span>Error code 502</span></h1><p>Visit <a href="https://www.cloudflare.com/5xx-error-landing">cloudflare.com</a> for more information.</p></div></body></html>`;
/** What a hub's machine says as its update helper is about to restart it. */
const installing = (phase: "installing" | "available") => ({
  phase,
  hostsHub: true,
  installedVersion: "0.0.1",
  availableVersion: "9.9.9-probe",
  channel: "stable",
});
/** Every word that says the hub's connection is away, wherever it is drawn. */
const AWAY =
  /hub unreachable|can.t reach the hub|reach the hub|retrying in|retrying now|reconnecting|reconnect/i;

const UNREACHABLE = /Hub unreachable/;
const RECONNECTED = /reconnected/i;
const UPDATING_PROBE = /updating to 9\.9\.9-probe/;
const UPDATING = /updating/;
const PROXY_WORDS = /Bad gateway|cloudflare/i;

/** The socket's proxy: forward, refuse new sockets, drop the one open, or speak as the hub. */
interface Socket {
  drop: () => void;
  /** The hub's board has arrived on the socket open now. */
  live: () => boolean;
  mode: "proxy" | "refuse";
  say: (payload: object) => void;
}

async function proxied(page: Page): Promise<Socket> {
  let current: WebSocketRoute | null = null;
  let boarded = false;
  const socket: Socket = {
    mode: "proxy",
    live: () => boarded && current !== null,
    drop: () => {
      boarded = false;
      current?.close({ code: 4000, reason: "probe drops the socket" });
      current = null;
    },
    say: (payload) =>
      current?.send(
        JSON.stringify({ verb: "frames", machineId: "hub", payload })
      ),
  };
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      if (socket.mode === "refuse") {
        ws.close({ code: 4000, reason: "probe refuses the socket" });
        return;
      }
      current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (String(message).includes('"kind":"instances"')) {
          boarded = true;
        }
        ws.send(message);
      });
      ws.onClose(() => {
        if (current === ws) {
          current = null;
          boarded = false;
        }
      });
    }
  );
  return socket;
}

/** Waits until `ok` reads true, every 100 ms, for `ms`. */
async function until(ok: () => boolean | Promise<boolean>, ms: number) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: polled one read at a time
    if (await ok()) {
      return true;
    }
    await Bun.sleep(100);
  }
  return false;
}

/** The visible elements whose own words say the hub's connection is away, by where they stand. */
const awaySayers = (page: Page) =>
  page.evaluate((source) => {
    const away = new RegExp(source, "i");
    const out: string[] = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT
    );
    const holders = new Set<Element>();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!(el && away.test(node.textContent ?? ""))) {
        continue;
      }
      if (
        !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        continue;
      }
      // Its surface: the band, or the nearest block that holds it.
      const surface =
        el.closest('[data-slot="hub-band"]') ??
        el.closest("[data-slot], section, aside, header, main") ??
        el;
      if (!holders.has(surface)) {
        holders.add(surface);
        out.push(
          `${surface.getAttribute("data-slot") ?? surface.tagName.toLowerCase()}: “${(el.textContent ?? "").trim().slice(0, 60)}”`
        );
      }
    }
    return out;
  }, AWAY.source);

/** The band's state: open, its tone, and its words. */
const bandNow = (page: Page) =>
  page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector);
    return {
      exists: band !== null,
      open: band?.hasAttribute("data-open") ?? false,
      tone: band?.getAttribute("data-tone") ?? "",
      words: (band?.innerText ?? "").replace(/\s+/g, " ").trim(),
    };
  }, BAND);

interface Read {
  /** Each transition's property, duration (ms), easing and start. */
  runs: { duration: number; easing: string; prop: string; start: number }[];
  /** Opacity seeked to each fraction. */
  samples: {
    bottom: number;
    clipTop: number;
    f: number;
    opacity: number;
    translate: string;
  }[];
  tokens: { duration: number; easing: string };
}

/**
 * The band's transitions caught mid-way (the page's clock slowed through
 * the Animation domain, then each paused and seeked through its fractions),
 * with the tokens they should be on.
 */
async function scrubBand(
  page: Page,
  start: () => Promise<void>,
  token: { duration: string; easing: string }
): Promise<Read | null> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Animation.enable");
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.02 });
  try {
    await start();
    const caught = await page
      .waitForFunction(
        (selector) =>
          (document.querySelector(selector)?.getAnimations() ?? []).some(
            (run) =>
              run.playState === "running" &&
              run instanceof CSSTransition &&
              ["opacity", "translate"].includes(run.transitionProperty)
          ),
        BAND,
        { timeout: 15_000, polling: "raf" }
      )
      .then(() => true)
      .catch(() => false);
    if (!caught) {
      return null;
    }
    return await page.evaluate(
      ({ selector, names }) => {
        const band = document.querySelector<HTMLElement>(
          selector
        ) as HTMLElement;
        const runs = band
          .getAnimations()
          .filter(
            (run) =>
              run instanceof CSSTransition &&
              ["opacity", "translate"].includes(run.transitionProperty)
          ) as CSSTransition[];
        for (const run of runs) {
          run.pause();
        }
        const root = getComputedStyle(document.documentElement);
        const ms = (v: string) =>
          v.trim().endsWith("ms")
            ? Number.parseFloat(v)
            : Number.parseFloat(v) * 1000;
        const read = {
          tokens: {
            duration: ms(root.getPropertyValue(names.duration)),
            easing: root.getPropertyValue(names.easing).trim(),
          },
          runs: runs.map((run) => {
            const timing = run.effect?.getComputedTiming();
            return {
              prop: run.transitionProperty,
              duration: Number(timing?.duration),
              easing: String(timing?.easing),
              start: Number(run.startTime),
            };
          }),
          samples: [0, 0.25, 0.5, 0.75, 1].map((f) => {
            for (const run of runs) {
              run.currentTime =
                f * Number(run.effect?.getComputedTiming().duration);
            }
            const style = getComputedStyle(band);
            return {
              f,
              opacity: Number(style.opacity),
              translate: style.translate,
              bottom: band.getBoundingClientRect().bottom,
              clipTop: (
                band.parentElement as HTMLElement
              ).getBoundingClientRect().top,
            };
          }),
        };
        for (const run of runs) {
          run.finish();
        }
        return read;
      },
      { selector: BAND, names: token }
    );
  } finally {
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
    await cdp.detach();
  }
}

/** Two `cubic-bezier()`s as numbers (`0.32` is `.32`). */
const sameCurve = (a: string, b: string): boolean => {
  const [x, y] = [a, b].map((curve) =>
    (curve.match(NUMBER) ?? []).map(Number).join(",")
  );
  return x !== "" && x === y;
};
const NUMBER = /-?\d*\.?\d+/g;

/** `cubic-bezier(x1, y1, x2, y2)` at progress `x`, solved for its t. */
function bezierAt(curve: string, x: number): number {
  const [x1, y1, x2, y2] = (curve.match(/-?\d*\.?\d+/g) ?? []).map(Number);
  const at = (a: number, b: number, t: number) =>
    3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (at(x1 ?? 0, x2 ?? 1, mid) < x) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return at(y1 ?? 0, y2 ?? 1, (lo + hi) / 2);
}

/** Holds a read to its tokens: one clock, the tokens' duration and curve, opacity on that curve. */
function checkMotion(
  kit: Kit,
  name: string,
  what: string,
  read: Read | null,
  rising: boolean
) {
  if (!(
    kit.check(
      `${name}: the band's ${what} runs as transitions`,
      read !== null && read.runs.length > 0,
      read
        ? `${read.runs.map((r) => r.prop).join(", ") || "none of opacity, translate"} ran`
        : "nothing ran on the band"
    ) && read
  )) {
    return;
  }
  const clock = read.runs.every(
    (run) =>
      Math.abs(run.duration - read.tokens.duration) < 0.5 &&
      sameCurve(run.easing, read.tokens.easing) &&
      run.start === read.runs[0]?.start
  );
  kit.check(
    `${name}: the band's ${what} is one clock on its tokens`,
    clock,
    `${read.runs.map((r) => `${r.prop} ${r.duration}ms ${r.easing} @${r.start}`).join("; ")} vs ${read.tokens.duration}ms ${read.tokens.easing}`
  );
  const off = read.samples.map((sample) => {
    const eased = bezierAt(read.tokens.easing, sample.f);
    const want = rising ? eased : 1 - eased;
    return Math.abs(sample.opacity - want);
  });
  kit.check(
    `${name}: the band's ${what}, seeked, follows its curve`,
    Math.max(...off) < 0.02,
    read.samples
      .map(
        (s) =>
          `${s.f}: opacity ${s.opacity.toFixed(3)}, translate ${s.translate}`
      )
      .join("; ")
  );
}

/** The sweep (journeys/scan.ts): nothing spills, no control covers text. */
async function sweep(kit: Kit, page: Page, name: string, state: string) {
  // The state as drawn, for the reviewer (never read by this spec).
  await page.screenshot({
    path: join(kit.out, `${entrySlug(`${name} ${state}`)}.png`),
  });
  const found = await page.evaluate(scan);
  kit.check(
    `${name}, ${state}: nothing spills or overlaps`,
    found.length === 0,
    found.join(" | ")
  );
  return found.length;
}

/** Opens Jump the way a person does by pointer: its button, or the sheet's search. */
async function openJump(page: Page, view: View) {
  if (view === "desk") {
    await page.click('button[aria-label="Jump to session"]');
  } else {
    await page.click('[data-slot="burger"]');
    await page.click('[data-rail-sheet] [data-slot="search"]');
  }
  await page.waitForSelector(`${CARD} [data-slot="finder-field"] input`);
  await settle(page);
}

async function runLeg(
  kit: Kit,
  base: string,
  hub: string,
  view: View,
  theme: "light" | "dark",
  findings: { count: number }
) {
  const name = `${view} ${theme}`;
  const page = await kit.page(view, { theme });
  const socket = await proxied(page);
  await open(page, `${base}/session`, '[data-slot="shell"]', 90_000);
  await until(socket.live, 30_000);
  await settle(page, 400);

  // ---- (a) the socket dropped ----
  const said = page.locator("[data-hub-band-said]");
  const before = await said
    .ariaSnapshot({ timeout: 3000 })
    .catch((e: Error) => e.message);
  kit.check(
    `${name}: the band's live region stands, empty, before it opens`,
    before.trim() === "- status",
    JSON.stringify(before)
  );
  socket.mode = "refuse";
  const entered = await scrubBand(
    page,
    () => {
      socket.drop();
      return Promise.resolve();
    },
    { duration: "--dur-panel", easing: "--ease-drawer" }
  );
  checkMotion(kit, name, "enter", entered, true);
  const first = entered?.samples[0];
  kit.check(
    `${name}: the band's slide starts hidden under the top bar`,
    first !== undefined && first.bottom <= first.clipTop + 0.5,
    first
      ? `band bottom ${first.bottom} at 0, clip top ${first.clipTop}`
      : "no sample"
  );
  await settle(page, 300);
  const down = await bandNow(page);
  kit.check(
    `${name}: the dropped socket opens the band`,
    down.open && UNREACHABLE.test(down.words),
    JSON.stringify(down)
  );
  const spoken = await said
    .ariaSnapshot({ timeout: 3000 })
    .catch((e: Error) => e.message);
  kit.check(
    `${name}: the live region holds the band's words once it opens`,
    UNREACHABLE.test(spoken) && spoken.includes(down.words.slice(0, 20)),
    JSON.stringify(spoken)
  );
  const clip = await page.evaluate((selector) => {
    const band = document.querySelector<HTMLElement>(selector);
    const slot = band?.parentElement;
    if (!(band && slot)) {
      return null;
    }
    const shadow = getComputedStyle(band).boxShadow;
    // Every shadow's reach past the box: offset, blur and spread, each side.
    const reach = { bottom: 0, left: 0, right: 0, top: 0 };
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    for (const one of shadow.split(/,(?![^(]*\))/)) {
      const [x = 0, y = 0, blur = 0, spread = 0] = (
        one
          .replace(/(rgba?|oklch|oklab|color|lab|lch|hsla?)\([^)]*\)/g, "")
          .match(/-?\d*\.?\d+px/g) ?? []
      ).map((v) => Number.parseFloat(v));
      const out = blur + spread;
      reach.right = Math.max(reach.right, x + out);
      reach.left = Math.max(reach.left, -x + out);
      reach.bottom = Math.max(reach.bottom, y + out);
      reach.top = Math.max(reach.top, -y + out);
    }
    const b = band.getBoundingClientRect();
    const s = slot.getBoundingClientRect();
    const vw = window.innerWidth;
    return {
      clipPath: getComputedStyle(slot).clipPath,
      vw,
      shadow,
      drawn:
        b.left - reach.left >= s.left - vw &&
        b.right + reach.right <= s.right + vw &&
        b.bottom + reach.bottom <= s.bottom + vw,
      band: [b.left, b.top, b.right, b.bottom],
      slot: [s.left, s.top, s.right, s.bottom],
      reach,
    };
  }, BAND);
  kit.check(
    `${name}: the open band's shadow is drawn whole below and at both sides`,
    clip !== null &&
      clip.clipPath === `inset(0px -${clip.vw}px -${clip.vw}px)` &&
      clip.drawn,
    JSON.stringify(clip)
  );
  const sayers = await awaySayers(page);
  kit.check(
    `${name}: exactly one element says the hub is away`,
    sayers.length === 1 && sayers[0]?.startsWith("hub-band"),
    sayers.join(" | ")
  );
  const button = await page.evaluate((selector) => {
    const press = document.querySelector<HTMLElement>(
      `${selector} button[data-slot="button"]`
    );
    const words =
      press?.querySelector<HTMLElement>('.kit-words > [data-active="true"]') ??
      press?.querySelector<HTMLElement>(".kit-text");
    if (!(press && words)) {
      return null;
    }
    const outer = press.getBoundingClientRect();
    const inner = words.getBoundingClientRect();
    const style = getComputedStyle(press);
    return {
      label: words.innerText,
      off: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
      start: inner.left - outer.left,
      end: outer.right - inner.right,
      paddings: [style.paddingInlineStart, style.paddingInlineEnd],
    };
  }, BAND);
  kit.check(
    `${name}: the band's button centres its label, its paddings even`,
    button !== null &&
      Math.abs(button.off) <= 0.5 &&
      button.paddings[0] === button.paddings[1],
    JSON.stringify(button)
  );
  findings.count += await sweep(kit, page, name, "hub away");

  // Back: the socket let through, the band says so and leaves.
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  const reconnected = await until(
    async () => RECONNECTED.test((await bandNow(page)).words),
    5000
  );
  kit.check(
    `${name}: the hub back, the band says so`,
    reconnected,
    (await bandNow(page)).words
  );
  const left = await scrubBand(page, () => Promise.resolve(), {
    duration: "--dur-exit",
    easing: "--ease-out",
  });
  checkMotion(kit, name, "leave", left, false);
  await settle(page, 300);
  kit.check(
    `${name}: the band has left`,
    !(await bandNow(page)).open,
    JSON.stringify(await bandNow(page))
  );

  // ---- (b) an announced update restart ----
  if (view === "desk" && theme === "light") {
    // The hub's own word: its machine says it is installing.
    const put = (state: object) =>
      fetch(`${hub}/api/binary-updates/machines/scratch-fleet/state`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state),
      }).then((r) => r.status);
    const answered = await put(installing("installing"));
    const told = await until(
      async () => UPDATING_PROBE.test((await bandNow(page)).words),
      5000
    );
    kit.check(
      `${name}: the hub's machine installing, the hub tells the page`,
      told,
      `PUT ${answered}; band ${(await bandNow(page)).words}`
    );
    await put(installing("available"));
    const taken = await until(async () => !(await bandNow(page)).open, 5000);
    kit.check(
      `${name}: the install over without a restart, the hub takes it back`,
      taken,
      JSON.stringify(await bandNow(page))
    );
    await settle(page, 300);
  }
  const within = 6000;
  socket.say({
    kind: "hub.restart",
    restart: { reason: "update", version: "9.9.9-probe", withinMs: within },
  });
  const announced = Date.now();
  await until(async () => (await bandNow(page)).open, 3000);
  // Its enter lands first: at a transition's first moment the band is still
  // `visibility: hidden` and draws no words at all.
  await settle(page);
  socket.mode = "refuse";
  socket.drop();
  let calm = true;
  const seen: string[] = [];
  while (Date.now() < announced + within - 700) {
    // biome-ignore lint/performance/noAwaitInLoops: one read every half second, in order
    const now = await bandNow(page);
    const away = await awaySayers(page);
    if (
      !(now.open && now.tone === "live" && UPDATING.test(now.words)) ||
      away.length > 0
    ) {
      calm = false;
      seen.push(`${now.tone}: ${now.words} | ${away.join(", ")}`);
    }
    await Bun.sleep(500);
  }
  kit.check(
    `${name}: an announced restart reads as the update until its deadline`,
    calm,
    seen.slice(0, 3).join(" ‖ ") || (await bandNow(page)).words
  );
  findings.count += await sweep(kit, page, name, "updating");
  const past = await until(
    async () => UNREACHABLE.test((await bandNow(page)).words),
    5000
  );
  kit.check(
    `${name}: past the deadline, the band says the hub is unreachable`,
    past,
    (await bandNow(page)).words
  );
  socket.mode = "proxy";
  await page
    .locator(`${BAND} button[data-slot="button"]:not([aria-busy])`)
    .click({ timeout: 10_000 })
    .catch(() => undefined);
  await until(socket.live, 30_000);
  await until(async () => !(await bandNow(page)).open, 5000);
  await settle(page, 300);

  // ---- (c) a search held 800 ms ----
  await openJump(page, view);
  await page.route(
    (url) => url.pathname === "/api/find",
    async (route) => {
      await Bun.sleep(800);
      await route.continue();
    }
  );
  await page.evaluate((card) => {
    const w = window as unknown as {
      probeFrames: { at: number; h: number; held: number; tweening: boolean }[];
      probeTyped: number;
      probeStop: boolean;
    };
    w.probeFrames = [];
    w.probeTyped = 0;
    w.probeStop = false;
    const field = document.querySelector(
      `${card} [data-slot="finder-field"] input`
    );
    field?.addEventListener(
      "input",
      () => {
        w.probeTyped = performance.now();
      },
      { once: true }
    );
    const tick = (at: number) => {
      const frame = document.querySelector<HTMLElement>(card);
      if (frame) {
        w.probeFrames.push({
          at,
          h: frame.getBoundingClientRect().height,
          held: frame.querySelectorAll(".skeleton-slot").length,
          tweening: frame
            .getAnimations()
            .some((each) =>
              (each.effect as KeyframeEffect | null)
                ?.getKeyframes()
                .some((k) => "height" in k)
            ),
        });
      }
      if (!w.probeStop) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  }, CARD);
  await page.fill(`${CARD} [data-slot="finder-field"] input`, "probe");
  await page.waitForTimeout(1600);
  const run = await page.evaluate(() => {
    const w = window as unknown as {
      probeFrames: { at: number; h: number; held: number; tweening: boolean }[];
      probeTyped: number;
      probeStop: boolean;
    };
    w.probeStop = true;
    return { frames: w.probeFrames, typed: w.probeTyped };
  });
  const after = run.frames.filter((f) => f.at >= run.typed);
  const firstHeld = after.findIndex((f) => f.held > 0);
  kit.check(
    `${name}: placeholder rows within one frame of the query`,
    firstHeld >= 0 && firstHeld <= 1,
    `frame ${firstHeld} of ${after.length} after the input`
  );
  const lastHeld = after.findLastIndex((f) => f.held > 0);
  kit.check(
    `${name}: the answer replaces the placeholders`,
    lastHeld >= 0 &&
      lastHeld < after.length - 1 &&
      (after.at(-1)?.held ?? 1) === 0,
    `placeholders from frame ${firstHeld} to ${lastHeld} of ${after.length}`
  );
  const steps = after
    .slice(1)
    .map((f, i) => ({
      d: f.h - (after[i]?.h ?? f.h),
      tweening: f.tweening || (after[i]?.tweening ?? false),
    }))
    .filter((s) => Math.abs(s.d) > 2 && !s.tweening);
  kit.check(
    `${name}: the card's height animates, never steps`,
    steps.length === 0,
    `${steps.length} step(s): ${steps
      .slice(0, 4)
      .map((s) => s.d.toFixed(1))
      .join(
        ", "
      )}px; heights ${after[0]?.h.toFixed(0)} → ${after.at(-1)?.h.toFixed(0)}`
  );
  await settle(page, 200);
  findings.count += await sweep(kit, page, name, "search answered");
  await page.unroute((url) => url.pathname === "/api/find");

  // ---- (d) the answers a tunnel draws ----
  await page.route(
    (url) => url.pathname === "/api/find",
    (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: PROXY_502 })
  );
  await page.fill(`${CARD} [data-slot="finder-field"] input`, "probe again");
  await page.waitForTimeout(1200);
  await settle(page, 200);
  const searched = await page.evaluate(
    (card) => document.querySelector<HTMLElement>(card)?.innerText ?? "",
    CARD
  );
  kit.check(
    `${name}: a search answered by an HTML 502 says one sentence, no markup`,
    !searched.includes("<") &&
      searched.includes("The hub didn't answer (502).") &&
      !PROXY_WORDS.test(searched),
    searched.replace(/\s+/g, " ").slice(0, 200)
  );
  findings.count += await sweep(kit, page, name, "search 502");
  await page.unroute((url) => url.pathname === "/api/find");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await settle(page, 200);

  // A project's board read through the same tunnel.
  const project = {
    id: "probe-project",
    name: "Probe",
    caw: false,
    createdAt: new Date().toISOString(),
    lands: "main",
    places: [],
    primaryPlaceId: null,
    remote: null,
    review: false,
    appleGate: false,
    upstreamPosts: null,
  };
  await page.route(
    (url) => url.pathname === "/api/projects",
    (route) => route.fulfill({ json: [project] })
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/projects/probe-project/"),
    (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: PROXY_502 })
  );
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/project/probe-project";
    document.body.append(link);
    link.click();
    link.remove();
  });
  await page.waitForURL("**/project/probe-project", { timeout: 20_000 });
  await page.waitForTimeout(1000);
  await settle(page, 200);
  const board = await page.evaluate(
    () => document.querySelector<HTMLElement>("#main-content")?.innerText ?? ""
  );
  kit.check(
    `${name}: a board read answered by an HTML 502 says one sentence, no markup`,
    !board.includes("<") &&
      board.includes("The hub didn't answer (502).") &&
      !PROXY_WORDS.test(board),
    board.replace(/\s+/g, " ").slice(0, 240)
  );
  findings.count += await sweep(kit, page, name, "board 502");
  await frames(page);
  await page.close();
}

/**
 * The kit Button's wording in its cell (pending-content `.kit-words`), on
 * the button bench: label-only, at the button's centre at rest and
 * pending; beside a rest icon, starting right after the slot by the gap.
 */
async function kitButton(kit: Kit) {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}/motion/button-pending`,
    '[data-case="icon-pending"]',
    120_000
  );
  await settle(page, 300);
  const read = await page.evaluate(() =>
    ["label-rest", "label-pending", "icon-rest", "icon-pending"].map((at) => {
      const press = document.querySelector<HTMLElement>(
        `[data-case="${at}"]`
      ) as HTMLElement;
      const words = press.querySelector<HTMLElement>(
        '.kit-words > [data-active="true"]'
      ) as HTMLElement;
      const slot = press.querySelector<HTMLElement>(".kit-slot") as HTMLElement;
      const outer = press.getBoundingClientRect();
      const inner = words.getBoundingClientRect();
      return {
        at,
        word: words.innerText,
        off: inner.left + inner.width / 2 - (outer.left + outer.width / 2),
        afterSlot: inner.left - slot.getBoundingClientRect().right,
        gap: Number.parseFloat(getComputedStyle(press).columnGap),
      };
    })
  );
  for (const one of read) {
    const label = one.at.startsWith("label");
    kit.check(
      label
        ? `kit Button, label only, ${one.at.slice(6)}: its wording at the button's centre`
        : `kit Button, beside an icon, ${one.at.slice(5)}: its wording right after the slot`,
      label
        ? Math.abs(one.off) <= 0.5
        : Math.abs(one.afterSlot - one.gap) <= 0.5,
      JSON.stringify(one)
    );
  }
  await page.close();
}

const spec: Spec = {
  name: "hub-states",
  run: async (kit) => {
    await kitButton(kit);
    const fleet = await kit.fleet(() => ({ everyMs: 0, words: ["ok"] }));
    fleet.launch("hub");
    await fleet.hubUp();
    const base = await fleet.dashboard();
    const findings = { count: 0 };
    for (const view of ["phone", "narrowDesk", "desk"] as const) {
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one leg at a time, each its own page
        await runLeg(kit, base, fleet.base, view, theme, findings);
      }
    }
    kit.check(
      "the overflow and overlap sweep over every state totals zero",
      findings.count === 0,
      `${findings.count} finding(s)`
    );
  },
};
export default spec;
