/**
 * The session card moving to another tab, on the clock (anim.ts): its glide
 * (the floating wrapper's `transform` and the card's `.details-morph` height,
 * PaneTabs), and its title's morph, on the folder-tabs bench (no hub), on the
 * desk.
 *
 * The card is opened on the chosen tab with the keyboard (pinned), another
 * tab is clicked, and every run that starts on the card is caught and held:
 *  - each run's kind, name, start on the document timeline (ms, from the
 *    glide's own), length and easing;
 *  - the wrapper's transform, the card's left edge and the morph box's
 *    height at 0, 50 and 100% of the glide (motion by seek).
 *
 * A reading, not a gate: it is what the card's move is compared by, before
 * and after a change to when its parts start.
 */
import { Clock } from "../../anim";
import { type Kit, open, type Spec, settle } from "../../kit";

const TABS_ROUTE = "/motion/folder-proof?at=1&work=working";
/** The card's floating wrapper, read by its card; the card is the one floating box open. */
const WRAPPER =
  "[data-bits-floating-content-wrapper]:has(> .session-details-popover)";
/** Where its runs are caught: any floating box, the card's being the one open. */
const CATCH = "[data-bits-floating-content-wrapper]";
const PCTS = [0, 0.5, 1];

async function move(kit: Kit): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}${TABS_ROUTE}&theme=light`,
    ".session-tabs .tab[data-chosen]",
    120_000
  );
  await settle(page, 400);
  await page.focus(".session-tabs .tab[data-chosen] [data-session-tab]");
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector(".kit-pop.session-details-popover", {
    timeout: 10_000,
  });
  await settle(page, 800);
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () =>
      page
        .locator(".session-tabs .tab:not([data-chosen]) [data-session-tab]")
        .first()
        .click(),
    CATCH
  );
  const glide =
    runs.find((one) => one.name === "transform") ??
    runs.reduce((a, b) => (b.end > a.end ? b : a));
  kit.note(
    `card-move: runs on the card (start from the glide's, ms; length; easing): ${runs
      .map(
        (one) =>
          `${one.type} ${one.name} +${one.start === null || glide.start === null ? "?" : Math.round(one.start - glide.start)} ${Math.round(one.end)}ms ${one.easing}`
      )
      .join("; ")}`
  );
  const read: string[] = [];
  for (const f of PCTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one point of the clock at a time
    await clock.seek(f, glide.name);
    read.push(
      `${f * 100}%: ${await page.evaluate((sel) => {
        const wrapper = document.querySelector<HTMLElement>(sel);
        const card = wrapper?.querySelector<HTMLElement>(
          ".session-details-popover"
        );
        const morph = card?.querySelector<HTMLElement>(".details-morph");
        if (!(wrapper && card && morph)) {
          return "no card";
        }
        return `transform ${getComputedStyle(wrapper).transform}, left ${card.getBoundingClientRect().left.toFixed(1)}, height ${morph.getBoundingClientRect().height.toFixed(1)}`;
      }, WRAPPER)}`
    );
  }
  kit.note(`card-move: the glide by seek: ${read.join(" | ")}`);
  await clock.release();
  await page.close();
}

const spec: Spec = {
  name: "card-move",
  run: async (kit) => {
    try {
      await move(kit);
      kit.check("card-move: reads to its end", true, "");
    } catch (error) {
      kit.check(
        "card-move: reads to its end",
        false,
        String(error).split("\n")[0]
      );
    }
  },
};
export default spec;
