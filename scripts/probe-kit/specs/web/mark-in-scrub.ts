/**
 * MachineAuthStatus's answer mark coming in (`mark-in`: from opacity 0,
 * scale 0.25 and a 4px blur, over --dur-pop on --ease-out), on the clock
 * (anim.ts): the home surface's answered unlocks (catalogue.ts `unlocked`
 * and `unlock-unreadable`, the studio's unlock answered on the page's own
 * socket), each standing as the walk leaves it, its mark's run started again
 * by its own rule, caught and held, and read at 0, 25, 50, 75 and 100%: the
 * runs caught (kind, name, length, easing), and the mark's opacity, scale
 * and filter at each.
 *
 * The walk's own read finishes every run (read.ts `still`), so the style
 * snapshot holds the mark's last frame alone; this holds the frames before
 * it. A reading held to the one approved: approved on the base of record,
 * and the converted tree read against it (`PROBE_BASELINES`).
 *
 *   bun scripts/probe-kit/run.ts web mark-in-scrub [--approve mark-in-scrub]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Clock } from "../../anim";
import { entrySlug, type Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

/** The answer's mark (MachineAuthStatus), the one element its run is on. */
const MARK = '[data-slot="mark"][data-enter]';
/** The answered unlocks: the check, and the warning. */
const ANSWERED = new Set(["unlocked", "unlock-unreadable"]);
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** The prefix Svelte scopes a component's `@keyframes` names by. */
const SCOPED = /^svelte-[a-z0-9]+-/;

interface Reading {
  frames: { fraction: number; filter: string; opacity: string; scale: string }[];
  runs: string[];
}

const spec: Spec = {
  name: "mark-in-scrub",
  async run(kit) {
    const surfaces = chosen("home").map((surface) => ({
      ...surface,
      states: surface.states.filter((state) => ANSWERED.has(state.name)),
    }));
    await walkTapes(
      kit,
      surfaces,
      PASSES.filter((pass) => !pass.reduced && pass.width === "desk"),
      async ({ page, pass, state, surface }) => {
        const entry = entrySlug(
          `${surface.name} ${state.name} ${pass.width} ${pass.theme}`
        );
        // The walk holds page time between acts, and the clock (anim.ts)
        // waits on the page's frames, which a held page never draws (a
        // scrub under it waited for ever): page time runs while the mark
        // is caught and seeked, and stands again where it got to, as the
        // walk's own act leaves it (walk.ts `acting`).
        await page.clock.resume();
        const clock = await Clock.on(page);
        let reading: Reading;
        try {
          // Its rule's run started again from the rule itself: no name for
          // a style recalc, then the rule's own. A run replayed with
          // `cancel()` and `play()` is never reported as starting (the
          // protocol's `animationStarted`), so the clock caught nothing.
          const runs = await clock.catchRuns(
            () =>
              page.evaluate((mark) => {
                const el = document.querySelector<HTMLElement>(mark);
                if (!el) {
                  return;
                }
                el.style.setProperty("animation-name", "none");
                if (getComputedStyle(el).animationName === "none") {
                  el.style.removeProperty("animation-name");
                }
              }, MARK),
            MARK
          );
          const frames: Reading["frames"] = [];
          for (const fraction of FRACTIONS) {
            // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, on the one clock
            await clock.seek(fraction);
            frames.push({
              fraction,
              ...(await page.evaluate((mark) => {
                const el = document.querySelector(mark);
                const style = el ? getComputedStyle(el) : null;
                return {
                  opacity: style?.opacity ?? "(no mark)",
                  scale: style?.scale ?? "(no mark)",
                  filter: style?.filter ?? "(no mark)",
                };
              }, MARK)),
            });
          }
          reading = {
            // A run's name without the prefix Svelte scopes a component's
            // keyframes by (`svelte-<hash>-`), a hash of the component's
            // file: the frames read say what the keyframes are.
            runs: runs.map(
              (run) =>
                `${run.type} ${run.name.replace(SCOPED, "")} ${Math.round(run.end)}ms ${run.easing}`
            ),
            frames,
          };
        } finally {
          await clock.release();
          const moment = await page.evaluate(() => Date.now());
          await page.clock.pauseAt(moment);
          await page.clock.setFixedTime(moment);
        }
        const said = `${JSON.stringify(reading, null, 2)}\n`;
        await writeFile(join(kit.out, `${entry}.json`), said);
        const baseline = join(kit.baselines, `${entry}.json`);
        if (kit.approves(entry)) {
          await mkdir(kit.baselines, { recursive: true });
          await writeFile(baseline, said);
          kit.note(`${entry}: baseline approved (${baseline})`);
          return;
        }
        const approved = await readFile(baseline, "utf8").catch(() => null);
        kit.check(
          `${entry} reads as approved`,
          approved === said,
          approved === null
            ? `no baseline at ${baseline}`
            : `read ${reading.frames.map((f) => `${f.fraction}: ${f.opacity} ${f.scale} ${f.filter}`).join("; ")} (${reading.runs.join(", ")}); approved ${baseline}`
        );
      },
      (what, why) => kit.check(`${what}: opens`, false, why)
    );
  },
};
export default spec;
