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
 */
import type { CDPSession, Page } from "playwright-core";
import type { Reply } from "../../scratch-fleet";
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
};

const spec: Spec = { name: "folder-ride", run: probe };
export default spec;
