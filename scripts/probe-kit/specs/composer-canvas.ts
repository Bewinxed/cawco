/**
 * Artifacts, slice 3b (Projects spec §5.10, DESIGN.md Composer "The pen's
 * swipe" and Artifact panel, canvas and ink): the composer's canvas, on a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model) and the built dashboard. Read from the engine, never from pixels:
 * boxes, computed styles, the Web Animations the page runs (held still and
 * scrubbed through the DevTools protocol, anim.ts) and the hub's answers.
 *
 * 1. A pen's swipe up on the pill (pen pointer events) starts the grown
 *    shape's growth at --dur-grow; scrubbed to its end, the canvas's iframe
 *    fills the column above the field, and the field still takes keys.
 * 2. A finger's swipe up on the pill (a touch screen) brings the recall
 *    wheel, not the canvas.
 * 3. ⌘⇧D (Ctrl+Shift+D here) folds the canvas, and again opens it.
 * 4. Its top edge's grab drags its height, held between 40% of the column
 *    and the column less the field; the settle is one animation on the
 *    house spring's keyframes.
 * 5. Dock flies the same iframe (one node) into the side panel's well, one
 *    280 ms transform on the drawer curve, while the shape gives the field
 *    its room back on a 120 ms ease-out; Undock flies it back.
 * 6. Done leaves a chip whose thumbnail is the export's PNG bytes; a tap on
 *    the chip opens the canvas again.
 * 7. Send with two strokes drawn carries canvas.excalidraw and canvas.md as
 *    attachments and one PNG image (the transcript row's chips), and the
 *    hub's read says the canvas is no longer a draft.
 * 8. With prefers-reduced-motion: reduce, opening and Done run opacity
 *    animations only.
 *
 * 11. Send/Stop's glyph swap: with prefers-reduced-motion: reduce, pressing
 *    Send runs opacity-only keyframes over --dur-control, scrubbed 0 → ½ → 1;
 *    without, the incoming glyph's keys are opacity, transform and filter.
 * 12. A top corner's handle resizes it symmetrically: the top-right corner
 *    dragged by (+60, −80) widens it by 120 with its centre unmoved and
 *    raises its top by 80; past both bounds it settles on one spring
 *    animation of the slot's height, left and right at the column less
 *    --space-3 and the column less the field, dragged in at the pill's
 *    width and 40% of the column; the field keeps its width; the size
 *    survives Done and reopen; with reduced motion it lands at once.
 * 13. The rail's Remove: a drawn canvas folds as Done's does (on
 *    --dur-grow-exit), no chip is left, the message carries no canvas, and
 *    the session still lists the artifact.
 * 14. What the canvas shows is what Send sends. The canvas page's sync
 *    socket goes through the iOS probe's gate (ComposerCanvas.swift `gate`,
 *    injected into the canvas's frame here): (a) held from the start (an
 *    upgrade never answered), the refusal line is not drawn at 300 ms and
 *    stands at 1.3 s, mounted no sooner than --dur-wait-grace after the
 *    page's host, a pen stroke adds 0 elements, and Send says the canvas
 *    isn't connected; still held, the page says its link is lost ("didn't
 *    open") within 25 s and Send still refuses; opened, the page holds no
 *    error and a stroke adds an element; (c) cut after a stroke, Send says
 *    the drawing hasn't reached the hub. (b) On a good link (1 to 13) no
 *    canvas page ever starts a refusal run, and Send carries the files (7).
 * 15. The rail stands inside the host's chrome: over the composer
 *    --space-2 under the 44px grab band and --space-3 in from the shape's
 *    sides as drawn; docked, --space-2 from the top and --space-3 in.
 * 16. By touch, the rail fits its page at every width: a phone (docked in
 *    the drawer 374px wide, the tools wrapping to two rows) and a tablet at
 *    1024, 768 and 516px (docked 1008, 752 and 500px wide): both groups
 *    inside the page, 44px boxes, --space-3 in from its sides (inside the
 *    shoulders over the field), apart; over a phone's field at the foot,
 *    docked at the top, the view's under the tools' where they don't fit
 *    side by side.
 *
 * (9: `canvas` and `artifacts` are their own specs, run beside this one.)
 */
import type { CDPSession, Frame, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { Clock } from "../anim";
import { type Box, box } from "../geom";
import {
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  VIEWS,
} from "../kit";

const PILL = "form.cin";
const FIELD = "form.cin textarea";
const STAGE = ".canvas-stage:not([hidden])";
const FRAME = ".canvas-stage iframe";
const SLOT = ".composer > .canvas-slot";
const CHIP = ".canvas-chip";
/** The composer's own dock (the pane draws a `.dock` of its own around it). */
const DOCK = ".dock[data-keeps-draft]";
/**
 * What the canvas's motion runs on, and only that: its stage and the grown
 * shape's outline in the composer's dock. The dock's own Svelte transitions
 * (unnamed runs that may end before the page reads them) are not the
 * canvas's clock, so a catch never holds them.
 */
const MOTION = `.canvas-stage, ${DOCK} .grown-halo`;
const DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

const respond = (request: Seen): Reply => ({
  everyMs: 5,
  words: [request.tools ? "ok" : "Probe title"],
});

interface Read {
  draft?: boolean;
  outline?: string;
}

interface On {
  base: string;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
  said: string[];
  session: string;
}

const near = (a: number, b: number, by = 1.5) => Math.abs(a - b) <= by;
/** A duration token in ms, whichever unit it is written in. */
const ms = (page: Page, token: string) =>
  page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    const n = Number.parseFloat(value);
    return value.endsWith("ms") ? n : n * 1000;
  }, token);

/** A pen's strokes and taps, as the browser's own pen (CDP mouse events with pointerType pen). */
const penOf = (cdp: CDPSession) => {
  const at = (
    type: "mousePressed" | "mouseMoved" | "mouseReleased",
    x: number,
    y: number
  ) =>
    cdp.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      pointerType: "pen",
      force: 0.5,
    });
  return async (from: [number, number], to: [number, number], steps = 12) => {
    await at("mousePressed", from[0], from[1]);
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      // biome-ignore lint/performance/noAwaitInLoops: a stroke's points, one after another
      await at(
        "mouseMoved",
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t
      );
    }
    await at("mouseReleased", to[0], to[1]);
  };
};

declare global {
  interface Window {
    /** The dashboard's window: what the canvas pages it holds said of their link (`cawco:sync`, `cawco:drawn`). */
    kitLinks?: string[];
    /** The dashboard's window: every refusal run a canvas page in it started. */
    kitRefusalRuns?: string[];
    /** A canvas page's window: when its host mounted and its refusal line showed, the line's opacity read at 300 and 1300 ms, and its errors. */
    kitUnlinked?: {
      errors: string[];
      mounted: number | null;
      samples: Record<string, number | null>;
      shown: number | null;
    };
  }
}

/*
 * The scripts below run in the canvas's frame. The stage's iframe is
 * attached before its address is set, so they run once, in its first
 * about:blank document, and the canvas's page then takes that window over
 * (the initial about:blank Window is reused for a same-origin navigation):
 * what they set on the window, and the window's listeners, carry over;
 * what they bind to that first document does not, and the address is read
 * when each event comes, never as they run.
 */

/**
 * (b) Every refusal run a canvas page starts (canvas.css `canvas-refusal-in`,
 * the unlinked line's fade and the image refusal's), heard as it starts and
 * kept in the dashboard's window: a run that starts and ends between two
 * reads of `getAnimations()` is still heard.
 */
function heardRefusals(): void {
  if (window.top === window) {
    return;
  }
  window.addEventListener(
    "animationstart",
    (event) => {
      const { animationName: name } = event as AnimationEvent;
      const { top } = window;
      if (
        top &&
        location.pathname.includes("/__cawco/canvas/") &&
        name.startsWith("canvas-refusal")
      ) {
        top.kitRefusalRuns = [
          ...(top.kitRefusalRuns ?? []),
          `${name} at ${Math.round(performance.now())} ms`,
        ];
      }
    },
    true
  );
}

/**
 * The iOS probe's gate on the canvas page's sync socket (ComposerCanvas.swift
 * `gate`), in the canvas's frame, holding from the start: a socket that is
 * never answered, standing connecting until it is closed (an upgrade the
 * listener never answers). `cawco:probe-sync` with `open` closes the held
 * ones and lets the next through; with `cut` closes every open one and
 * refuses again, as the app's gate does: a socket asks for a path beside
 * its own that the listener upgrades nothing on.
 */
