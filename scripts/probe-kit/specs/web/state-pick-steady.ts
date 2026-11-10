/**
 * A pick on the design graph's states list morphs the drawing; it never
 * mounts it afresh (the owner's pin 7 on graph-dials-questions, 2026-11-06:
 * from Just opened to Every week "the prose inside layout shifts"). The
 * stage sets the next story's args on the live instance (agent stage-host
 * canvas stage.ts `actOn`); the design graph's bench (`/dev/graph-dials`)
 * once mounted the routine form afresh on every pick, so its schedule
 * read-back left and unfolded again a moment later, pushing "Creating it
 * runs it once…" 73px down. In Chromium at the desk (1440), Just opened
 * kept, then Every week pressed:
 *
 * 1. The form is the same instance after the pick (a mark set on its root
 *    before it is still there after).
 * 2. The schedule's read-back stands in every frame from the press on.
 * 3. Once the drawing's own motion has ended, nothing in it moves for the
 *    next 1.2s.
 *
 *   bun scripts/probe-kit/run.ts web state-pick-steady
 */
import { open, settle } from "../../kit";
import type { Kit, Spec } from "../../spec";

const BENCH = "/dev/graph-dials";
const DRAWING = "[data-cawco-story]";
/** A state's row in the States list, by its story's name (Journey `data-state-id`). */
const pick = (story: string) => `[data-state-id="${story}"] button`;
/** How long the drawing is watched once its motion has ended, ms. */
const STILL_MS = 1200;
/** How long the pick's own motion may run, ms. */
const MOTION_MS = 3000;
/** A move smaller than this is none, px. */
const MOVED = 0.5;

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "state-pick-steady",
  run: async (kit: Kit) => {
    const bench = await kit.bench();
    const page = await kit.page("desk");
    await open(page, `${bench}${BENCH}`, DRAWING);
    await page.locator(pick("JustOpened")).first().click();
    await settle(page);
    await page.evaluate((drawing) => {
      const root = document.querySelector(drawing)?.firstElementChild;
      root?.setAttribute("data-probe-mark", "before-pick");
    }, DRAWING);
    await page.locator(pick("EveryWeek")).first().click();
    const read = await page.evaluate(
      async ({ drawing, stillMs, motionMs, moved }) => {
        const frame = () =>
          new Promise((next) => requestAnimationFrame(() => next(null)));
        const holder = document.querySelector(drawing);
        const boxes = () =>
          [...(holder?.querySelectorAll("p, button, label") ?? [])].map(
            (one) => {
              const box = one.getBoundingClientRect();
              return `${(one.textContent ?? "").trim().slice(0, 30)}@${box.x},${box.y}`;
            }
          );
        let readBackLeft = 0;
        const started = performance.now();
        // The pick's own motion: until no animation runs in the drawing.
        while (performance.now() - started < motionMs) {
          await frame();
          if (!holder?.querySelector('[data-slot="read-back"]')) {
            readBackLeft += 1;
          }
          if ((holder?.getAnimations({ subtree: true }).length ?? 0) === 0) {
            break;
          }
        }
        const still = boxes();
        const shifts: string[] = [];
        const watch = performance.now();
        while (performance.now() - watch < stillMs) {
          await frame();
          if (!holder?.querySelector('[data-slot="read-back"]')) {
            readBackLeft += 1;
          }
          const now = boxes();
          now.forEach((one, at) => {
            const was = still[at];
            if (was && was !== one) {
              const [, a = ""] = was.split("@");
              const [, b = ""] = one.split("@");
              const [ax = 0, ay = 0] = a.split(",").map(Number);
              const [bx = 0, by = 0] = b.split(",").map(Number);
              if (Math.abs(ax - bx) > moved || Math.abs(ay - by) > moved) {
                shifts.push(`${was} → ${b}`);
              }
            }
          });
        }
        return {
          same: !!holder?.querySelector('[data-probe-mark="before-pick"]'),
          readBackLeft,
          shifts: [...new Set(shifts)].slice(0, 4),
        };
      },
      {
        drawing: DRAWING,
        stillMs: STILL_MS,
        motionMs: MOTION_MS,
        moved: MOVED,
      }
    );
    kit.check(
      "Just opened → Every week: the form is the same instance (a pick morphs it, never mounts it afresh)",
      read.same,
      JSON.stringify(read)
    );
    kit.check(
      "Just opened → Every week: the schedule's read-back stands in every frame",
      read.readBackLeft === 0,
      `${read.readBackLeft} frame(s) without it`
    );
    kit.check(
      `Just opened → Every week: once its motion ends, nothing in the drawing moves for ${STILL_MS}ms`,
      read.shifts.length === 0,
      read.shifts.join(" | ") || "nothing moved"
    );
    await page.context().close();
  },
};

export default spec;
