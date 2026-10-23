/**
 * The kit skeleton's motion, transitions.dev's Skeleton loader and reveal
 * exactly (the owner's pick, "transitions.dev exactly"; DESIGN.md
 * Skeleton), on the skeleton bench (`/motion/skeleton`), read on the clock
 * (anim.ts): every run held by the DevTools Animation domain and sought.
 *
 *  1. The pulse: as the skeleton takes its place, each bar starts one run,
 *     `kit-skeleton-pulse`, a loop of --dur-skeleton-pulse (1000ms) on
 *     --ease-crossfade (CSS ease-in-out). Sought to 0, 1/4, 1/2, 3/4 and 1
 *     of its period, a bar's opacity is 1, 0.75, --skeleton-pulse-floor
 *     (0.5), 0.75 and 1: the recipe's `0%, 100% { opacity: 1 } 50% {
 *     opacity: var(--pulse-min) }`, each half on ease-in-out (half way
 *     through a half is half way on a symmetric curve).
 *  2. The reveal: as the content comes, the skeleton goes and the content
 *     arrives on one clock, --dur-skeleton-reveal (400ms) each. At each of
 *     0, 1/4, 1/2, 3/4 and 1, with p the ease-in-out curve's progress there,
 *     the content's opacity is p and its blur --skeleton-reveal-blur (2px)
 *     × (1 − p), the skeleton's opacity 1 − p and its blur 2px × p: the
 *     recipe's cross-fade and cross-blur.
 *  4. In a `reflow` list (motion/rows), skeleton rows marked
 *     `data-flip-skeleton` hand their place to the rows the same way: each
 *     one's copy fades out into the blur where it stood and each row comes
 *     out of it, six runs on one clock, read at the same fractions.
 *  3. With reduced motion the skeleton stands still (no run on it) and the
 *     swap is at once (no run of any length inside the stage).
 *
 *   bun scripts/probe-kit/run.ts web skeleton-motion
 */
import type { Page } from "playwright-core";
import { bezierAt, Clock, type Run, sameCurve } from "../../anim";
import { open, readMotion, type Spec } from "../../kit";

const STAGE = '[data-bench="stage"]';
const SKELETON = '[data-case="skeleton"]';
const CONTENT = '[data-case="content"]';
const BAR = `${SKELETON} [data-slot="skeleton"]`;
const LIST = '[data-bench="list"]';
const ROW_SKELETON = '[data-case="skeleton-row"]';
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** How near a computed value stands to the recipe's: the engine rounds, and Svelte samples its curve a frame apart. */
const NEAR = { opacity: 0.02, blur: 0.05 };
const BLUR = /blur\(([\d.]+)px\)/;

const call = (page: Page, how: "load" | "wait") =>
  page.evaluate((one) => {
    (
      window as unknown as {
        __skeletonBench: Record<"load" | "wait", () => void>;
      }
    ).__skeletonBench[one]();
  }, how);

/** An element's opacity and blur (px) now; null when it is not there. */
const look = (page: Page, selector: string) =>
  page.evaluate(
    ({ selector: sel, blur }) => {
      const el = document.querySelector(sel);
      if (!el) {
        return null;
      }
      const style = getComputedStyle(el);
      const found = style.filter.match(new RegExp(blur));
      return {
        opacity: Number.parseFloat(style.opacity),
        blur:
          style.filter === "none" ? 0 : Number.parseFloat(found?.[1] ?? "NaN"),
      };
    },
    { selector, blur: BLUR.source }
  );

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toString();
const ms = (token: string) =>
  token.endsWith("ms")
    ? Number.parseFloat(token)
    : Number.parseFloat(token) * 1000;