function syncGate(): void {
  if (window.top === window) {
    return;
  }
  const Native = window.WebSocket;
  let mode = "hold";
  const sockets = new Set<WebSocket>();
  const holding = new Set<{ close: () => void }>();
  // biome-ignore lint/performance/useTopLevelRegex: an init script is serialized alone into the page; it reaches nothing outside itself.
  const ARTIFACT = /\/__cawco\/artifact\/[0-9a-f-]{36}$/;
  /** A socket never answered: connecting until closed, then closed as an abnormal close is. */
  const held = (url: string) => {
    const socket = {
      url,
      protocol: "",
      extensions: "",
      binaryType: "blob",
      bufferedAmount: 0,
      readyState: 0,
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null as ((event: CloseEvent) => void) | null,
      send: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      close: () => {
        if (socket.readyState === 3) {
          return;
        }
        socket.readyState = 3;
        holding.delete(socket);
        const closed = socket.onclose;
        setTimeout(() =>
          closed?.call(socket, new CloseEvent("close", { code: 1006 }))
        );
      },
    };
    holding.add(socket);
    return socket;
  };
  function Gate(url: string | URL, protocols?: string | string[]) {
    const at = new URL(String(url), location.href);
    if (!ARTIFACT.test(at.pathname)) {
      return new Native(url, protocols);
    }
    if (mode === "hold") {
      return held(at.toString());
    }
    if (mode !== "open") {
      at.pathname += "/probe-refused";
    }
    const socket = new Native(at.toString(), protocols);
    sockets.add(socket);
    socket.addEventListener("close", () => sockets.delete(socket));
    return socket;
  }
  Gate.prototype = Native.prototype;
  Object.assign(Gate, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
  window.WebSocket = Gate as unknown as typeof WebSocket;
  window.addEventListener("message", (event) => {
    if (event.data?.type !== "cawco:probe-sync") {
      return;
    }
    if (event.data.mode === "open") {
      mode = "open";
      for (const socket of holding) {
        socket.close();
      }
      return;
    }
    mode = "refuse";
    for (const socket of sockets) {
      socket.close();
    }
  });
}

/**
 * In a canvas page: when its host mounted, when its refusal line was first
 * drawn after that, the line's opacity 300 and 1300 ms after the mount (null
 * while it isn't drawn), and every error the page raised.
 */
function watchUnlinked(): void {
  if (window.top === window) {
    return;
  }
  const seen: NonNullable<Window["kitUnlinked"]> = {
    errors: [],
    mounted: null,
    samples: {},
    shown: null,
  };
  window.kitUnlinked = seen;
  window.addEventListener("error", (event) =>
    seen.errors.push(String(event.error?.stack ?? event.message))
  );
  window.addEventListener("unhandledrejection", (event) =>
    seen.errors.push(String(event.reason?.stack ?? event.reason))
  );
  const opacity = () => {
    const line = document.querySelector(".canvas-unlinked-line");
    return line ? Number(getComputedStyle(line).opacity) : null;
  };
  const look = () => {
    const now = performance.now();
    if (seen.mounted === null && document.querySelector(".canvas-host")) {
      seen.mounted = now;
      for (const at of [300, 1300]) {
        setTimeout(() => {
          seen.samples[at] = opacity();
        }, at);
      }
    }
    if (
      seen.mounted !== null &&
      seen.shown === null &&
      document.querySelector(".canvas-unlinked")
    ) {
      seen.shown = now - seen.mounted;
    }
  };
  // The canvas's own document, once it has one: its parse ends before React
  // first commits the host (a later task), so the mount is seen as it lands.
  window.addEventListener("DOMContentLoaded", () => {
    if (!location.pathname.includes("/__cawco/canvas/")) {
      return;
    }
    look();
    new MutationObserver(look).observe(document, {
      childList: true,
      subtree: true,
    });
  });
}

/** In the dashboard's window: what each canvas page says of its link and its count. */
function heardLinks(): void {
  if (window.top !== window) {
    return;
  }
  window.kitLinks = [];
  window.addEventListener("message", (event) => {
    const type = event.data?.type;
    if (type === "cawco:sync") {
      window.kitLinks?.push(
        `sync ${event.data.state}${event.data.error ? `: ${event.data.error}` : ""}`
      );
    } else if (type === "cawco:drawn") {
      window.kitLinks?.push(`drawn ${event.data.count}`);
    }
  });
}

const setUp = async (kit: Kit): Promise<On> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const session = await fleet.spawn("claude", "Canvas", fleet.repo);
  const base = await fleet.dashboard();
  const page = await kit.page("desk", { init: [heardRefusals] });
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      said.push(`error: ${message.text()}`);
    }
  });
  await open(page, `${base}/session/${session}`, FIELD);
  await settle(page);
  return { base, fleet, kit, page, said, session };
};

/** The column the canvas stands in, as the composer measures it: the dock's box and the composer's top. */
const column = (page: Page) =>
  page.evaluate((sel) => {
    const dock = document.querySelector(sel)?.getBoundingClientRect();
    const composer = document
      .querySelector(`${sel} .composer`)
      ?.getBoundingClientRect();
    const space = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--space-3")
    );
    return dock && composer
      ? {
          top: dock.top,
          height: dock.height,
          foot: composer.top,
          left: composer.left,
          right: composer.right,
          max: composer.top - dock.top - space,
          min: Math.min(composer.top - dock.top - space, 0.4 * dock.height),
        }
      : null;
  }, DOCK);

/**
 * The canvas's own runs, held still by the clock (anim.ts), put
 * at `fraction` of their length: they may start after the clock caught its
 * first runs (Dock's flight waits on the panel), so they are found by id.
 */
const seekCanvas = async (page: Page, fraction: number) => {
  await page.evaluate((f) => {
    for (const run of window.kitRuns()) {
      if (run.id.startsWith("canvas-")) {
        const end = Number(run.effect?.getComputedTiming().endTime);
        run.currentTime = end * f;
      }
    }
  }, fraction);
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );
};

/** The runs a caught clock holds, read on the page: id, duration, easing, the properties they animate. */
const runsOn = (page: Page) =>
  page.evaluate(() =>
    window
      .kitRuns()
      .filter((run) => run.id.startsWith("canvas-"))
      .map((run) => {
        const effect = run.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        return {
          id: run.id,
          duration: Number(effect.getTiming().duration),
          easing: effect.getTiming().easing,
          props: [
            ...new Set(
              frames.flatMap((frame) =>
                Object.keys(frame).filter(
                  (key) =>
                    ![
                      "offset",
                      "easing",
                      "composite",
                      "computedOffset",
                    ].includes(key)
                )
              )
            ),
          ],
          frames: frames.length,
        };
      })
  );

const probe = async (kit: Kit) => {
  const on = await setUp(kit);
  await touchCheck(on);
  const clock = await Clock.on(on.page);
  await swapCheck(on, clock);
  const cdp = await on.page.context().newCDPSession(on.page);
  const pen = penOf(cdp);
  await openCheck(on, clock, pen);
  await strokes(on, pen);
  await railCheck(on, "composer");
  await resizeCheck(on, clock);
  await cornerCheck(on, clock);
  await keyCheck(on);
  await dockCheck(on, clock);
  const id = await chipCheck(on);
  if (id) {
    await sendCheck(on, id);
  }
  await goodLinkCheck(on);
  await reducedCheck(on, clock);
  await removeCheck(on, clock, pen);
  await syncCheck(on);
  await phoneCheck(on, "phone");
  await phoneCheck(on, "tablet");
  await phoneCheck(on, "tablet", 768);
  // A docked canvas about 500px wide under a finger: the iPad's panel width.
  await phoneCheck(on, "tablet", 516);
  kit.check(
    "the page said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
  );
};

/** The Send/Stop button and the glyph carriers it swaps. */
const SEND = ".ctrls .stop";
const SWAP = ".stop .swap";

/**
 * Each glyph carrier in the button as the engine draws it, by the run that
 * moves it now: `out` for one the Svelte transition takes away (its Web
 * Animation; the carrier's own finished keyframes in are not what moves it),
 * else `in` for one its CSS keyframes bring in (Svelte scopes their name:
 * `svelte-<hash>-icon-swap`, `…-icon-swap-still`). Svelte's 0 ms bookkeeping
 * run, with no keys, is no run. Carriers with neither are left out.
 */
const swapNow = (page: Page) =>
  page.evaluate((sel) => {
    const meta = ["offset", "easing", "composite", "computedOffset"];
    return [...document.querySelectorAll(sel)].flatMap((el) => {
      const runs = el
        .getAnimations()
        .map((run) => {
          const effect = run.effect as KeyframeEffect;
          const named = run as Animation & {
            animationName?: string;
            transitionProperty?: string;
          };
          let name = "svelte";
          if (named.animationName !== undefined) {
            name = named.animationName;
          } else if (named.transitionProperty !== undefined) {
            name = `transition:${named.transitionProperty}`;
          }
          return {
            name,
            duration: Number(effect.getTiming().duration),
            at: Number(run.currentTime),
            props: [
              ...new Set(
                effect
                  .getKeyframes()
                  .flatMap((frame) =>
                    Object.keys(frame).filter((key) => !meta.includes(key))
                  )
              ),
            ].sort(),
          };
        })
        .filter((run) => run.duration > 0 && run.props.length > 0);
      const out = runs.find((run) => run.name === "svelte");
      const into = runs.find((run) => run.name.includes("icon-swap"));
      const moving = out ?? into;
      if (!moving) {
        return [];
      }
      const s = getComputedStyle(el);
      return [
        {
          side: out ? ("out" as const) : ("in" as const),
          run: moving,
          others: runs
            .filter((one) => one !== moving)
            .map((one) => `${one.name} [${one.props.join()}]`),
          opacity: Number(s.opacity),
          transform: s.transform,
          scale: s.scale,
          filter: s.filter,
        },
      ];
    });
  }, SWAP);

