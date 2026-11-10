/**
 * Every states file of the dashboard mounts every story without a throw:
 * each drawn as a decision page's Preview draws it (`by=embed`, every
 * story, the stage's column of drawings), inside what the app's root gives
 * its tree (apps/dashboard/.storybook/preview.ts: the tooltip provider,
 * which a kit tooltip reads). ImageDefault's Saved threw "Context
 * \"Tooltip.Provider\" not found" as it mounted (7e299cf91), and nothing
 * mounted every states file to see it.
 *
 * The dashboard's own stage (decision-embeds.ts `startDecisionStage`, no
 * fleet) draws each states file on a desk's window, in Chromium and in
 * WebKit, until it says its shape or why it can't draw (core
 * `CANVAS_EMBED_SIZE`, `CANVAS_EMBED_FAILED`), and {@link AFTER_MS} more;
 * then every drawing that threw, every states file that didn't load, and
 * every page error said while it drew is named. And each says its shape
 * once within {@link AFTER_MS} of its first word, untouched (agent canvas
 * embed.ts: the column is read once a frame went by with nothing laid out
 * anew): a second shape said so soon is a Preview that moved as it was
 * shown. A shape said again soon after one of the story's own fetches
 * answered or one of its pictures loaded or failed (ReportOutputs' files
 * and lazy pictures, read from a hub this stage has none of) is its
 * content arriving, said as it lays out, as it should be.
 *
 *   bun scripts/probe-kit/run.ts web states-mount
 */
import { relative } from "node:path";
import {
  CANVAS_EMBED_FAILED,
  CANVAS_EMBED_SIZE,
} from "../../../../packages/core/src/stage";
import { APP, STAGE_START_MS, startDecisionStage } from "../../decision-embeds";
import type { Kit, Spec } from "../../spec";

/** How long one states file may take to say its shape or why not, its graph's first transform inside it. Ours. */
const SAY_MS = 90_000;
/** How long past its first word a states file is watched for another: past the house's longest motion that ends (`--dur-goo-settle`). Ours. */
const AFTER_MS = 1500;

/** Every states file under the dashboard's src, as the stage finds them (core `STORY_FILE`). */
const FILES = [
  ...new Bun.Glob("src/**/*.stories.{ts,js,tsx,jsx}").scanSync({ cwd: APP }),
].sort();

/**
 * What the embed said to the page holding it (here, itself), each word in
 * order, and when each of the page's own fetches answered or failed and
 * each of its pictures loaded or failed: kept on the window for the read.
 */
function hearSaid(sizeType: string, failedType: string): void {
  const said: unknown[] = [];
  const answered: number[] = [];
  (window as unknown as { __kitSaid: unknown[] }).__kitSaid = said;
  (window as unknown as { __kitAnswered: number[] }).__kitAnswered = answered;
  const asked = window.fetch.bind(window);
  window.fetch = Object.assign(
    (...args: Parameters<typeof fetch>) =>
      asked(...args).finally(() => {
        answered.push(Date.now());
      }),
    window.fetch
  );
  for (const type of ["load", "error"]) {
    addEventListener(
      type,
      (event) => {
        if (event.target instanceof HTMLImageElement) {
          answered.push(Date.now());
        }
      },
      true
    );
  }
  addEventListener("message", (event) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type === sizeType || data?.type === failedType) {
      said.push({ ...data, at: Date.now() });
    }
  });
}

/**
 * Every states file drawn on `engine`, one after another, each in a page of
 * its own (WebKit's one web process, kept through 35 states files' pages,
 * stalled on the 36th): its throws named, and each said its shape once.
 */