const spec: Spec = {
  name: "skeleton-motion",
  async run(kit) {
    const page = await kit.page("desk", { theme: "light" });
    await open(page, `${await kit.bench()}/motion/skeleton`, CONTENT);
    const tokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = (name: string) => root.getPropertyValue(name).trim();
      return {
        pulse: read("--dur-skeleton-pulse"),
        floor: read("--skeleton-pulse-floor"),
        reveal: read("--dur-skeleton-reveal"),
        blur: read("--skeleton-reveal-blur"),
        curve: read("--ease-crossfade"),
      };
    });
    const floor = Number.parseFloat(tokens.floor);
    const blur = Number.parseFloat(tokens.blur);
    kit.check(
      "the tokens are the recipe's: --pulse-dur 1000ms, --pulse-min 0.5, --reveal-dur 400ms, --reveal-blur 2px, --reveal-ease ease-in-out",
      ms(tokens.pulse) === 1000 &&
        floor === 0.5 &&
        ms(tokens.reveal) === 400 &&
        blur === 2 &&
        sameCurve(tokens.curve, "cubic-bezier(0.42, 0, 0.58, 1)"),
      JSON.stringify(tokens)
    );

    // 1. The pulse, caught as the skeleton mounts and sought through one period.
    const clock = await Clock.on(page);
    let runs: Run[] = [];
    let timing = "";
    const pulse: { fraction: number; opacity: number }[] = [];
    try {
      runs = await clock.catchRuns(() => call(page, "wait"), SKELETON);
      timing = await page.evaluate(
        (bar) =>
          getComputedStyle(document.querySelector(bar) as Element)
            .animationTimingFunction,
        BAR
      );
      for (const fraction of FRACTIONS) {
        // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, on the one clock
        await clock.seek(fraction, "kit-skeleton-pulse");
        pulse.push({
          fraction,
          opacity: (await look(page, BAR))?.opacity ?? Number.NaN,
        });
      }
    } finally {
      await clock.release();
    }
    const bars = await page.locator(BAR).count();
    kit.check(
      "1: each bar pulses by one run, kit-skeleton-pulse, a loop of --dur-skeleton-pulse on --ease-crossfade",
      runs.length === bars &&
        bars > 0 &&
        runs.every(
          (run) =>
            run.type === "CSSAnimation" &&
            run.name === "kit-skeleton-pulse" &&
            run.loop &&
            Math.abs(run.end - ms(tokens.pulse)) < 0.5
        ) &&
        sameCurve(timing, tokens.curve),
      `${bars} bars; caught ${runs.map((run) => `${run.type} ${run.name} ${Math.round(run.end)}ms${run.loop ? " loop" : ""}`).join(", ") || "nothing"} on ${timing || "no curve"}`
    );
    const wantPulse = (fraction: number) => {
      const half = fraction <= 0.5 ? fraction * 2 : (fraction - 0.5) * 2;
      const p = bezierAt(tokens.curve, half);
      return fraction <= 0.5 ? 1 - (1 - floor) * p : floor + (1 - floor) * p;
    };
    kit.check(
      "1: sought to 0, 1/4, 1/2, 3/4 and 1 of its period, a bar's opacity is 1, 0.75, 0.5, 0.75 and 1",
      pulse.length === FRACTIONS.length &&
        pulse.every(
          (one) =>
            Math.abs(one.opacity - wantPulse(one.fraction)) <= NEAR.opacity
        ),
      pulse
        .map(
          (one) =>
            `${one.fraction}: ${fmt(one.opacity)}/${fmt(wantPulse(one.fraction))}`
        )
        .join("; ")
    );

    // 2. The reveal: the skeleton going and the content coming, on one clock.
    const read = async () => ({
      content: await look(page, CONTENT),
      skeleton: await look(page, SKELETON),
    });
    const revealed = await readMotion(page, () => call(page, "load"), STAGE, {
      fractions: FRACTIONS,
      read,
      ms: 5000,
    });
    const lengths = revealed.runs.map((run) => Math.round(run.end));
    kit.check(
      "2: the skeleton's exit and the content's entrance are two runs of --dur-skeleton-reveal, on the clock",
      revealed.by === "clock" &&
        revealed.runs.length === 2 &&
        lengths.every((one) => one === ms(tokens.reveal)) &&
        revealed.runs.every((run) => run.ended),
      `read by ${revealed.by}: ${JSON.stringify(revealed.runs)}`
    );
    const off = revealed.at.filter(({ fraction, value }) => {
      const p = bezierAt(tokens.curve, fraction);
      return !(
        value.content &&
        value.skeleton &&
        Math.abs(value.content.opacity - p) <= NEAR.opacity &&
        Math.abs(value.content.blur - blur * (1 - p)) <= NEAR.blur &&
        Math.abs(value.skeleton.opacity - (1 - p)) <= NEAR.opacity &&
        Math.abs(value.skeleton.blur - blur * p) <= NEAR.blur
      );
    });
    kit.check(
      "2: at 0, 1/4, 1/2, 3/4 and 1, on ease-in-out's progress p, the content stands at opacity p and blur 2px × (1 − p), the skeleton at opacity 1 − p and blur 2px × p",
      revealed.at.length === FRACTIONS.length && off.length === 0,
      revealed.at
        .map(({ fraction, value }) => {
          const p = bezierAt(tokens.curve, fraction);
          return `${fraction}: content ${fmt(value.content?.opacity ?? Number.NaN)}/${fmt(p)} blur ${fmt(value.content?.blur ?? Number.NaN)}/${fmt(blur * (1 - p))}px, skeleton ${fmt(value.skeleton?.opacity ?? Number.NaN)}/${fmt(1 - p)} blur ${fmt(value.skeleton?.blur ?? Number.NaN)}/${fmt(blur * p)}px`;
        })
        .join("; ")
    );

    // 4. A `reflow` list's skeleton rows (motion/rows `data-flip-skeleton`):
    //    each leaves by a copy fading out into the blur where it stood, and
    //    each row that comes in its batch comes out of the blur, on one clock.
    await call(page, "wait");
    await page.locator(ROW_SKELETON).first().waitFor();
    // The copies are nobody's rows (motion/rows `anonymous`): inert, aria-hidden.
    const listRead = async () =>
      page.evaluate(
        ({ list, blur: blurred }) => {
          const lookOf = (el: Element) => {
            const style = getComputedStyle(el);
            const found = style.filter.match(new RegExp(blurred));
            return {
              opacity: Number.parseFloat(style.opacity),
              blur:
                style.filter === "none"
                  ? 0
                  : Number.parseFloat(found?.[1] ?? "NaN"),
            };
          };
          const box = document.querySelector(list) as Element;
          return {
            rows: [...box.querySelectorAll('[data-case="row"]')].map(lookOf),
            copies: [...box.querySelectorAll(":scope > [inert]")].map(lookOf),
          };
        },
        { list: LIST, blur: BLUR.source }
      );
    const listed = await readMotion(page, () => call(page, "load"), LIST, {
      fractions: FRACTIONS,
      read: listRead,
      ms: 5000,
    });
    const listOff = listed.at.filter(({ fraction, value }) => {
      const p = bezierAt(tokens.curve, fraction);
      return !(
        value.rows.length === 3 &&
        value.copies.length === 3 &&
        value.rows.every(
          (one) =>
            Math.abs(one.opacity - p) <= NEAR.opacity &&
            Math.abs(one.blur - blur * (1 - p)) <= NEAR.blur
        ) &&
        value.copies.every(
          (one) =>
            Math.abs(one.opacity - (1 - p)) <= NEAR.opacity &&
            Math.abs(one.blur - blur * p) <= NEAR.blur
        )
      );
    });
    kit.check(
      "4: in a reflow list, the three skeleton rows' copies go and the three rows come in the reveal, six runs of --dur-skeleton-reveal on one clock: at each fraction the rows at opacity p and blur 2px × (1 − p), the copies at 1 − p and 2px × p",
      listed.by === "clock" &&
        listed.runs.length === 6 &&
        listed.runs.every(
          (run) =>
            Math.round(run.end) === ms(tokens.reveal) &&
            run.start === listed.runs[0]?.start
        ) &&
        listed.at.length === FRACTIONS.length &&
        listOff.length === 0,
      `runs ${JSON.stringify(listed.runs.map((run) => [run.target, Math.round(run.end), run.start, run.easing]))}; ${listed.at
        .map(({ fraction, value }) => {
          const p = bezierAt(tokens.curve, fraction);
          const fmtAll = (all: { opacity: number; blur: number }[]) =>
            all
              .map((one) => `${fmt(one.opacity)}/${fmt(one.blur)}px`)
              .join(",");
          return `${fraction} (p ${fmt(p)}): rows ${fmtAll(value.rows)}, copies ${fmtAll(value.copies)}`;
        })
        .join("; ")}`
    );

    // 3. Reduced motion: still, and the swap at once.
    // Step 4's swap played out first: a skeleton still leaving would be the
    // one Svelte brings back for the next wait, its reveal still running.
    await page.locator(SKELETON).waitFor({ state: "detached" });
    await page.locator(ROW_SKELETON).first().waitFor({ state: "detached" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    // The page has heard it (the query's change event, which the motion
    // helpers' MediaQuery reads), a frame on, before the swap is asked.
    await page.evaluate(
      () =>
        new Promise<void>((heard) => {
          const query = matchMedia("(prefers-reduced-motion: reduce)");
          const on = () =>
            requestAnimationFrame(() => requestAnimationFrame(() => heard()));
          if (query.matches) {
            on();
          } else {
            query.addEventListener("change", on, { once: true });
          }
        })
    );
    await call(page, "wait");
    await page.locator(BAR).first().waitFor();
    const still = await page.evaluate(
      (bar) =>
        [...document.querySelectorAll(bar)].map(
          (one) => one.getAnimations().length
        ),
      BAR
    );
    await call(page, "load");
    await page.locator(CONTENT).waitFor();
    // At once is Svelte's zero-length outro: the skeleton goes on the frame
    // after, by a run of no length, never a reveal's.
    const after = await page.evaluate(
      ({ skeleton, stage }) => ({
        skeleton: document.querySelector(skeleton) !== null,
        runs: (document.querySelector(stage) as Element)
          .getAnimations({ subtree: true })
          .map((run) => ({
            end: Number(run.effect?.getComputedTiming().endTime ?? 0),
            on: (run.effect as KeyframeEffect | null)?.target?.getAttribute(
              "data-case"
            ),
          })),
      }),
      { skeleton: SKELETON, stage: STAGE }
    );
    kit.check(
      "3: with reduced motion the skeleton stands still and gives its place to the content at once",
      still.length > 0 &&
        still.every((one) => one === 0) &&
        after.runs.every((run) => run.end === 0),
      `runs on each bar ${JSON.stringify(still)}; after the load ${JSON.stringify(after)}`
    );
    await page.close();
  },
};
export default spec;