/**
 * 11. Send/Stop's glyph swap (DESIGN.md's Reduced Motion Rule: "opacity and
 * colour fades still run … It does not mean an instant swap"): pressing Send
 * swaps the glyph over --dur-control. With reduced motion every run animates
 * opacity alone, scrubbed 0 → ½ → 1 with no scale, transform or blur; without,
 * the incoming glyph's keys are opacity, transform and filter and the
 * outgoing's opacity, scale and filter.
 */
const swapCheck = async (on: On, clock: Clock) => {
  const { kit, page } = on;
  const control = await ms(page, "--dur-control");
  const press = async (motion: "reduce" | "no-preference") => {
    await page.emulateMedia({ reducedMotion: motion });
    await until(
      "the button back on Send",
      () => page.locator(SEND).getAttribute("aria-label"),
      (label) => label === "Send message",
      60_000
    );
    await page.focus(FIELD);
    await page.keyboard.type("Swap");
    const kept = await clock.catchRuns(() => page.click(SEND), SWAP, 5000);
    // The swap's own length: the pending spinner's endless turn is caught too.
    const of = kept.find((run) => run.name.includes("icon-swap"))?.name;
    const looks: Awaited<ReturnType<typeof swapNow>>[] = [];
    for (const fraction of [0, 0.5, 1]) {
      // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, each read where it lands
      await clock.seek(fraction, of);
      // The carriers the clock moved: a later swap's held runs stand at 0.
      looks.push(
        (await swapNow(page)).filter(
          (one) => Math.abs(one.run.at - one.run.duration * fraction) <= 1
        )
      );
    }
    await clock.release();
    // A later swap's outro (the spinner's, Stop's) holds Svelte's 0 ms first
    // run, which builds the real keyframes as it finishes, from the options
    // its press made: let each finish now, so none builds in the next press.
    await page.evaluate((sel) => {
      for (const run of window.kitRuns()) {
        const target = (run.effect as KeyframeEffect | null)?.target;
        if (
          run.playState === "paused" &&
          window.kitInside(target, sel) &&
          Number.isFinite(Number(run.effect?.getComputedTiming().endTime))
        ) {
          run.finish();
        }
      }
    }, SWAP);
    await until(
      "every swap of this press played out",
      () =>
        page.evaluate(
          (sel) =>
            window
              .kitRuns()
              .filter(
                (run) =>
                  run.playState !== "finished" &&
                  window.kitInside(
                    (run.effect as KeyframeEffect | null)?.target,
                    sel
                  ) &&
                  Number.isFinite(
                    Number(run.effect?.getComputedTiming().endTime)
                  )
              ).length,
          SWAP
        ),
      (left) => left === 0,
      10_000
    );
    return looks;
  };
  const [still0, stillHalf, still1] = await press("reduce");
  const [moving0, movingHalf, moving1] = await press("no-preference");
  await until(
    "the button back on Send",
    () => page.locator(SEND).getAttribute("aria-label"),
    (label) => label === "Send message",
    60_000
  ).catch(() => undefined);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());

  const runsOf = (looks: Awaited<ReturnType<typeof swapNow>>) =>
    looks.map((one) => ({ side: one.side, ...one.run }));
  const stillRuns = runsOf([...still0, ...stillHalf, ...still1]);
  const movingRuns = runsOf([...moving0, ...movingHalf, ...moving1]);
  const side = (
    looks: Awaited<ReturnType<typeof swapNow>>,
    which: "in" | "out"
  ) => looks.filter((one) => one.side === which);
  const flat = (looks: Awaited<ReturnType<typeof swapNow>>) =>
    looks.every(
      (one) =>
        one.transform === "none" &&
        one.scale === "none" &&
        one.filter === "none"
    );
  const fades =
    side(still0, "in").every((one) => one.opacity === 0) &&
    side(stillHalf, "in").every((one) => one.opacity > 0 && one.opacity < 1) &&
    side(still1, "in").every((one) => one.opacity === 1) &&
    side(stillHalf, "out").every((one) => one.opacity > 0 && one.opacity < 1);
  kit.check(
    "11: with reduced motion pressing Send swaps the glyph over --dur-control by opacity alone, scrubbed 0 → ½ → 1 with no scale, transform or blur",
    stillRuns.length > 0 &&
      stillRuns.some((run) => run.name.endsWith("icon-swap-still")) &&
      stillRuns.some((run) => run.side === "out") &&
      stillRuns.every(
        (run) => run.duration === control && run.props.join() === "opacity"
      ) &&
      fades &&
      [still0, stillHalf, still1].every(flat),
    `--dur-control ${control} ms; runs ${JSON.stringify(stillRuns)}; ½ ${JSON.stringify(stillHalf)}; 1 ${JSON.stringify(still1)}`
  );
  const incoming = movingRuns.filter((run) => run.side === "in");
  const outgoing = movingRuns.filter((run) => run.side === "out");
  kit.check(
    "11: without reduced motion the incoming glyph's keys are opacity, transform and filter, the outgoing's opacity, scale and filter, over --dur-control, and they travel at ½",
    incoming.length > 0 &&
      outgoing.length > 0 &&
      incoming.every(
        (run) =>
          run.name.endsWith("-icon-swap") &&
          run.props.join() === "filter,opacity,transform" &&
          run.duration === control
      ) &&
      outgoing.every(
        (run) =>
          run.props.join() === "filter,opacity,scale" &&
          run.duration === control
      ) &&
      side(movingHalf, "in").every(
        (one) => one.transform !== "none" && one.filter !== "none"
      ) &&
      side(movingHalf, "out").every(
        (one) => one.scale !== "none" && one.filter !== "none"
      ),
    `runs ${JSON.stringify(movingRuns)}; ½ ${JSON.stringify(movingHalf)}; 1 ${JSON.stringify(moving1)}`
  );
};

/** 2. A finger's swipe up on the pill brings the wheel, never the canvas. */
const touchCheck = async (on: On) => {
  const page = await on.kit.page("tablet");
  await open(page, `${on.base}/session/${on.session}`, FIELD);
  await settle(page);
  // The keyboard down: the pill is a control to hold, as on a touch screen at rest.
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  const pill = (await box(page, PILL)) as Box;
  const cdp = await page.context().newCDPSession(page);
  const x = pill.left + pill.width * 0.3;
  const y = pill.top + pill.height / 2;
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", ty: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: ty }],
    });
  await touch("touchStart", y);
  for (let step = 1; step <= 6; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a swipe's points, in order
    await touch("touchMove", y - step * 10);
  }
  await touch("touchEnd", y - 60);
  await settle(page);
  const seen = await page.evaluate(
    ([stage]) => ({
      wheel: !!document.querySelector(".shell.rolling"),
      canvas: !!document.querySelector(stage as string),
    }),
    [STAGE]
  );
  on.kit.check(
    "2: a finger's swipe up on the pill brings the recall wheel, not the canvas",
    seen.wheel && !seen.canvas,
    JSON.stringify(seen)
  );
  await page.close();
};

