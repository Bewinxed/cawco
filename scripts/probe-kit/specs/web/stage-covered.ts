/**
 * The design graph's stage, covered whole by its drawer, is out of the
 * keyboard's and a screen reader's reach as it is out of the eye's: at the
 * drawer's whole stop (up to the foot of the panel head's room) the stage
 * closes to no height and its head's glass is clipped away under the
 * drawer, so the stage is inert there (DesignGraph `stageCovered`). The
 * way back is the pointer's: the drawer's grabber, a named button, steps
 * the drawer back to its head stop.
 *
 * On the design graph's bench (`/dev/graph-dials`), at a phone's width
 * (390), the room open as its drawer:
 *
 * 1. At the head stop, Tab from the page's start reaches the stage's glass:
 *    Compare, View options and the room switch.
 * 2. The grabber is a button named for its next stop (`words.nextStop`)
 *    that the keyboard reaches.
 * 3. With View options focused at the half stop, the grabber stepping the
 *    drawer to its whole stop moves the focus to the grabber, in the
 *    drawer's head: never to the body.
 * 4. At the whole stop the stage is inert, and Tab from the page's start
 *    round the whole page never reaches Compare, View options or the room
 *    switch.
 * 5. Back at the head stop, the stage is live again and Tab reaches them.
 *
 *   bun scripts/probe-kit/run.ts web stage-covered
 */
import type { Page } from "playwright-core";
import { graphWords } from "../../../../packages/core/src/words/graph";
import { open, settle } from "../../kit";
import type { Kit, Spec } from "../../spec";
import { exactly, shaped } from "../../words";

const BENCH = "/dev/graph-dials";
const BAR = '[data-slot="stage-bar"]';
const GRABBER =
  '[data-slot="drawer-content"] button[data-slot="drawer-grabber"]';
const COMPARE = shaped(graphWords.compare);
const VIEW = exactly(graphWords.stageView);
const CLOSE_ROOM = shaped(graphWords.closeRoom);
/** The grabber's name, either way it steps. */
const NEXT_STOP = [true, false].map((more) =>
  shaped((room: string) => graphWords.nextStop(room, more))
);
/** Tabs pressed in one walk: past every tab stop the page holds. */
const WALK = 80;

/** The stage-bar controls the keyboard reached in one walk from the page's start, by name, and the grabber's name if reached. */
async function walk(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  const bar = new Set<string>();
  let grabber: string | null = null;
  for (let tab = 0; tab < WALK; tab += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(
      ([barSel, grabSel]) => {
        const el = document.activeElement;
        return {
          bar: !!el?.closest(barSel),
          grab: !!el?.matches(grabSel),
          name: el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "",
        };
      },
      [BAR, GRABBER] as const
    );
    if (at.bar) {
      bar.add(at.name);
    }
    if (at.grab) {
      grabber = at.name;
    }
  }
  return { bar: [...bar], grabber };
}

const covered = (page: Page) =>
  page.evaluate(
    (barSel) => !!document.querySelector(barSel)?.closest("[inert]"),
    BAR
  );

/** Presses the grabber as a pointer does not: a click that moves no focus. */
async function nextStop(page: Page) {
  await page.evaluate((sel) => {
    document.querySelector<HTMLElement>(sel)?.click();
  }, GRABBER);
  await page.waitForTimeout(700);
  await settle(page);
}

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "stage-covered",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    const page = await kit.page("phone");
    await open(page, `${bench}${BENCH}`, GRABBER);
    await page.waitForSelector(`${BAR} [data-slot="room-switch"]`);
    await settle(page);

    const head = await walk(page);
    const reaches = (names: string[]) =>
      names.some((one) => COMPARE.test(one)) &&
      names.some((one) => VIEW.test(one)) &&
      names.some((one) => CLOSE_ROOM.test(one));
    kit.check(
      "1: at the head stop Tab reaches Compare, View options and the room switch",
      !(await covered(page)) && reaches(head.bar),
      JSON.stringify(head)
    );
    kit.check(
      "2: the grabber is a button named for its next stop that the keyboard reaches",
      NEXT_STOP.some((one) => one.test(head.grabber ?? "")),
      JSON.stringify(head.grabber)
    );

    // To the half stop, then View options focused, then the whole stop.
    await nextStop(page);
    await page.locator(BAR).getByRole("button", { name: VIEW }).focus();
    let stops = 0;
    while (!(await covered(page)) && stops < 3) {
      await nextStop(page);
      stops += 1;
    }
    const focus = await page.evaluate(
      (grabSel) => ({
        body: document.activeElement === document.body,
        grabber: !!document.activeElement?.matches(grabSel),
        name: document.activeElement?.getAttribute("aria-label") ?? "",
      }),
      GRABBER
    );
    kit.check(
      "3: View options focused as the drawer reaches its whole stop, the focus moves to the drawer's grabber, never to the body",
      (await covered(page)) && focus.grabber && !focus.body,
      JSON.stringify({ stops, ...focus })
    );

    const whole = await walk(page);
    kit.check(
      "4: at the whole stop the stage is inert and Tab never reaches Compare, View options or the room switch",
      (await covered(page)) && whole.bar.length === 0 && !!whole.grabber,
      JSON.stringify(whole)
    );

    // The grabber from the whole stop goes back to the head.
    await nextStop(page);
    const back = await walk(page);
    kit.check(
      "5: back at the head stop the stage is live and Tab reaches them again",
      !(await covered(page)) && reaches(back.bar),
      JSON.stringify(back)
    );
    await page.context().close();
  },
};

export default spec;
