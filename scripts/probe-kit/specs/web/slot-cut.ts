/**
 * A delegate chip's check drawn in (transcript/DelegateTray `slotIn`), on
 * the delegate-tray bench (`/motion/delegate-tray`), read on the held clock
 * (kit.ts `readMotion`): a delegate turns done, and its slot's new glyph
 * grows from 0.6 as it is drawn in from its leading edge, over --dur-pop.
 *
 * The scale and the cut are separate effects (house/no-clip-with-move: an
 * effect that cuts and moves dies with its renderer once another move
 * displaces it), so the check holds that they still move as one:
 *  - one clock: every run the glyph's entrance starts has the same start,
 *    length and curve;
 *  - at 0, ¼, ½, ¾ and 1 of it, the glyph's scale and its cut say the same
 *    progress t (scale 0.6 + 0.4t, the cut's inline end (1 - t)·100%), from
 *    0.6 and a whole cut at the start to 1 and none at the end.
 * The readings at each fraction are noted, to set beside another tree's.
 */
import type { Page } from "playwright-core";
import { open, readMotion, type Spec, settle } from "../../kit";

const BENCH = "/motion/delegate-tray";
const ITEM = "wi-tray-0";
const SLOT = `[data-tray-chip][data-key="${ITEM}"] [data-chip-slot]`;
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** How far apart the scale's and the cut's progress may read. Our call: a computed value's rounding. */
const SAME = 0.002;

interface Glyph {
  /** The cut's inline end, % of its box: 0 for no cut. */
  cut: number | null;
  /** Each run in the slot that scales or cuts: what it animates, and its clock. */
  runs: {
    duration: number;
    easing: string;
    props: string;
    /** Where its clock stands, ms: the DevTools clock holds no start time while it holds a run. */
    current: number;
    steps: number;
  }[];
  /** Its scale: the computed transform's x scale. */
  scale: number | null;
}

/** The entering glyph's scale and cut now: the newest glyph in the slot, its own and its descendants' styles. */
const readGlyph = (page: Page): Promise<Glyph> =>
  page.evaluate((slot) => {
    const glyphs = document.querySelectorAll(`${slot} > [data-slot="glyph"]`);
    const glyph = [...glyphs].at(-1);
    let cut: number | null = null;
    let scale: number | null = null;
    for (const el of glyph ? [glyph, ...glyph.querySelectorAll("*")] : []) {
      const style = getComputedStyle(el);
      if (cut === null && style.clipPath.startsWith("inset(")) {
        const sides = style.clipPath.slice(6, -1).split(" ");
        cut = Number.parseFloat(sides[1] ?? "0");
      }
      if (scale === null && style.transform.startsWith("matrix(")) {
        scale = Number.parseFloat(style.transform.slice(7));
      }
    }
    const runs = (glyph?.getAnimations({ subtree: true }) ?? []).flatMap(
      (run) => {
        const effect = run.effect as KeyframeEffect | null;
        const frames = effect?.getKeyframes() ?? [];
        const props = [
          ...new Set(
            frames.flatMap((frame) =>
              Object.keys(frame).filter(
                (key) =>
                  !["offset", "computedOffset", "easing", "composite"].includes(
                    key
                  )
              )
            )
          ),
        ]
          .sort()
          .join(",");
        if (!(props.includes("transform") || props.includes("clipPath"))) {
          return [];
        }
        const timing = effect?.getComputedTiming();
        return [
          {
            props,
            current: Number(run.currentTime),
            duration: Number(timing?.duration),
            easing: String(timing?.easing),
            steps: frames.length,
          },
        ];
      }
    );
    return { cut, scale, runs };
  }, SLOT);

const spec: Spec = {
  name: "slot-cut",
  run: async (kit) => {
    const page = await kit.page("desk", { theme: "light" });
    await open(page, `${await kit.bench()}${BENCH}`, SLOT, 120_000);
    await settle(page, 600);
    const read = await readMotion(
      page,
      () =>
        page.evaluate((id) => {
          const { workItems } = (
            window as unknown as {
              __cawcoDebug: {
                state: {
                  workItems: Record<
                    string,
                    { endedAt: number | null; state: string }
                  >;
                };
              };
            }
          ).__cawcoDebug.state;
          const item = workItems[id];
          if (item) {
            item.state = "done";
            item.endedAt = Date.now();
          }
        }, ITEM),
      SLOT,
      { fractions: FRACTIONS, read: () => readGlyph(page) }
    );
    // The glyph's entrance: the runs that scale or cut it, as the page held them at each fraction.
    const entering = read.at.map(({ fraction, value }) => ({
      fraction,
      runs: value.runs,
    }));
    kit.note(`entering runs at 0: ${JSON.stringify(entering[0]?.runs)}`);
    kit.check(
      "the check's entrance runs on one clock: at each fraction, every run that scales or cuts it stands at the same time, with the same length, curve and keyframe steps",
      entering.every(
        ({ runs }) =>
          runs.length > 0 &&
          runs.every(
            (run) =>
              run.current === runs[0]?.current &&
              run.duration === runs[0]?.duration &&
              run.easing === runs[0]?.easing &&
              run.steps === runs[0]?.steps
          )
      ),
      JSON.stringify(entering)
    );
    const progress = read.at.map(({ fraction, value: { cut, scale } }) => ({
      fraction,
      cut,
      scale,
      byScale: scale === null ? null : (scale - 0.6) / 0.4,
      byCut: cut === null ? null : 1 - cut / 100,
    }));
    for (const one of progress) {
      kit.note(
        `at ${one.fraction}: scale ${one.scale?.toFixed(4)}, cut ${one.cut?.toFixed(2)}%`
      );
    }
    const [first] = progress;
    const last = progress.at(-1);
    kit.check(
      "at 0, ¼, ½, ¾ and 1, the glyph's scale and its cut say the same progress, from 0.6 and a whole cut to 1 and none",
      progress.every(
        (one) =>
          one.byScale !== null &&
          one.byCut !== null &&
          Math.abs(one.byScale - one.byCut) <= SAME
      ) &&
        Math.abs((first?.byScale ?? -1) - 0) <= SAME &&
        Math.abs((last?.byScale ?? -1) - 1) <= SAME &&
        progress.every(
          (one, i) =>
            i === 0 || (one.byScale ?? 0) >= (progress[i - 1]?.byScale ?? 0)
        ),
      JSON.stringify(progress)
    );
    kit.check(
      "the entrance plays out",
      read.runs.length > 0 && read.runs.every((run) => run.ended),
      JSON.stringify(
        read.runs.map(({ ended, missed, target }) => ({
          target,
          ended,
          missed,
        }))
      )
    );
    // At rest, where the check stands in its slot, to set beside another tree's.
    const rest = await page.evaluate((slot) => {
      const box = document.querySelector(slot)?.getBoundingClientRect();
      const drawn = document
        .querySelector(`${slot} svg`)
        ?.getBoundingClientRect();
      return box && drawn
        ? {
            x: drawn.x - box.x,
            y: drawn.y - box.y,
            w: drawn.width,
            h: drawn.height,
          }
        : null;
    }, SLOT);
    kit.note(`the check at rest in its slot: ${JSON.stringify(rest)}`);
    await page.close();
  },
};
export default spec;