/** 1. The pen's swipe grows the canvas over --dur-grow; at its end it fills the column above the field; the field takes keys. */
const openCheck = async (
  on: On,
  clock: Clock,
  pen: ReturnType<typeof penOf>
) => {
  const { kit, page } = on;
  const grow = await ms(page, "--dur-grow");
  const pill = (await box(page, PILL)) as Box;
  const x = pill.left + pill.width * 0.3;
  const y = pill.top + pill.height / 2;
  // The swipe makes the canvas and loads its page, its growth caught.
  const caught = await clock.catchRuns(
    () => pen([x, y], [x, y - 60], 6),
    MOTION,
    8000
  );
  const runs = await runsOn(page);
  const growth = runs.filter((one) => one.id === "canvas-grow");
  // Their start times as the protocol reported them starting: held, the
  // runs' own `startTime` reads null.
  const started = caught
    .filter((run) => run.name === "canvas-grow")
    .map((run) => run.start);
  // A fifth of the way (the rise eases out, nearly up by half-time): the
  // shape's outline, its edge the pill's border, is drawn part-way up,
  // whole, never cut by a clip of its own.
  await seekCanvas(page, 0.2);
  const halfway = await page.evaluate((sel) => {
    const halo = document.querySelector(`${sel} .grown-halo`);
    const path = halo?.querySelector("path");
    const field = document.querySelector(`${sel} form.cin`);
    return halo && path && field
      ? {
          height: halo.getBoundingClientRect().height,
          pill: field.getBoundingClientRect().height,
          clip: getComputedStyle(halo).clipPath,
          stroke: path.getAttribute("stroke"),
        }
      : null;
  }, DOCK);
  await clock.seek(1);
  await seekCanvas(page, 1);
  const frame = await box(page, FRAME);
  const room = await column(page);
  const whole = await page.evaluate(
    (sel) =>
      document.querySelector(`${sel} .grown-halo`)?.getBoundingClientRect()
        .height ?? 0,
    DOCK
  );
  await clock.release();
  await settle(page);
  const restRoom = await column(page);
  const rest = await box(page, FRAME);
  kit.check(
    "1: a pen's swipe up on the pill makes the canvas and stands it over the field",
    !!(rest && restRoom) &&
      near(rest.bottom, restRoom.foot) &&
      near(rest.top, restRoom.foot - restRoom.max),
    `frame ${JSON.stringify(rest)}; column ${JSON.stringify(restRoom)}`
  );
  kit.check(
    "1: a fifth of the way through, the grown shape's outline stands part-way up, its edge drawn whole (no clip on it)",
    !!halfway &&
      halfway.clip === "none" &&
      !!halfway.stroke &&
      halfway.height > halfway.pill + 20 &&
      halfway.height < whole - 20,
    `${JSON.stringify(halfway)}; grown ${whole}`
  );
  kit.check(
    "1: a pen's swipe up on the pill starts the grown shape's growth on --dur-grow: the shape and the canvas in it, together",
    growth.length === 2 &&
      growth.every((one) => one.duration === grow) &&
      started.length === 2 &&
      started.every((one) => one !== null) &&
      near(Number(started[0]), Number(started[1]), 0.5) &&
      caught.length >= 2,
    `--dur-grow ${grow}; started ${started.join(", ")}; ${JSON.stringify(growth)}`
  );
  kit.check(
    "1: scrubbed to its end, the canvas's iframe fills the column above the field",
    !!(frame && room) &&
      near(frame.bottom, room.foot) &&
      near(frame.top, room.foot - room.max) &&
      near(frame.left, room.left + 1) &&
      near(frame.right, room.right - 1),
    `frame ${JSON.stringify(frame)}; column ${JSON.stringify(room)}`
  );
  await page.focus(FIELD);
  await page.keyboard.type("Over the canvas");
  const typed = await page.inputValue(FIELD);
  kit.check(
    "1: with the canvas standing, the field still takes keys",
    typed.includes("Over the canvas"),
    JSON.stringify(typed)
  );
  await page.fill(FIELD, "");
};

/** Two pen strokes on the canvas: what Send carries. */
const strokes = async (on: On, pen: ReturnType<typeof penOf>) => {
  const frame = await (
    await on.page.locator(FRAME).elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("the canvas's iframe has no document");
  }
  await frame.waitForSelector(".canvas-host .excalidraw", { timeout: 60_000 });
  await frame.click('.rail-box[aria-label^="Pen"]');
  const at = (await box(on.page, FRAME)) as Box;
  const p = (fx: number, fy: number): [number, number] => [
    at.left + at.width * fx,
    at.top + at.height * fy,
  ];
  await pen(p(0.2, 0.4), p(0.45, 0.7));
  await pen(p(0.55, 0.4), p(0.8, 0.7));
  await settle(on.page, 300);
};

/** 4. The grab drags the height within its bounds; the settle is one animation on the house spring. */
const resizeCheck = async (on: On, clock: Clock) => {
  const { kit, page } = on;
  const room = await column(page);
  const grab = await box(page, ".canvas-stage .grab");
  if (!(room && grab)) {
    kit.check("4: the canvas has a grab on its top edge", false);
    return;
  }
  const gx = grab.left + grab.width / 2;
  const gy = grab.top + grab.height / 2;
  // Down past the floor, the finger slow: rubber-banded under it, then the floor.
  await page.mouse.move(gx, gy);
  await page.mouse.down();
  await page.mouse.move(gx, gy + 120, { steps: 8 });
  const mid = (await box(page, SLOT))?.height ?? 0;
  await page.mouse.move(gx, gy + room.max, { steps: 12 });
  await page.waitForTimeout(120);
  await clock.catchRuns(() => page.mouse.up(), SLOT, 3000);
  const runs = (await runsOn(page)).filter((one) => one.id === "canvas-settle");
  await clock.seek(1);
  const floored = ((await box(page, SLOT))?.height ?? 0) + 1;
  await clock.release();
  await settle(page);
  kit.check(
    "4: dragging the top edge changes the height 1:1 within its bounds",
    near(mid, room.max - 1 - 120, 2),
    `${mid + 1} after 120 px down from ${room.max}`
  );
  kit.check(
    "4: dragged past the floor and let go, it settles at 40% of the column; the settle is one animation on the spring's keyframes",
    near(floored, room.min, 1) &&
      runs.length === 1 &&
      runs[0].easing === "linear" &&
      runs[0].props.join() === "height" &&
      runs[0].frames >= 10,
    `settled ${floored}, floor ${room.min}; ${JSON.stringify(runs)}`
  );
  // Up past the column: the column less the field.
  const top = (await box(page, ".canvas-stage .grab")) as Box;
  await page.mouse.move(gx, top.top + top.height / 2);
  await page.mouse.down();
  await page.mouse.move(gx, room.top - 200, { steps: 16 });
  await page.waitForTimeout(120);
  await page.mouse.up();
  await settle(page);
  const ceiling = ((await box(page, SLOT))?.height ?? 0) + 1;
  kit.check(
    "4: dragged past the top and let go, it settles at the column less the field",
    near(ceiling, room.max, 1),
    `${ceiling}, ceiling ${room.max}`
  );
};

const CORNER_LEFT = ".canvas-stage .grab-top-left";
const CORNER_RIGHT = ".canvas-stage .grab-top-right";
const TOP_GRAB = ".canvas-stage .grab-top";

/** The column's sides the width holds to (less --space-3 each side) and the pill's box. */
const sides = (page: Page) =>
  page.evaluate(
    ([sel, pill]) => {
      const dock = document
        .querySelector(sel as string)
        ?.getBoundingClientRect();
      const field = document
        .querySelector(pill as string)
        ?.getBoundingClientRect();
      const shell = document
        .querySelector(`${sel} .shell`)
        ?.getBoundingClientRect();
      const space = Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--space-3")
      );
      return dock && field && shell
        ? {
            left: dock.left + space,
            right: dock.right - space,
            pill: { left: shell.left, right: shell.right, width: shell.width },
            field: field.width,
          }
        : null;
    },
    [DOCK, PILL]
  );

/** The canvas's own box: its slot, a pixel inside the shape each side; its top and its centre. */
const canvasBox = async (page: Page) => {
  const at = await box(page, SLOT);
  return at
    ? {
        left: at.left - 1,
        right: at.right + 1,
        width: at.width + 2,
        top: at.top,
        centre: (at.left + at.right) / 2,
      }
    : null;
};

/** A handle's centre, once it stands. */
const gripAt = async (page: Page, selector: string) => {
  await page.waitForSelector(selector, { timeout: 5000 });
  const at = (await box(page, selector)) as Box;
  return { x: at.left + at.width / 2, y: at.top + at.height / 2 };
};

/** A drag on a handle by (dx, dy) in steps, held still before it lets go; `up` runs the release. */
const dragBy = async (
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  up: () => Promise<unknown> = () => page.mouse.up()
) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 10 });
  await page.waitForTimeout(150);
  await up();
};

/**
 * 12. A top corner's handle resizes the canvas symmetrically: the width by
 * twice its sideways travel (both sides move, the centre on the pill's),
 * the height by its travel up (the top edge; the foot stays on the field).
 * Let go past the bounds, both settle on one spring animation of the slot
 * (its height, left and right on one clock, linear between the spring's
 * keyframes) at the column less --space-3 and the column less the field;
 * dragged in, at the pill's width and 40% of the column; the field keeps
 * its width; Done and reopen keep the size; reduced motion lands at once.
 */