async function onEngine(
  kit: Kit,
  engine: "chromium" | "webkit",
  stagePort: number
): Promise<void> {
  const thrown: string[] = [];
  const moved: string[] = [];
  let stories = 0;
  for (const file of FILES) {
    const page = await kit.page("desk", {
      engine,
      theme: "light",
      init: [
        {
          content: `(${hearSaid.toString()})(${JSON.stringify(CANVAS_EMBED_SIZE)}, ${JSON.stringify(CANVAS_EMBED_FAILED)});`,
        },
      ],
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => {
      errors.push(error.message.split("\n")[0] ?? error.message);
    });
    const name = relative("src", file);
    const at = `http://127.0.0.1:${stagePort}/@cawco/canvas?file=${encodeURIComponent(file)}&by=embed`;
    // A cold stage reloads its pages once as Vite optimizes a dependency it first meets: the load is asked again.
    await page
      .goto(at, { waitUntil: "domcontentloaded", timeout: STAGE_START_MS })
      .catch(() =>
        page.goto(at, {
          waitUntil: "domcontentloaded",
          timeout: STAGE_START_MS,
        })
      );
    const said = await page
      .waitForFunction(
        () =>
          (window as unknown as { __kitSaid: unknown[] }).__kitSaid.length > 0,
        undefined,
        { timeout: SAY_MS, polling: 100 }
      )
      .then(
        () => true,
        () => false
      );
    if (said) {
      await page.waitForTimeout(AFTER_MS);
    } else {
      thrown.push(
        `${name}: said neither its shape nor why within ${SAY_MS / 1000} s`
      );
    }
    const read = await page.evaluate(() => ({
      answered: (window as unknown as { __kitAnswered: number[] })
        .__kitAnswered,
      words: (
        window as unknown as {
          __kitSaid: { at: number; height?: number; why?: string }[];
        }
      ).__kitSaid.map((one) => ({
        at: one.at,
        word: one.height ?? one.why ?? "?",
      })),
      drawn: document.querySelectorAll("[data-stage-drawing][data-cawco-story]")
        .length,
      threw: [
        ...document.querySelectorAll<HTMLElement>(
          '[data-stage-drawing][data-cawco-state="failed"]'
        ),
      ].map((body) => {
        const card = body.parentElement?.nextElementSibling;
        const message =
          card?.querySelector(".cawco-stage-failed-message")?.textContent ?? "";
        return `${body.dataset.cawcoStory}: ${message}`;
      }),
      unloaded: [...document.querySelectorAll(".cawco-section-failed")].map(
        (one) => one.textContent?.trim().slice(0, 300) ?? ""
      ),
    }));
    stories += read.drawn;
    const first = read.words[0]?.at ?? 0;
    const soon = read.words.filter(
      (one, place) =>
        one.at - first <= AFTER_MS &&
        (place === 0 ||
          !read.answered.some(
            (when) =>
              when >= (read.words[place - 1]?.at ?? 0) - AFTER_MS &&
              when <= one.at
          ))
    );
    if (soon.length > 1) {
      moved.push(
        `${name}: said ${soon.map((one) => `${one.word} at +${Math.round(one.at - first)} ms`).join(", then ")}`
      );
    }
    thrown.push(
      ...read.threw.map((one) => `${name} ${one}`),
      ...read.unloaded.map((one) => `${name} didn't load: ${one}`),
      ...errors.map((one) => `${name} page error: ${one}`)
    );
    await page.close();
  }
  kit.check(
    `${engine}: every states file of the dashboard (${FILES.length}) mounts every story (${stories}) with no throw`,
    thrown.length === 0,
    thrown.join("\n    ") || undefined
  );
  kit.check(
    `${engine}: each states file says its shape once, untouched (${moved.length} said more)`,
    moved.length === 0,
    moved.join("\n    ") || undefined
  );
}

const spec: Spec = {
  name: "states-mount",
  group: "Previews, pages and comments",
  async run(kit) {
    const stage = await startDecisionStage(new Map(), {});
    try {
      for (const engine of ["chromium", "webkit"] as const) {
        await onEngine(kit, engine, stage.stagePort);
      }
    } finally {
      await stage.stop();
    }
  },
};
export default spec;
