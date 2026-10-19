/**
 * A folder tab's `--pick` under a swipe (TabItem, TabsList `data-ride`): while
 * a finger carries the strip's indicator, the session tabs' sheets follow the
 * finger, so their `--pick` transition is off; at rest a choice carries
 * `--pick` over its own length and curve. On a scratch fleet (real hub,
 * agent and sessiond), the built dashboard at 390×844 (touch), two sessions
 * open as tabs, a real touch drag (CDP `Input.dispatchTouchEvent`) held
 * mid-swipe. Read from the computed style of the strip's tabs.
 *
 * TabItem's `[data-ride] &` sits nested in `[data-variant="folder"] .ff-tab`,
 * and the build keeps the nesting, so it reads as `[data-ride] :is(…)`:
 * each ancestor is matched on its own, and the list's `data-ride`, inside
 * the folder root, matches. A tool that lowers the nesting by joining the
 * selectors (`[data-ride] [data-variant="folder"] .ff-tab`) would lose it;
 * this spec is what says so.
 *
 * At the desk (1440×900), a plain switch (the tab's click, no pointer over the
 * strip): the elements each frame of the choice restyled, off a DevTools
 * trace; then the choice back with its `--pick` transitions paused and seeked
 * (the Animation domain) to 0, 0.25, 0.5, 0.75 and 1, each tab's `--pick`, its
 * three readers' (`.fold .sheet`, `.fold .rim`, `.strong`) and what each draws
 * from it, and `--hang-rim`. `--pick` reaches only the path to its readers
 * (TabItem), so the readers must read their tab's value at every fraction,
 * and the choice's transitions must share one clock.
 */
import type { CDPSession, Page } from "playwright-core";
import type { Reply } from "../../scratch-fleet";
import { traceMain } from "../frames";
import { COMPOSER, type Kit, open, type Spec, settle } from "../kit";

const TAB = '[data-variant="folder"] [data-slot="ff-tab"]';
const STACK = '[data-slot="stack"].swipe';

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** Each folder tab's transition, and whether the list says it rides. */
const read = (page: Page) =>
  page.evaluate(
    ([tab]) => {
      const tabs = [...document.querySelectorAll<HTMLElement>(tab)];
      return {
        ride: tabs.some((one) => one.closest("[data-ride]") !== null),
        transitions: tabs.map((one) => {
          const s = getComputedStyle(one);
          return `${s.transitionProperty} / ${s.transitionDuration}`;
        }),
      };
    },
    [TAB]
  );

const picks = (transitions: string[]) =>
  transitions.filter((one) => one.split(" / ")[0].includes("--pick")).length;

const touch = (
  cdp: CDPSession,
  type: "touchStart" | "touchMove",
  x: number,
  y: number
) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y }] });