const cornerCheck = async (on: On, clock: Clock) => {
  const { kit, page } = on;
  const room = await sides(page);
  const span = await column(page);
  if (!(room && span)) {
    kit.check("12: the canvas stands with its corner handles", false);
    return;
  }
  // From the floor's height, so the corner has room to raise it.
  await page.focus(TOP_GRAB);
  await page.keyboard.press("End");
  await settle(page, 300);
  const before = (await canvasBox(page)) as NonNullable<
    Awaited<ReturnType<typeof canvasBox>>
  >;
  // The top-right corner by (+60, −80), held: 1:1 while it is within its bounds.
  let grip = await gripAt(page, CORNER_RIGHT);
  await page.mouse.move(grip.x, grip.y);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y - 80, { steps: 10 });
  const moved = await canvasBox(page);
  // On past both bounds and let go: the column's, on one spring.
  await page.mouse.move(grip.x + 2000, grip.y - 2000, { steps: 16 });
  await page.waitForTimeout(150);
  await clock.catchRuns(() => page.mouse.up(), SLOT, 3000);
  const runs = (await runsOn(page)).filter((one) => one.id === "canvas-settle");
  await clock.seek(1);
  const widest = await canvasBox(page);
  await clock.release();
  await settle(page);
  const field = (await box(page, PILL))?.width ?? 0;
  kit.check(
    "12: the top-right corner dragged by (+60, −80) widens the canvas by 120 with its centre unmoved (left −60, right +60) and raises its top by 80",
    !!moved &&
      near(moved.width, before.width + 120, 2) &&
      near(moved.left, before.left - 60, 1) &&
      near(moved.right, before.right + 60, 1) &&
      near(moved.centre, before.centre, 0.5) &&
      near(moved.top, before.top - 80, 1),
    `before ${JSON.stringify(before)}; after ${JSON.stringify(moved)}`
  );
  const reachEach = Math.min(
    room.pill.left - room.left,
    room.right - room.pill.right
  );
  kit.check(
    "12: dragged past both bounds and let go, it settles on one spring animation of the slot's height, left and right at the column less --space-3 (centred on the pill) and the column less the field; the field keeps its width",
    !!widest &&
      near(widest.width, room.pill.width + 2 * reachEach, 1.5) &&
      near(widest.centre, before.centre, 0.5) &&
      near(widest.top, span.foot - span.max, 1.5) &&
      runs.length === 1 &&
      runs[0].easing === "linear" &&
      [...runs[0].props].sort().join() === "height,left,right" &&
      runs[0].frames >= 10 &&
      near(field, room.field, 0.5),
    `settled ${JSON.stringify(widest)}; pill ${JSON.stringify(room.pill)}, column ${room.left}–${room.right}, top ${span.foot - span.max}; field ${field} (was ${room.field}); ${JSON.stringify(runs)}`
  );
  // Dragged in past both: the pill's width and the floor's height.
  grip = await gripAt(page, CORNER_RIGHT);
  await dragBy(page, grip, -2000, 2000);
  await settle(page);
  const narrowest = await canvasBox(page);
  kit.check(
    "12: dragged in past both bounds, it settles at the pill's width and 40% of the column",
    !!narrowest &&
      near(narrowest.width, room.pill.width, 1.5) &&
      near(narrowest.top, span.foot - span.min, 1.5),
    `${JSON.stringify(narrowest)}; pill ${room.pill.width}; floor top ${span.foot - span.min}`
  );
  // A size chosen inside the bounds survives Done and reopen.
  grip = await gripAt(page, CORNER_LEFT);
  await dragBy(page, grip, -50, -60);
  await settle(page);
  const chosen = await canvasBox(page);
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
  const reopened = await canvasBox(page);
  kit.check(
    "12: the size chosen by the top-left corner (wider by 100, taller by 60) survives Done and reopen",
    !!(reopened && chosen && narrowest) &&
      near(chosen.width, narrowest.width + 100, 2) &&
      near(chosen.top, narrowest.top - 60, 1.5) &&
      near(reopened.left, chosen.left, 1) &&
      near(reopened.right, chosen.right, 1) &&
      near(reopened.top, chosen.top, 1),
    `${JSON.stringify(reopened)} (was ${JSON.stringify(chosen)})`
  );
  // Reduced motion: the corner's drag lands where it is let go, no settle run.
  await page.emulateMedia({ reducedMotion: "reduce" });
  grip = await gripAt(page, CORNER_RIGHT);
  const from = (await canvasBox(page)) as NonNullable<
    Awaited<ReturnType<typeof canvasBox>>
  >;
  let landed: { box: Awaited<ReturnType<typeof canvasBox>>; settling: number } =
    { box: null, settling: -1 };
  await dragBy(page, grip, 30, -40, async () => {
    await page.mouse.up();
    landed = {
      box: await canvasBox(page),
      settling: await page.evaluate(
        () =>
          document.getAnimations().filter((run) => run.id === "canvas-settle")
            .length
      ),
    };
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await settle(page);
  kit.check(
    "12: with reduced motion the corner's drag lands at once where it is let go (no settle animation): wider by 60, its top up by 40",
    !!landed.box &&
      near(landed.box.width, from.width + 60, 2) &&
      near(landed.box.top, from.top - 40, 1.5) &&
      landed.settling === 0,
    `${JSON.stringify(landed)}; from ${JSON.stringify(from)}`
  );
};

/**
 * The rail's two groups in the canvas's page, px from the page's top and
 * from its sides, and the inset the host told the page.
 */
const railAt = async (page: Page) => {
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  return frame
    ? frame.evaluate(() => {
        const tools = document
          .querySelector(".rail-tools")
          ?.getBoundingClientRect();
        const view = document
          .querySelector(".rail-view")
          ?.getBoundingClientRect();
        const root = getComputedStyle(document.documentElement);
        const px = (name: string) =>
          Number.parseFloat(root.getPropertyValue(name));
        return tools && view
          ? {
              toolsTop: tools.top,
              viewTop: view.top,
              toolsBottom: tools.bottom,
              left: tools.left,
              right: innerWidth - view.right,
              insetTop: px("--canvas-inset-top"),
              insetSide: px("--canvas-inset-side"),
              space2: px("--space-2"),
              space3: px("--space-3"),
            }
          : null;
      })
    : null;
};

/**
 * 15. The rail stands inside the host's chrome: over the composer
 * --space-2 under the 44px grab band (--c-btn-h-lg) and --space-3 in from
 * the shape's sides as drawn (the corner's inset), where its corner
 * handles are; docked, --space-2 from the top and --space-3 from the sides.
 */
const railCheck = async (on: On, where: "composer" | "docked") => {
  const { kit, page } = on;
  const band = Number.parseFloat(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-btn-h-lg"
      )
    )
  );
  const corner = await page.evaluate((sel) => {
    const zone = document.querySelector(sel);
    return zone
      ? Number.parseFloat(
          getComputedStyle(zone).getPropertyValue("--corner-in")
        )
      : 0;
  }, CORNER_RIGHT);
  const rail = await until(
    "the page's rail under the host's inset",
    () => railAt(page),
    (at) => !!at && at.insetTop === (where === "composer" ? band : 0),
    5000
  ).catch(() => railAt(page));
  const top = where === "composer" ? band : 0;
  const side = where === "composer" ? corner : 0;
  kit.check(
    `15: ${where === "composer" ? "over the composer" : "docked"}, the rail's groups stand ${top} + --space-2 below the canvas's top and ${side ? `${side.toFixed(1)} + ` : ""}--space-3 in from its sides`,
    !!rail &&
      near(rail.toolsTop, top + rail.space2, 0.5) &&
      // Too narrow for both side by side (canvas.css, under 560px) the view's stands under the tools'.
      (near(rail.viewTop, top + rail.space2, 0.5) ||
        near(rail.viewTop, rail.toolsBottom + rail.space2, 0.5)) &&
      near(rail.left, side + rail.space3, 0.5) &&
      near(rail.right, side + rail.space3, 0.5),
    JSON.stringify(rail)
  );
};

/** 13. The rail's Remove folds a drawn canvas as Done does, leaves no chip and no canvas in the message; the session keeps the artifact. */
const removeCheck = async (
  on: On,
  clock: Clock,
  pen: ReturnType<typeof penOf>
) => {
  const { kit, page, fleet, session } = on;
  const exit = await ms(page, "--dur-grow-exit");
  // The reduced-motion check left its canvas folded to its chip: open it and draw.
  await page.click(`${CHIP} .canvas-open`);
  await settle(page, 300);
  const id = await page.getAttribute(STAGE, "data-artifact");
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  if (!(id && frame)) {
    kit.check("13: a canvas stands to remove", false);
    return;
  }
  await frame.waitForSelector(".canvas-host .excalidraw", { timeout: 60_000 });
  await frame.click('.rail-box[aria-label^="Pen"]');
  const at = (await box(page, FRAME)) as Box;
  await pen(
    [at.left + at.width * 0.3, at.top + at.height * 0.5],
    [at.left + at.width * 0.6, at.top + at.height * 0.6]
  );
  await settle(page, 300);
  await clock.catchRuns(
    () => frame.click('.rail-box[aria-label="Remove"]'),
    MOTION,
    8000
  );
  const runs = (await runsOn(page)).filter((one) => one.id === "canvas-fold");
  await clock.release();
  await settle(page, 300);
  const after = await page.evaluate(
    ([stage, chip]) => ({
      stage: !!document.querySelector(stage as string),
      chip: !!document.querySelector(chip as string),
      atts: document.querySelectorAll(".composer .atts [data-artifact]").length,
    }),
    [STAGE, CHIP]
  );
  const listed = await fleet.api<{ id: string }[]>(
    `/api/instances/${session}/artifacts`
  );
  kit.check(
    "13: Remove folds the drawn canvas as Done does (its runs on --dur-grow-exit), leaves no canvas or Ink chip in the message, and the session still lists the artifact",
    runs.length > 0 &&
      runs.every((one) => one.duration === exit) &&
      !after.stage &&
      !after.chip &&
      after.atts === 0 &&
      listed.some((one) => one.id === id),
    `--dur-grow-exit ${exit}; ${JSON.stringify(runs)}; ${JSON.stringify(after)}; listed ${listed.some((one) => one.id === id)}`
  );
};

/** (b) A good link: from the first open through Send, no canvas page started a refusal run. */
const goodLinkCheck = async (on: On) => {
  const runs = await on.page.evaluate(() => window.kitRefusalRuns ?? []);
  on.kit.check(
    "14 (b): on a good link no canvas page started a refusal run from its open through Send",
    runs.length === 0,
    runs.join(", ") || "none"
  );
};

