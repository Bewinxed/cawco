/**
 * MachineAuthStatus's answer mark coming in (`mark-in`, theme.css: from
 * opacity 0, scale 0.25 and a `--space-1` blur, over `--dur-pop` on
 * `--ease-out`), on the clock (anim.ts): the home surface's answered unlocks
 * (catalogue.ts `unlocked` and `unlock-unreadable`, the studio's unlock
 * answered on the page's own socket), each standing as the walk leaves it,
 * its mark's run started again by its own rule, caught and held, and read at
 * 0, 25, 50, 75 and 100%.
 *
 * The walk's own read finishes every run (read.ts `still`), so the frames
 * before the last are read here, each held to what the keyframes and the
 * tokens say it is: the one run is `mark-in` over `--dur-pop` on
 * `--ease-out`, and at each fraction f, with p the curve's progress at f,
 * the mark's opacity is p, its scale 0.25 + 0.75p and its blur
 * `--space-1` × (1 − p), read off the engine.
 *
 *   bun scripts/probe-kit/run.ts web mark-in-scrub
 */
import { bezierAt, Clock, type Run, sameCurve } from "../../anim";
import { entrySlug, type Spec } from "../../kit";
import { chosen } from "../../surfaces/catalogue";
import { PASSES, walkTapes } from "../../surfaces/walk";

/** The answer's mark (MachineAuthStatus), the one element its run is on. */
const MARK = '[data-slot="mark"][data-enter]';
/** The answered unlocks: the check, and the warning. */
const ANSWERED = new Set(["unlocked", "unlock-unreadable"]);
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** The keyframes' `from` (theme.css `@keyframes mark-in`): opacity 0, scale 0.25. */
const FROM_SCALE = 0.25;
/** How near a computed value stands to the curve's: the engine rounds. */
const NEAR = { opacity: 0.01, scale: 0.01, blur: 0.05 };
const BLUR = /blur\(([\d.]+)px\)/;

interface Frame {
  blur: number;
  fraction: number;
  opacity: number;
  scale: number;
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
        // The tokens as the page resolves them: the run's length and curve,
        // and the blur it starts from, in px.
        const tokens = await page.evaluate(() => {
          const root = getComputedStyle(document.documentElement);
          const probe = document.createElement("div");
          probe.style.width = "var(--space-1)";
          document.body.append(probe);
          const space = Number.parseFloat(getComputedStyle(probe).width);
          probe.remove();
          const dur = root.getPropertyValue("--dur-pop").trim();
          return {
            duration: dur.endsWith("ms")
              ? Number.parseFloat(dur)
              : Number.parseFloat(dur) * 1000,
            easing: root.getPropertyValue("--ease-out").trim(),
            blur: space,
          };
        });
        // The walk holds page time between acts, and the clock (anim.ts)
        // waits on the page's frames, which a held page never draws (a
        // scrub under it waited for ever): page time runs while the mark
        // is caught and seeked, and stands again where it got to, as the
        // walk's own act leaves it (walk.ts `acting`).
        await page.clock.resume();
        const clock = await Clock.on(page);
        let runs: Run[];
        // The run's curve: a CSS animation's lies on its keyframes, so the
        // protocol reports the effect's own easing as `linear`; the rule's
        // `animation-timing-function` is the curve each keyframe runs on.
        let timing = "";
        const frames: Frame[] = [];
        try {
          // Its rule's run started again from the rule itself: no name for
          // a style recalc, then the rule's own. A run replayed with
          // `cancel()` and `play()` is never reported as starting (the
          // protocol's `animationStarted`), so the clock caught nothing.
          runs = await clock.catchRuns(
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
          timing = await page.evaluate((mark) => {
            const el = document.querySelector(mark);
            return el ? getComputedStyle(el).animationTimingFunction : "";
          }, MARK);
          for (const fraction of FRACTIONS) {
            // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, on the one clock
            await clock.seek(fraction);
            const read = await page.evaluate((mark) => {
              const el = document.querySelector(mark);
              const style = el ? getComputedStyle(el) : null;
              return style
                ? {
                    opacity: style.opacity,
                    scale: style.scale,
                    filter: style.filter,
                  }
                : null;
            }, MARK);
            frames.push({
              fraction,
              opacity: read ? Number.parseFloat(read.opacity) : Number.NaN,
              // `scale: none` is 1; a uniform scale computes as one number.
              scale:
                read?.scale === "none"
                  ? 1
                  : Number.parseFloat(read?.scale ?? "NaN"),
              blur:
                read?.filter === "none"
                  ? 0
                  : Number.parseFloat(read?.filter.match(BLUR)?.[1] ?? "NaN"),
            });
          }
        } finally {
          await clock.release();
          const moment = await page.evaluate(() => Date.now());
          await page.clock.pauseAt(moment);
          await page.clock.setFixedTime(moment);
        }
        const [run] = runs;
        kit.check(
          `${entry}: the mark comes in as one run, mark-in over --dur-pop on --ease-out`,
          runs.length === 1 &&
            run?.type === "CSSAnimation" &&
            run.name === "mark-in" &&
            Math.abs(run.end - tokens.duration) < 0.5 &&
            sameCurve(timing, tokens.easing),
          `caught ${runs.map((r) => `${r.type} ${r.name} ${Math.round(r.end)}ms`).join(", ") || "nothing"} on ${timing || "no curve"}; tokens ${tokens.duration}ms ${tokens.easing}`
        );
        const want = (fraction: number) => {
          const p = bezierAt(tokens.easing, fraction);
          return {
            opacity: p,
            scale: FROM_SCALE + (1 - FROM_SCALE) * p,
            blur: tokens.blur * (1 - p),
          };
        };
        const off = frames.filter((frame) => {
          const w = want(frame.fraction);
          return !(
            Math.abs(frame.opacity - w.opacity) <= NEAR.opacity &&
            Math.abs(frame.scale - w.scale) <= NEAR.scale &&
            Math.abs(frame.blur - w.blur) <= NEAR.blur
          );
        });
        const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();
        kit.check(
          `${entry}: scrubbed at 0, 25, 50, 75 and 100%, its opacity, scale and blur ride --ease-out from 0, 0.25 and --space-1 to 1, 1 and none`,
          frames.length === FRACTIONS.length && off.length === 0,
          frames
            .map((frame) => {
              const w = want(frame.fraction);
              return `${frame.fraction}: opacity ${fmt(frame.opacity)}/${fmt(w.opacity)} scale ${fmt(frame.scale)}/${fmt(w.scale)} blur ${fmt(frame.blur)}/${fmt(w.blur)}px`;
            })
            .join("; ")
        );
      }
    );
  },
};
export default spec;
