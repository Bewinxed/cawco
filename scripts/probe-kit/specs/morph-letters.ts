/**
 * A morph step puts into the page one element: its layer of letters, in the
 * box's one cell, never a letter at a time. Each element put in under the
 * root, the body or a floating wrapper restyled its subject when a `:has()`
 * sat there (tab-return 2d: "Node was inserted into tree on SPAN 52x").
 *
 *   bun scripts/probe-kit/run.ts morph-letters
 *
 * The morph-text's own `Morph` (morph.ts), bundled as it is in the tree, on
 * a page that draws its letters as MorphText's style does, through the
 * steps a figure and a status take: a digit that rolls, a word that changes,
 * a step that lands mid-step, and the same with less motion. Each step's
 * runs are caught and scrubbed through the DevTools Animation domain
 * (anim.ts `Clock`: paused, seeked to each fraction) and every letter's
 * place, transform and opacity read there go to `letters.json`, to compare
 * with another tree's morph.
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { bundled } from "../../../packages/core/src/bundled";
import { Clock } from "../anim";
import { type Kit, ROOT, type Spec } from "../kit";

const MORPH = join(
  ROOT,
  "apps/dashboard/src/lib/components/ui/morph-text/morph.ts"
);
const DURATION = 400;
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** Where a step lands on the one before it, as a fraction of its clock. */
const MID = 0.4;

/** Each case: the words it shows, then each step, the last landing mid-step when `mid`. */
interface Case {
  fade?: boolean;
  mid?: boolean;
  name: string;
  steps: string[];
}
const CASES: Case[] = [
  { name: "a figure rolls", steps: ["3m ago", "4m ago", "12m ago"] },
  { name: "a status changes", steps: ["Reading files", "Running 12 tools"] },
  {
    name: "lands mid-step",
    steps: ["Thinking", "Reading", "Writing"],
    mid: true,
  },
  { name: "less motion", steps: ["3 running", "4 running"], fade: true },
];

/** MorphText's letters' box, as its style draws it (morph-text.svelte). */
const STYLE = `
body { margin: 0; font: 16px/1.5 sans-serif; }
.letters { display: inline-grid; overflow-x: clip; }
.letters > * { grid-area: 1 / 1; }
.letters > [data-layer] { white-space: nowrap; }
.letters > [data-layer] > :not(br) { display: inline-block; white-space: pre; }
.letters > [data-layer] > [data-roll] { overflow-x: visible; overflow-y: clip; }
.letters > [data-layer] > [data-roll] > span { display: inline-block; }
`;

interface Put {
  /** Elements put in under the root, by what they say. */
  put: string[];
}

const run = async (kit: Kit) => {
  const entry = join(kit.out, "entry.ts");
  await writeFile(
    entry,
    `import { Morph } from ${JSON.stringify(MORPH)};\n(window as unknown as { Morph: typeof Morph }).Morph = Morph;\n`
  );
  const built = await bundled("morph-letters' page", {
    entrypoints: [entry],
    target: "browser",
  });
  const code = await (built.outputs[0] as Bun.BuildArtifact).text();
  const html = join(kit.out, "morph.html");
  await writeFile(
    html,
    `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body><span id="root" class="letters"></span><script>${code}</script></body></html>`
  );
  const page = await kit.page("desk");
  await page.goto(`file://${html}`);
  const clock = await Clock.on(page);

  /** Every letter as drawn now, from the root's corner. */
  const read = () =>
    page.evaluate(() => {
      const root = document.getElementById("root") as HTMLElement;
      const box = root.getBoundingClientRect();
      return {
        box: [box.width, box.height],
        letters: [...root.querySelectorAll("[data-layer] > :not(br)")].map(
          (el) => {
            const at = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            const inner = el.firstElementChild;
            return {
              said: el.textContent,
              x: Math.round((at.left - box.left) * 100) / 100,
              y: Math.round((at.top - box.top) * 100) / 100,
              transform: style.transform,
              opacity: style.opacity,
              position: style.position,
              roll: inner ? getComputedStyle(inner).transform : null,
            };
          }
        ),
      };
    });

  /** Starts a step to `value` (the first from `from`), counting what it put in. */
  const step = (value: string, from: string | null) =>
    page.evaluate(
      ({ to, was }) => {
        const w = window as unknown as {
          __morph: {
            start: (from: string, to: string) => Promise<boolean>;
            to: (value: string) => Promise<boolean>;
          };
        };
        const root = document.getElementById("root") as HTMLElement;
        const watch = new MutationObserver(() => undefined);
        watch.observe(root, { childList: true });
        if (was === null) {
          w.__morph.to(to);
        } else {
          w.__morph.start(was, to);
        }
        const records = watch.takeRecords();
        watch.disconnect();
        const added = records.flatMap((record) =>
          [...record.addedNodes].filter((node) => node instanceof Element)
        ) as HTMLElement[];
        return { put: added.map((el) => el.textContent ?? "") };
      },
      { to: value, was: from }
    );

  const out: Record<string, unknown[]> = {};
  for (const one of CASES) {
    const [first, ...rest] = one.steps;
    await page.evaluate(
      ({ duration, easing, fade }) => {
        const root = document.getElementById("root") as HTMLElement;
        root.replaceChildren();
        const w = window as unknown as {
          Morph: new (
            root: HTMLElement,
            options: {
              duration: number;
              easing: string;
              fade: boolean;
              wrap: boolean;
            }
          ) => unknown;
          __morph: unknown;
        };
        w.__morph = new w.Morph(root, { duration, easing, fade, wrap: false });
      },
      {
        duration: DURATION,
        easing: EASING,
        fade: one.fade ?? false,
      }
    );
    const read1: unknown[] = [];
    for (const [i, value] of rest.entries()) {
      let put: Put = { put: [] };
      await clock.catchRuns(async () => {
        put = await step(value, i === 0 ? first : null);
      }, "#root");
      const { faults } = clock.oneClock();
      const frames: unknown[] = [];
      for (const fraction of FRACTIONS) {
        await clock.seek(fraction);
        frames.push({ fraction, ...(await read()) });
      }
      read1.push({ to: value, put: put.put.length, frames, faults });
      kit.check(
        `${one.name}, to "${value}": the step puts in its one layer, and runs on one clock`,
        put.put.length === (i === 0 ? 2 : 1) && faults.length === 0,
        `put in ${put.put.length} (${put.put.map((said) => JSON.stringify(said)).join(" ")})${faults.length ? `; ${faults.join("; ")}` : ""}`
      );
      // The next step lands on this one held mid-step, or once it has settled.
      if (one.mid && i + 1 < rest.length) {
        await clock.seek(MID);
      } else {
        await clock.seek(1);
        await clock.release();
        await page.waitForTimeout(DURATION + 100);
      }
    }
    out[one.name] = read1;
  }
  await writeFile(
    join(kit.out, "letters.json"),
    `${JSON.stringify(out, null, 2)}\n`
  );
};

const spec: Spec = {
  group: "Speed",
  name: "morph-letters",
  run,
};
export default spec;