/** The sentences a Send of the canvas refuses with (canvas-room.svelte.ts). */
const NOT_CONNECTED =
  "The canvas isn't connected to the hub, so nothing was sent. Send again once it reconnects, or remove the canvas to send your words alone.";
const NOT_REACHED =
  "Your drawing hasn't reached the hub yet, so nothing was sent. Wait a moment, then send again.";

/**
 * 14 (a) and (c): the canvas page's sync socket through the gate, on a page
 * of its own. Refused from the start; opened; cut after a stroke.
 */
const syncCheck = async (on: On) => {
  const { kit, fleet, base, session } = on;
  const page = await kit.page("desk", {
    init: [heardRefusals, syncGate, watchUnlinked, heardLinks],
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page, `${base}/session/${session}`, FIELD);
  await settle(page);
  const pen = penOf(await page.context().newCDPSession(page));
  await page.focus(FIELD);
  const opened = performance.now();
  await page.keyboard.press("Control+Shift+KeyD");
  await page.waitForSelector(STAGE, { timeout: 20_000 });
  const id = await page.getAttribute(STAGE, "data-artifact");
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  if (!(id && frame)) {
    kit.check("14: a canvas opens on the gated page", false);
    return;
  }
  await frame.waitForSelector(".canvas-host .excalidraw", { timeout: 60_000 });
  await settle(page, 300);
  /** Elements the page's doc holds, drawn and not deleted. */
  const counted = () =>
    frame.evaluate(
      () =>
        (
          window as unknown as {
            cawcoArtifact: {
              doc: {
                getArray: (name: string) => {
                  toArray: () => { get: (key: string) => unknown }[];
                };
              };
            };
          }
        ).cawcoArtifact.doc
          .getArray("elements")
          .toArray()
          .filter(
            (entry) =>
              (entry.get("el") as { isDeleted?: boolean } | undefined)
                ?.isDeleted !== true
          ).length
    );
  /** The page's last word on its link, and its state alone. */
  const lastSaid = (said: string[]) =>
    said.filter((one) => one.startsWith("sync ")).at(-1);
  const lastLink = (said: string[]) => lastSaid(said)?.split(":")[0];
  const stroke = async (fx: number) => {
    await frame.click('.rail-box[aria-label^="Pen"]');
    const at = (await box(page, FRAME)) as Box;
    await pen(
      [at.left + at.width * fx, at.top + at.height * 0.4],
      [at.left + at.width * (fx + 0.15), at.top + at.height * 0.6]
    );
    await settle(page, 400);
    return counted();
  };
  const unlinked = async () => {
    await until(
      "the page's 1300 ms read",
      () => frame.evaluate(() => window.kitUnlinked?.samples[1300]),
      (read) => read !== undefined,
      10_000
    ).catch(() => undefined);
    return frame.evaluate(() => window.kitUnlinked);
  };
  /** Send with the canvas standing: the line it says under the field, or the row it became. */
  const send = async (words: string) => {
    const rows = await page.locator(".turn.you").count();
    await page.fill(FIELD, words);
    await page.focus(FIELD);
    await page.keyboard.press("Enter");
    // The last refusal leaves first (Send clears it; it folds away): the answer is this Send's.
    await until(
      "the last refusal gone",
      () => page.locator(".send-error").count(),
      (count) => count === 0,
      5000
    ).catch(() => undefined);
    const said = await until(
      "Send's answer",
      () =>
        page.evaluate(
          () => document.querySelector(".send-error")?.textContent?.trim() ?? ""
        ),
      Boolean,
      20_000
    ).catch(() => "");
    return { said, sent: (await page.locator(".turn.you").count()) - rows };
  };
  const linked = () => page.evaluate(() => window.kitLinks ?? []);

  // (a) Held from the start: the upgrade is never answered.
  const seen = await unlinked();
  const where = await frame.evaluate(() => location.href);
  const line = await frame.evaluate(
    () => document.querySelector(".canvas-unlinked-line")?.textContent ?? ""
  );
  const refusedStroke = await stroke(0.2);
  const grace = await ms(page, "--dur-wait-grace");
  // The recorder (b) reads on the good link hears this line's fade here.
  const heard = await page.evaluate(() => window.kitRefusalRuns ?? []);
  kit.check(
    "14 (a): refused from the start, the refusal line isn't drawn 300 ms after the page's host mounts and stands at 1.3 s, drawn no sooner than --dur-wait-grace",
    !!seen &&
      (seen.samples[300] ?? 0) === 0 &&
      (seen.samples[1300] ?? 0) > 0 &&
      seen.shown !== null &&
      seen.shown >= grace - 1 &&
      heard.some((run) => run.startsWith("canvas-refusal-in")) &&
      line.startsWith(
        "The canvas isn't connected to the hub, so what you draw wouldn't reach the agent."
      ),
    `--dur-wait-grace ${grace} ms; ${JSON.stringify(seen)}; heard ${heard.join(", ")}; "${line}"; ${where}`
  );
  kit.check(
    "14 (a): refused, a pen stroke adds 0 elements to the page's doc",
    refusedStroke === 0,
    `${refusedStroke}; the page said ${(await linked()).join(", ")}`
  );
  const refusedSend = await send("The refused canvas");
  kit.check(
    "14 (a): refused, Send sends nothing and says the canvas isn't connected",
    refusedSend.sent === 0 && refusedSend.said === NOT_CONNECTED,
    JSON.stringify(refusedSend)
  );

  // Still held: two attempts that never opened, closed at 10 s each, say the link is lost.
  const heldLink = await until(
    "the held link said lost",
    linked,
    (said) => lastLink(said) === "sync lost",
    Math.max(0, 25_000 - (performance.now() - opened))
  ).catch(linked);
  const lostAfter = performance.now() - opened;
  const heldSend = await send("The held canvas");
  kit.check(
    "14: an upgrade never answered, the page says its link is lost within 25 s of opening (\"didn't open\"), and Send says the canvas isn't connected",
    lastLink(heldLink) === "sync lost" &&
      (lastSaid(heldLink) ?? "").endsWith("didn't open") &&
      lostAfter <= 25_000 &&
      heldSend.sent === 0 &&
      heldSend.said === NOT_CONNECTED,
    `lost after ${Math.round(lostAfter)} ms; the page said ${heldLink.join(", ")}; ${JSON.stringify(heldSend)}`
  );

  // Opened: the page syncs, has raised no error, and the pen draws.
  await frame.evaluate(() =>
    window.postMessage(
      { type: "cawco:probe-sync", mode: "open" },
      location.origin
    )
  );
  const up = await until(
    "the page's doc synced",
    linked,
    (said) => lastLink(said) === "sync synced",
    20_000
  ).catch(linked);
  await until(
    "the refusal line gone",
    () => frame.evaluate(() => !document.querySelector(".canvas-unlinked")),
    Boolean,
    5000
  ).catch(() => undefined);
  const drawn = await stroke(0.2);
  const pageErrors =
    (await frame.evaluate(() => window.kitUnlinked?.errors)) ?? [];
  kit.check(
    "14: refused then synced, the page raised no error and a pen stroke adds an element",
    lastLink(up) === "sync synced" &&
      drawn === 1 &&
      pageErrors.length === 0 &&
      errors.length === 0,
    `the page said ${up.join(", ")}; the doc holds ${drawn}; page errors ${JSON.stringify([...pageErrors, ...errors])}`
  );

  // (c) Cut after that stroke, once the hub holds it.
  const hubDrawn = () =>
    fleet
      .api<{ file: { elements: { isDeleted?: boolean }[] } }>(
        `/api/artifacts/${id}/export`
      )
      .then((out) => out.file.elements.filter((el) => !el.isDeleted).length);
  const held = await until(
    "the hub holds the stroke",
    hubDrawn,
    (n) => n === drawn,
    10_000
  ).catch(hubDrawn);
  await frame.evaluate(() =>
    window.postMessage(
      { type: "cawco:probe-sync", mode: "cut" },
      location.origin
    )
  );
  const lost = await until(
    "the link lost",
    linked,
    (said) => lastLink(said) === "sync lost",
    5000
  ).catch(linked);
  const second = await stroke(0.5);
  const cutSend = await send("The cut canvas");
  const hubAfter = await hubDrawn();
  kit.check(
    "14 (c): cut after a stroke, Send sends nothing and says the drawing hasn't reached the hub",
    held === drawn &&
      lastLink(lost) === "sync lost" &&
      second === drawn + 1 &&
      hubAfter === drawn &&
      cutSend.sent === 0 &&
      cutSend.said === NOT_REACHED,
    `hub held ${held} before the cut, ${hubAfter} after; the page's doc ${second}; the page said ${lost.join(", ")}; ${JSON.stringify(cutSend)}`
  );
  await page.close();
};

/** 3. ⌘⇧D folds the standing canvas, and again opens it. */
const keyCheck = async (on: On) => {
  const { kit, page } = on;
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
  const folded = await page.evaluate(
    ([stage, chip]) => ({
      stage: !!document.querySelector(stage as string),
      chip: !!document.querySelector(chip as string),
    }),
    [STAGE, CHIP]
  );
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
  const opened = await page.evaluate(
    ([stage, chip]) => ({
      stage: !!document.querySelector(stage as string),
      chip: !!document.querySelector(chip as string),
    }),
    [STAGE, CHIP]
  );
  const keys = await page.getAttribute(PILL, "aria-keyshortcuts");
  kit.check(
    "3: ⌘⇧D folds the standing canvas to its chip and opens it again; the pill names the keys",
    !folded.stage &&
      folded.chip &&
      opened.stage &&
      !opened.chip &&
      !!keys?.includes("Shift+D"),
    `folded ${JSON.stringify(folded)}; opened ${JSON.stringify(opened)}; ${keys}`
  );
};

/** 5. Dock and Undock: the same iframe flies between the field and the panel's well. */
const dockCheck = async (on: On, clock: Clock) => {
  const { kit, page } = on;
  const panel = await ms(page, "--dur-panel");
  const control = await ms(page, "--dur-control");
  await page.evaluate((sel) => {
    (window as unknown as { __canvas: Element | null }).__canvas =
      document.querySelector(sel);
  }, FRAME);
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("the canvas's iframe has no document");
  }
  await clock.catchRuns(
    () => frame.click('.rail-box[aria-label="Dock"]'),
    MOTION,
    8000
  );
  // The room's fold and the flight start together; the flight once the panel stands.
  const docking = await until(
    "the flight and the room",
    () => runsOn(page),
    (runs) =>
      runs.some((one) => one.id === "canvas-flight") &&
      runs.some((one) => one.id === "canvas-room"),
    8000
  ).catch(() => runsOn(page));
  await clock.seek(1);
  await seekCanvas(page, 1);
  // Where the flight lands, while the split is still held at its start.
  const landed = await box(page, FRAME);
  await clock.release();
  await settle(page, 300);
  // Where the canvas stands once the split has opened.
  const docked = await page.evaluate(
    ([sel]) => {
      const node = document.querySelector(sel as string);
      const well = document
        .querySelector(".preview-pane .side-well")
        ?.getBoundingClientRect();
      const at = node?.getBoundingClientRect();
      return {
        same:
          node === (window as unknown as { __canvas: Element | null }).__canvas,
        frame: at ? [at.left, at.top, at.width, at.height] : null,
        well: well
          ? [well.left + 1, well.top + 1, well.width - 2, well.height - 2]
          : null,
      };
    },
    [FRAME]
  );
  await railCheck(on, "docked");
  const flight = docking.find((one) => one.id === "canvas-flight");
  const room = docking.find((one) => one.id === "canvas-room");
  const landedAt = landed
    ? [landed.left, landed.top, landed.width, landed.height]
    : null;
  kit.check(
    "5: Dock moves the same iframe into the side panel's well; the flight lands on the well's open box",
    docked.same &&
      !!docked.frame &&
      !!docked.well &&
      docked.frame.every((v, i) => near(v, docked.well?.[i] ?? 0, 1.5)) &&
      !!landedAt &&
      landedAt.every((v, i) => near(v, docked.frame?.[i] ?? 0, 1.5)),
    `${JSON.stringify(docked)}; landed ${JSON.stringify(landedAt)}`
  );
  kit.check(
    "5: one transform flight of --dur-panel (280 ms) on the drawer curve; the field's room returns over --dur-control (120 ms) on ease-out",
    docking.filter((one) => one.id === "canvas-flight").length === 1 &&
      flight?.duration === panel &&
      flight.easing === DRAWER &&
      flight.props.join() === "transformOrigin,transform" &&
      room?.duration === control &&
      room.easing === EASE_OUT,
    `${panel}/${control}; ${JSON.stringify(docking)}`
  );

  // Undock from the panel's head.
  await clock.catchRuns(
    () => page.click('.preview-pane button[aria-label="Undock"]'),
    MOTION,
    8000
  );
  const undocking = await until(
    "the flight back",
    () => runsOn(page),
    (runs) => runs.some((one) => one.id === "canvas-flight"),
    8000
  ).catch(() => runsOn(page));
  await clock.release();
  await settle(page, 300);
  const back = await page.evaluate(
    ([sel, slot]) => {
      const node = document.querySelector(sel as string);
      const at = node?.getBoundingClientRect();
      const place = document
        .querySelector(slot as string)
        ?.getBoundingClientRect();
      return {
        same:
          node === (window as unknown as { __canvas: Element | null }).__canvas,
        frame: at ? [at.left, at.top, at.width, at.height] : null,
        slot: place ? [place.left, place.top, place.width, place.height] : null,
        panel: !!document.querySelector(".preview-pane"),
      };
    },
    [FRAME, SLOT]
  );
  const flightBack = undocking.find((one) => one.id === "canvas-flight");
  kit.check(
    "5: Undock flies the same iframe back over the field on the same flight, and the panel closes",
    back.same &&
      !!back.frame &&
      !!back.slot &&
      back.frame.every((v, i) => near(v, back.slot?.[i] ?? 0, 1.5)) &&
      flightBack?.duration === panel &&
      flightBack.easing === DRAWER &&
      !back.panel,
    `${JSON.stringify(back)}; ${JSON.stringify(flightBack)}`
  );
};

