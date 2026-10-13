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
 * (9: `canvas` and `artifacts` are their own specs, run beside this one.)
 */
import type { CDPSession, Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { Clock } from "../anim";
import { type Box, box } from "../geom";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const PILL = "form.cin";
const FIELD = "form.cin textarea";
const STAGE = ".canvas-stage:not([hidden])";
const FRAME = ".canvas-stage iframe";
const SLOT = ".composer > .canvas-slot";
const CHIP = ".canvas-chip";
/** The composer's own dock (the pane draws a `.dock` of its own around it). */
const DOCK = ".dock[data-keeps-draft]";
/** What the canvas's motion runs on: its stage and the composer's dock. */
const MOTION = `.canvas-stage, ${DOCK}`;
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
  const page = await kit.page("desk");
  const said: string[] = [];
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    // The canvas page carries its own Yjs beside the overlay's (slice 3a:
    // "the page's Yjs is its own copy"), and Yjs says so once per load.
    if (
      message.type() === "error" &&
      !message.text().startsWith("Yjs was already imported")
    ) {
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
 * The canvas's own runs, held still by the clock's rate of 0 (anim.ts), put
 * at `fraction` of their length: they may start after the clock caught its
 * first runs (Dock's flight waits on the panel), so they are found by id.
 */
const seekCanvas = async (page: Page, fraction: number) => {
  await page.evaluate((f) => {
    for (const run of document.getAnimations()) {
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
    document
      .getAnimations()
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
  const cdp = await on.page.context().newCDPSession(on.page);
  const pen = penOf(cdp);
  await openCheck(on, clock, pen);
  await strokes(on, pen);
  await resizeCheck(on, clock);
  await keyCheck(on);
  await dockCheck(on, clock);
  const id = await chipCheck(on);
  if (id) {
    await sendCheck(on, id);
  }
  await reducedCheck(on, clock);
  await phoneCheck(on);
  kit.check(
    "the page said no error",
    on.said.length === 0,
    on.said.slice(0, 6).join(" | ") || "none"
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
  // The first swipe makes the canvas and loads its page, on a running clock:
  // Chromium stops drawing frames while a same-origin frame first loads
  // under the Animation domain's playback rate of 0 (main thread idle, no
  // frame for 20 min; the same open with the clock running lands at once).
  await pen([x, y], [x, y - 60], 6);
  const made = await until(
    "the canvas over the field",
    () => box(page, STAGE),
    (at) => !!at && at.height > 300,
    20_000
  ).catch(() => null);
  await settle(page);
  const firstRoom = await column(page);
  const first = await box(page, FRAME);
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
  kit.check(
    "1: a pen's swipe up on the pill makes the canvas and stands it over the field",
    !!(made && first && firstRoom) &&
      near(first.bottom, firstRoom.foot) &&
      near(first.top, firstRoom.foot - firstRoom.max),
    `frame ${JSON.stringify(first)}; column ${JSON.stringify(firstRoom)}`
  );
  // Folded to its chip, the next swipe grows it again: the motion, caught.
  const caught = await clock.catchRuns(
    () => pen([x, y], [x, y - 60], 6),
    MOTION,
    8000
  );
  const runs = await runsOn(page);
  const growth = runs.filter((one) => one.id === "canvas-grow");
  const started = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((run) => run.id === "canvas-grow")
      .map((run) => Number(run.startTime))
  );
  await clock.seek(1);
  await seekCanvas(page, 1);
  const frame = await box(page, FRAME);
  const room = await column(page);
  await clock.release();
  await settle(page);
  kit.check(
    "1: a pen's swipe up on the pill starts the grown shape's growth on --dur-grow: the shape and the canvas in it, together",
    growth.length === 2 &&
      growth.every((one) => one.duration === grow) &&
      started.length === 2 &&
      near(started[0], started[1], 0.5) &&
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
  // A new canvas's page loads on a running clock (as in check 1), then folds.
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await until(
    "the new canvas over the field",
    () => box(page, STAGE),
    (at) => !!at && at.height > 300,
    20_000
  );
  await settle(page, 300);
  await page.focus(FIELD);
  await page.keyboard.press("Control+Shift+KeyD");
  await settle(page, 300);
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
 * 10. A phone, by touch (§5.10: "A phone has no swipe: Attach → Draw, the
 * morph to the window's height, Dock to the drawer"): Attach's menu opens
 * the canvas over the field, and the rail's Dock sends the same iframe into
 * the drawer's well.
 */
const phoneCheck = async (on: On) => {
  const { kit } = on;
  const page = await kit.page("phone");
  await open(page, `${on.base}/session/${on.session}`, FIELD);
  await settle(page);
  const tap = async (selector: string, within = page.mainFrame()) => {
    const at = await within.locator(selector).first().boundingBox();
    const outer =
      within === page.mainFrame()
        ? { x: 0, y: 0 }
        : ((await page.locator(FRAME).boundingBox()) ?? { x: 0, y: 0 });
    if (!at) {
      throw new Error(`nothing to tap at ${selector}`);
    }
    await page.touchscreen.tap(
      outer.x + at.x + at.width / 2,
      outer.y + at.y + at.height / 2
    );
  };
  await tap(".att-btn");
  await page.getByRole("menuitem", { name: "Draw" }).waitFor();
  await tap('[role="menuitem"]:has-text("Draw")');
  const standing = await until(
    "the canvas over the field",
    () => box(page, STAGE),
    (at) => !!at && at.height > 300,
    20_000
  ).catch(() => null);
  const room = await column(page);
  await page.evaluate((sel) => {
    (window as unknown as { __canvas: Element | null }).__canvas =
      document.querySelector(sel);
  }, FRAME);
  const frame = await (
    await page.locator(FRAME).elementHandle()
  )?.contentFrame();
  await frame?.waitForSelector(".canvas-host .excalidraw", { timeout: 60_000 });
  await settle(page, 300);
  kit.check(
    "10 (phone): Attach → Draw opens the canvas over the field, the column's height less the field",
    !!(standing && room) &&
      near(standing.bottom, room.foot, 2) &&
      near(standing.top, room.foot - room.max, 2),
    `stage ${JSON.stringify(standing)}; column ${JSON.stringify(room)}`
  );
  if (frame) {
    await tap('.rail-box[aria-label="Dock"]', frame);
  }
  const docked = await until(
    "the canvas in the drawer",
    () =>
      page.evaluate((sel) => {
        const node = document.querySelector(sel);
        const well = document
          .querySelector(".preview-sheet .side-well")
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
      }, FRAME),
    (seen) =>
      !!seen && seen.frame.every((v, i) => near(v, seen.well[i] ?? 0, 1.5)),
    20_000
  ).catch(() => null);
  kit.check(
    "10 (phone): the rail's Dock sends the same iframe into the drawer's well",
    !!docked?.same,
    JSON.stringify(docked)
  );
  await page.close();
};

const spec: Spec = { name: "composer-canvas", run: probe };
export default spec;