const probe = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const first = await fleet.spawn("claude", "Ride one", fleet.repo);
  const second = await fleet.spawn("claude", "Ride two", fleet.repo);
  const base = await fleet.dashboard();
  const page = await kit.page("phone");
  await open(page, `${base}/session/${first}`, COMPOSER);
  await open(page, `${base}/session/${second}`, COMPOSER);
  await page.waitForFunction(
    (tab) => document.querySelectorAll(tab).length >= 2,
    TAB,
    { timeout: 30_000 }
  );
  await settle(page, 600);

  const rest = await read(page);
  kit.check(
    "at rest the list does not ride and every folder tab carries --pick",
    !rest.ride && picks(rest.transitions) === rest.transitions.length,
    rest.transitions.join("; ")
  );

  const box = await page.locator(STACK).boundingBox();
  if (!box) {
    kit.check("the swipeable pane has a box", false, "");
    return;
  }
  const y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  // Toward the first session, the tab before: a drag to the right.
  const from = box.x + box.width * 0.2;
  await touch(cdp, "touchStart", from, y);
  for (let step = 1; step <= 10; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a drag's points, in order
    await touch(cdp, "touchMove", from + step * 14, y);
  }
  await page.waitForTimeout(100);
  const riding = await read(page);
  kit.check(
    "mid-swipe the list rides and no folder tab carries --pick",
    riding.ride && picks(riding.transitions) === 0,
    `ride=${riding.ride}; ${riding.transitions.join("; ")}`
  );
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await settle(page, 800);

  const after = await read(page);
  kit.check(
    "after the swipe lands every folder tab carries --pick again",
    !after.ride && picks(after.transitions) === after.transitions.length,
    after.transitions.join("; ")
  );
  await page.close();

  // At the desk, a plain switch (the tab's click, no pointer over the strip).
  const desk = await kit.page("desk");
  await open(desk, `${base}/session/${first}`, COMPOSER);
  await open(desk, `${base}/session/${second}`, COMPOSER);
  await desk.waitForFunction(
    (tab) => document.querySelectorAll(tab).length >= 2,
    TAB,
    { timeout: 30_000 }
  );
  await settle(desk, 600);
  const choose = (id: string) =>
    desk
      .locator(`[data-session-tab="${id}"]`)
      .filter({ visible: true })
      .first()
      .evaluate((el) => (el as HTMLElement).click());

  // Every frame the choice runs: what the page restyled in each.
  const traced = await traceMain(
    desk,
    async () => {
      await desk.evaluate(() => performance.mark("folder-ride:choose"));
      await choose(first);
      await desk.waitForTimeout(800);
    },
    { restyles: true }
  );
  const chose = traced.marks.find((m) => m.name === "folder-ride:choose")?.at;
  const frames = traced.tasks
    .filter((t) => chose !== undefined && t.at >= chose && t.restyled > 0)
    .map((t) => t.restyled);
  const held = await desk.evaluate(
    (tab) =>
      [...document.querySelectorAll(tab)].map(
        (one) => one.querySelectorAll("*").length
      ),
    TAB
  );
  kit.note(
    `desk: elements under each folder tab ${held.join(", ")}; restyled by each task from the choice on: ${frames.join(", ")}`
  );
  await settle(desk, 400);

  // The choice back, its `--pick` held still and set at each fraction.
  const anim = await desk.context().newCDPSession(desk);
  const started: { id: string; name: string; duration: number }[] = [];
  anim.on("Animation.animationStarted", ({ animation }) => {
    started.push({
      id: animation.id,
      name: animation.name,
      duration: animation.source?.duration ?? 0,
    });
  });
  await anim.send("Animation.enable");
  await choose(second);
  await desk.waitForTimeout(30);
  const pickIds = started.filter((a) => a.name === "--pick");
  await anim.send("Animation.setPaused", {
    animations: pickIds.map((a) => a.id),
    paused: true,
  });
  const clock = await desk.evaluate((tab) => {
    const describe = (el: Element) =>
      `${el.tagName}.${[...el.classList].filter((c) => !c.startsWith("svelte-")).join(".")}`;
    return [...document.querySelectorAll(tab)].flatMap((one) =>
      [one, ...one.querySelectorAll("*")].flatMap((el) =>
        el.getAnimations().map((a) => {
          const t = a.effect?.getTiming();
          return {
            property:
              a instanceof CSSTransition
                ? a.transitionProperty
                : a.constructor.name,
            on: describe(el),
            start: a.startTime,
            duration: t?.duration,
            easing: t?.easing,
          };
        })
      )
    );
  }, TAB);
  const pickClock = clock.filter((one) => one.property === "--pick");
  const [lead] = pickClock;
  kit.check(
    "desk: a choice runs --pick on one clock (every --pick transition under the tabs starts together, at one length and curve)",
    pickClock.length >= 2 &&
      pickClock.every(
        (one) =>
          one.start === lead?.start &&
          one.duration === lead?.duration &&
          one.easing === lead?.easing
      ),
    clock
      .map(
        (one) =>
          `${one.property} on ${one.on}: start ${one.start}, ${one.duration}ms, ${one.easing}`
      )
      .join("; ")
  );
  const duration = pickIds[0]?.duration ?? 0;
  /** Every reader whose `--pick` is not its tab's, at a fraction. */
  const apart: string[] = [];
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, each read where the last left the clock
    await anim.send("Animation.seekAnimations", {
      animations: pickIds.map((a) => a.id),
      currentTime: fraction * duration,
    });
    const values = await desk.evaluate((tab) => {
      const pick = (el: Element | null) =>
        el ? getComputedStyle(el).getPropertyValue("--pick").trim() : "none";
      return [...document.querySelectorAll<HTMLElement>(tab)].map((one) => {
        const sheet = one.querySelector(".fold .sheet");
        const rim = one.querySelector(".fold .rim");
        const strong = one.querySelector(".strong");
        return {
          tab: `${one.textContent?.trim().slice(0, 12)}`,
          pick: pick(one),
          sheet: [pick(sheet), sheet ? getComputedStyle(sheet).fill : "none"],
          rim: [pick(rim), rim ? getComputedStyle(rim).opacity : "none"],
          strong: [
            pick(strong),
            strong ? getComputedStyle(strong).opacity : "none",
          ],
          hangRim: getComputedStyle(one).getPropertyValue("--hang-rim").trim(),
        };
      });
    }, TAB);
    kit.note(`desk: --pick at ${fraction}: ${JSON.stringify(values)}`);
    for (const one of values) {
      for (const [reader, [pick]] of [
        ["sheet", one.sheet],
        ["rim", one.rim],
        ["strong", one.strong],
      ] as const) {
        if (pick !== "none" && pick !== one.pick) {
          apart.push(
            `${one.tab} ${reader} ${pick} at ${fraction} (tab ${one.pick})`
          );
        }
      }
    }
  }
  kit.check(
    "desk: at every fraction of the choice the sheet, the rim and the strong ink read their tab's --pick",
    pickIds.length >= 2 && apart.length === 0,
    apart.join("; ") ||
      `${pickIds.length} --pick transitions seeked at 0, 0.25, 0.5, 0.75, 1`
  );
  await anim.send("Animation.setPaused", {
    animations: pickIds.map((a) => a.id),
    paused: false,
  });
  await anim.detach();
  await desk.close();
};

const spec: Spec = { name: "folder-ride", run: probe };
export default spec;