/** 6. Done leaves a chip whose thumbnail is the export's picture; a tap on it opens the canvas. */
const chipCheck = async (on: On): Promise<string | null> => {
  const { kit, page, fleet } = on;
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  await frame?.click('.rail-box[aria-label="Done"]');
  const thumb = await until(
    "the chip's thumbnail",
    () =>
      page.evaluate(
        (chip) =>
          document.querySelector(`${chip} img`)?.getAttribute("src") ?? null,
        CHIP
      ),
    Boolean,
    15_000
  ).catch(() => null);
  const id = await page.getAttribute(CHIP, "data-artifact");
  if (!id) {
    kit.check("6: Done leaves a chip", false, on.said.slice(-4).join(" | "));
    return null;
  }
  const exported = await fleet.api<{ png: string | null }>(
    `/api/artifacts/${id}/export`
  );
  const name = (await page.textContent(`${CHIP} .att-name`))?.trim();
  kit.check(
    "6: Done leaves a chip named Canvas whose thumbnail is the export's PNG bytes",
    !!exported.png &&
      thumb === `data:image/png;base64,${exported.png}` &&
      name === "Canvas" &&
      !(await page.$(STAGE)),
    `${name}; thumbnail ${thumb ? `${thumb.length} chars` : "none"}; export ${exported.png ? `${exported.png.length} chars` : "none"}; same ${thumb === `data:image/png;base64,${exported.png}`}`
  );
  await page.click(`${CHIP} .canvas-open`);
  await settle(page, 300);
  const reopened = await page.evaluate(
    ([stage, chip]) =>
      !!document.querySelector(stage as string) &&
      !document.querySelector(chip as string),
    [STAGE, CHIP]
  );
  kit.check("6: a tap on the chip opens the canvas again", reopened);
  return id;
};

/** 7. Send carries the file, the outline and the picture; the canvas is no longer a draft. */
const sendCheck = async (on: On, id: string) => {
  const { kit, page, fleet, session } = on;
  const read = () =>
    fleet.api<Read>(`/api/instances/${session}/artifacts/${id}`);
  const before = await read();
  const rows = await page.locator(".turn.you").count();
  await page.focus(FIELD);
  await page.keyboard.type("The canvas");
  await page.keyboard.press("Enter");
  const row = page.locator(".turn.you").nth(rows);
  await row.locator(".chips").waitFor({ timeout: 20_000 });
  await settle(page, 300);
  const carried = await row.evaluate((node) => ({
    names: [...node.querySelectorAll(".chips .doc .name")].map(
      (name) => name.textContent
    ),
    images: node.querySelectorAll(".chips img").length,
  }));
  const after = await until(
    "the draft mark cleared",
    read,
    (r) => r.draft === false,
    10_000
  ).catch(read);
  kit.check(
    "7: Send with two strokes carries canvas.excalidraw and canvas.md as attachments and one PNG image (the transcript row)",
    carried.names.includes("canvas.excalidraw") &&
      carried.names.includes("canvas.md") &&
      carried.images === 1 &&
      (before.outline?.match(/^ink /gm)?.length ?? 0) === 2,
    `${JSON.stringify(carried)}; outline before:\n${before.outline}`
  );
  kit.check(
    "7: the canvas was a draft before the send and is not after it",
    before.draft === true && after.draft === false,
    `before ${before.draft}, after ${after.draft}`
  );
  const gone = await page.evaluate(
    ([stage, chip]) =>
      !(
        document.querySelector(stage as string) ||
        document.querySelector(chip as string)
      ),
    [STAGE, CHIP]
  );
  kit.check("7: the sent canvas leaves the composer", gone);
};

/** 8. Reduced motion: opening and Done fade, nothing travels or clips. */
const reducedCheck = async (on: On, clock: Clock) => {
  const { kit, page } = on;
  await page.emulateMedia({ reducedMotion: "reduce" });
  // ⌘⇧D makes a new canvas, its page loading inside the catch.
  await page.focus(FIELD);
  await clock.catchRuns(
    () => page.keyboard.press("Control+Shift+KeyD"),
    MOTION,
    8000
  );
  const opening = await runsOn(page);
  await clock.release();
  await settle(page, 300);
  await page.focus(FIELD);
  await clock.catchRuns(() => page.keyboard.press("Escape"), MOTION, 8000);
  const folding = await runsOn(page);
  await clock.release();
  await settle(page, 300);
  const fade = await ms(page, "--dur-fade");
  const only = (runs: Awaited<ReturnType<typeof runsOn>>) =>
    runs.length > 0 &&
    runs.every(
      (one) => one.props.join() === "opacity" && one.duration === fade
    );
  kit.check(
    "8: with reduced motion the canvas opens and folds by opacity alone, over --dur-fade",
    only(opening) && only(folding),
    `open ${JSON.stringify(opening)}; Done ${JSON.stringify(folding)}`
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
};

/**
 * The rail's two groups in a touch page's canvas, as its page draws them:
 * each group's box, the page's size, and the tokens and insets they stand by.
 */
const touchRail = (frame: Frame) =>
  frame.evaluate(() => {
    const rect = (sel: string) => {
      const at = document.querySelector(sel)?.getBoundingClientRect();
      return at
        ? {
            left: at.left,
            top: at.top,
            right: at.right,
            bottom: at.bottom,
            width: at.width,
            height: at.height,
          }
        : null;
    };
    const root = getComputedStyle(document.documentElement);
    const px = (name: string) => Number.parseFloat(root.getPropertyValue(name));
    const rows = new Set(
      [
        ...document.querySelectorAll(
          ".rail-tools > .rail-box, .rail-tools .rail-menu-holder"
        ),
      ].map((one) => Math.round(one.getBoundingClientRect().top))
    ).size;
    return {
      tools: rect(".rail-tools"),
      view: rect(".rail-view"),
      toolRows: rows,
      box:
        document.querySelector(".rail-box")?.getBoundingClientRect().width ?? 0,
      page: { width: innerWidth, height: innerHeight },
      docked:
        document.querySelector(".canvas-host")?.hasAttribute("data-docked") ??
        false,
      insetTop: px("--canvas-inset-top"),
      insetSide: px("--canvas-inset-side"),
      space2: px("--space-2"),
      space3: px("--space-3"),
    };
  });

/**
 * The rail fits its page, by touch: both groups inside the page, their
 * boxes 44px, the tools' --space-3 in from the left and the view's from the
 * right (inside the shoulders over the field), apart. Over the field (a
 * phone) the groups stand at the foot, the tools' --space-3 above it and the
 * view's above them; docked, at the top, the tools' --space-2 down and the
 * view's beside them or under them.
 */
const railFits = (
  kit: Kit,
  label: string,
  rail: Awaited<ReturnType<typeof touchRail>>,
  at: { docked: boolean; foot: boolean }
) => {
  const { foot } = at;
  const { tools, view, page } = rail;
  const side = rail.insetSide + rail.space3;
  // Inside the page, and no nearer its sides than the inset and --space-3.
  const inside = (group: typeof tools) =>
    !!group &&
    group.left >= side - 0.5 &&
    group.top >= -0.5 &&
    group.right <= page.width - side + 0.5 &&
    group.bottom <= page.height + 0.5;
  const apart =
    !!(tools && view) &&
    (view.left >= tools.right ||
      view.right <= tools.left ||
      view.top >= tools.bottom ||
      view.bottom <= tools.top);
  let placed = false;
  if (tools && view) {
    placed = foot
      ? near(page.height - tools.bottom, rail.space3, 0.5) &&
        near(view.bottom, tools.top - rail.space2, 0.5)
      : near(tools.top, rail.insetTop + rail.space2, 0.5) &&
        (near(view.top, tools.top, 0.5) ||
          near(view.top, tools.bottom + rail.space2, 0.5));
  }
  kit.check(
    `16 (${label}): the rail fits the page: both groups inside it, 44px boxes, ${side.toFixed(1)}px in from its sides, ${foot ? "at the foot" : `${(rail.insetTop + rail.space2).toFixed(0)}px from the top`}, apart`,
    inside(tools) &&
      inside(view) &&
      rail.box === 44 &&
      rail.docked === at.docked &&
      !!tools &&
      !!view &&
      near(tools.left, side, 0.5) &&
      near(page.width - view.right, side, 0.5) &&
      apart &&
      placed,
    JSON.stringify(rail)
  );
};

/**
 * 10. By touch (§5.10: "A phone has no swipe: Attach → Draw, the morph to
 * the window's height, Dock to the drawer"): Attach's menu opens the canvas
 * over the field, and the rail's Dock sends the same iframe into the panel's
 * well (the drawer's on a phone). 16: at each, the rail fits the page.
 */
const phoneCheck = async (on: On, view: "phone" | "tablet", width?: number) => {
  const { kit } = on;
  const label = width ? `${view} ${width}px` : view;
  // The session's panel shows what an earlier run docked: closed, so its
  // drawer stands over nothing this run presses.
  await fetch(
    `${on.fleet.base}/api/instances/${encodeURIComponent(on.session)}/preview`,
    { method: "DELETE" }
  );
  const page = await kit.page(view);
  if (width) {
    await page.setViewportSize({ width, height: VIEWS[view].height });
  }
  await open(page, `${on.base}/session/${on.session}`, FIELD);
  await settle(page);
  /** This page's own canvas, once Draw has made it (the panel may show another the session docked). */
  let mine = ".canvas-stage.standing iframe";
  /** A tap on `selector`'s centre: Playwright's box of an element in a frame is already in the page's terms. */
  const tap = async (selector: string, within = page.mainFrame()) => {
    const at = await within.locator(selector).first().boundingBox();
    if (!at) {
      throw new Error(`nothing to tap at ${selector}`);
    }
    await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2);
  };
  await tap(".att-btn");
  await page.getByRole("menuitem", { name: "Draw" }).waitFor();
  await tap('[role="menuitem"]:has-text("Draw")');
  const standing = await until(
    "the canvas over the field",
    () => box(page, ".canvas-stage.standing"),
    (at) => !!at && at.height > 300,
    20_000
  ).catch(() => null);
  const id = await page.getAttribute(".canvas-stage.standing", "data-artifact");
  mine = `.canvas-stage[data-artifact="${id}"] iframe`;
  const room = await column(page);
  await page.evaluate((sel) => {
    (window as unknown as { __canvas: Element | null }).__canvas =
      document.querySelector(sel);
  }, mine);
  const frame = await (
    await page.locator(mine).elementHandle()
  )?.contentFrame();
  await frame?.waitForSelector(".canvas-host .excalidraw", { timeout: 60_000 });
  await settle(page, 300);
  kit.check(
    `10 (${label}): Attach → Draw opens the canvas over the field, the column's height less the field`,
    !!(standing && room) &&
      near(standing.bottom, room.foot, 2) &&
      near(standing.top, room.foot - room.max, 2),
    `stage ${JSON.stringify(standing)}; column ${JSON.stringify(room)}`
  );
  // Over the field the host's inset reaches the page with the grab band.
  const over = frame
    ? await until(
        "the page's rail under the composer's inset",
        () => touchRail(frame),
        (rail) => rail.insetTop > 0,
        5000
      ).catch(() => touchRail(frame))
    : null;
  if (over) {
    // The phone's foot layout over the field; wider, the top.
    railFits(kit, `${label}, over the field`, over, {
      docked: false,
      foot: over.page.width < 640,
    });
  }
  if (frame) {
    await tap('.rail-box[aria-label="Dock"]', frame);
  }
  const docked = await until(
    "the canvas in the panel's well",
    () =>
      page.evaluate((sel) => {
        const node = document.querySelector(sel);
        const well = document
          .querySelector(".side-well")
          ?.getBoundingClientRect();
        const at = node?.getBoundingClientRect();
        return well && at && at.width > 0
          ? {
              same:
                node ===
                (window as unknown as { __canvas: Element | null }).__canvas,
              frame: [at.left, at.top, at.width, at.height],
              well: [
                well.left + 1,
                well.top + 1,
                well.width - 2,
                well.height - 2,
              ],
            }
          : null;
      }, mine),
    (seen) =>
      !!seen && seen.frame.every((v, i) => near(v, seen.well[i] ?? 0, 1.5)),
    20_000
  ).catch(() => null);
  kit.check(
    `10 (${label}): the rail's Dock sends the same iframe into the panel's well`,
    !!docked?.same,
    `${JSON.stringify(docked)}; said under the field: ${await page.evaluate(
      () => document.querySelector(".send-error")?.textContent ?? "nothing"
    )}`
  );
  if (frame) {
    const inPanel = await until(
      "the page's rail docked",
      () => touchRail(frame),
      (rail) => rail.docked && rail.insetTop === 0,
      5000
    ).catch(() => touchRail(frame));
    railFits(kit, `${label}, docked ${inPanel.page.width}px wide`, inPanel, {
      docked: true,
      foot: false,
    });
  }
  await page.close();
};

const spec: Spec = { name: "composer-canvas", run: probe };
export default spec;
