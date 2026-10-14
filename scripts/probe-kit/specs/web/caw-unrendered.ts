/**
 * Caw goes from a canvas that is not being rendered (the live dashboard,
 * 2026-10-14: "Failed to execute 'commitStyles' on 'Animation': Target
 * element is not rendered", in a transcript that re-rendered after a
 * /compact while its compaction divider's Caw at work was leaving). His
 * fade out writes his fade in's present values into the canvas's style so
 * it starts from where he is; `commitStyles()` throws InvalidStateError on
 * a target that is not rendered (MDN, Animation.commitStyles).
 *
 * On the Caw bench (/motion/caw, the real `Caw`), with less motion (every
 * file fades in) and with full motion (a file with no drawn enter), his
 * fade in held at its middle, then:
 *
 *  - rendered: `leave` writes the fade's middle into the canvas's style and
 *    the fade out starts from it;
 *  - in a hidden subtree (`display: none` on the stage): `leave` throws
 *    nothing, writes nothing, runs a fade out to opacity 0, and he is gone
 *    (`ongone`) with no canvas left;
 *  - detached (the stage taken off the page): throws nothing, writes
 *    nothing, and he is gone;
 *  - a status change while hidden, the stage shown again after: the old
 *    file goes, and the new one is the only canvas, at opacity 1.
 *
 * Every case: nothing reported to the hub, no uncaught exception, and no
 * console error but the bench's absent hub.
 *
 *   bun scripts/probe-kit/run.ts web caw-unrendered
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each motion and case is read in order, case by case.
// biome-ignore-all lint/performance/noAwaitInLoops: one Caw on one bench at a time, each case from a fresh page.
import type { Page } from "playwright-core";
import { type Kit, open, type Spec } from "../../kit";
import { emulateMotion } from "../../motion";

interface Bench {
  change: (next: string) => void;
  leave: () => void;
  log: () => { what: string }[];
  mount: (first: string) => void;
}
declare global {
  interface Window {
    __caw: Bench;
  }
}

const FADING = ".stage canvas.shown";

/**
 * Mounts `status` and holds his fade in at its middle. False when the file
 * has a drawn enter, so there is no fade in to hold.
 */
async function heldFadeIn(page: Page, status: string): Promise<boolean> {
  await page.evaluate((first) => window.__caw.mount(first), status);
  await page.waitForSelector(FADING, { timeout: 30_000 });
  return page.evaluate((selector) => {
    const canvas = document.querySelector(selector) as HTMLCanvasElement;
    const [fade] = canvas.getAnimations();
    if (!fade) {
      return false;
    }
    fade.pause();
    const end = Number(fade.effect?.getComputedTiming().endTime ?? 0);
    fade.currentTime = end / 2;
    return true;
  }, FADING);
}

/**
 * The bench runs against no hub: its socket and its API calls fail, and
 * say so in the console. Nothing else is expected there.
 */
const NO_HUB = /\/ws\/dashboard|status of 502 \(Bad Gateway\)/;

/**
 * Every error on `page` from now on: what the dashboard reports to the hub
 * (hooks.client.ts posts each to /api/dashboard-errors, the channel the live
 * error came in on), every uncaught exception, and every console error but
 * the bench's absent hub.
 */
async function errorsOn(page: Page): Promise<string[]> {
  const said: string[] = [];
  await page.route("**/api/dashboard-errors", async (route) => {
    said.push(`reported: ${route.request().postData() ?? ""}`);
    await route.fulfill({ status: 204 });
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !NO_HUB.test(message.text())) {
      said.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => said.push(`pageerror: ${error.message}`));
  return said;
}

const gone = (page: Page) =>
  page.waitForFunction(
    () => window.__caw.log().some((entry) => entry.what === "gone"),
    null,
    { timeout: 10_000 }
  );

/** The canvas's committed opacity, and its fade out's start, end and fill. */
const fadeOut = (page: Page, selector: string) =>
  page.evaluate((at) => {
    const canvas = document.querySelector(at) as HTMLCanvasElement | null;
    const runs = canvas?.getAnimations() ?? [];
    const run = runs.at(-1);
    const frames = (run?.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
    return {
      committed: canvas?.style.opacity ?? null,
      runs: runs.length,
      fill: run?.effect?.getComputedTiming().fill ?? null,
      end: frames.at(-1)?.opacity ?? null,
    };
  }, selector);

const run = async (kit: Kit) => {
  const base = await kit.bench();
  for (const motion of ["reduce", "no-preference"] as const) {
    const label = motion === "reduce" ? "less motion" : "full motion";
    const page = await kit.page("desk");
    await emulateMotion(page, motion);
    const errors = await errorsOn(page);
    const fresh = async () => {
      await open(page, `${base}/motion/caw`, () => "__caw" in window);
    };
    // A file with no drawn enter: with less motion, any; with full motion,
    // the first of the bench's that fades in.
    let status: string | undefined;
    for (const each of ["loading", "reconnecting", "needs-you", "ready"]) {
      await fresh();
      if (await heldFadeIn(page, each)) {
        status = each;
        break;
      }
    }
    if (!status) {
      kit.note(`${label}: every bench file has a drawn enter, no fade to hold`);
      continue;
    }

    // ── rendered: the fade's middle is written, the fade out starts there ──
    await page.evaluate(() => window.__caw.leave());
    const rendered = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement;
      const [out] = canvas.getAnimations();
      out?.pause();
      if (out) {
        out.currentTime = 0;
      }
      return {
        committed: canvas.style.opacity,
        start: getComputedStyle(canvas).opacity,
      };
    }, FADING);
    const middle = Number(rendered.committed);
    kit.check(
      `${label}, ${status}, rendered: the fade in's middle is committed and the fade out starts from it`,
      middle > 0 &&
        middle < 1 &&
        Math.abs(Number(rendered.start) - middle) < 0.01,
      `committed ${rendered.committed}, fade out starts at ${rendered.start}`
    );

    // ── hidden, then detached: nothing thrown, he fades to 0 and is gone ──
    for (const how of ["hidden", "detached"] as const) {
      await fresh();
      await heldFadeIn(page, status);
      const before = errors.length;
      await page.evaluate((way) => {
        const stage = document.querySelector(".stage") as HTMLElement;
        if (way === "hidden") {
          stage.style.display = "none";
        } else {
          (window as unknown as { kitStage: HTMLElement }).kitStage = stage;
          stage.remove();
        }
        window.__caw.leave();
      }, how);
      // Detached, the canvas is read through the stage the page let go of.
      const out = await page.evaluate((way) => {
        const stage =
          way === "hidden"
            ? document.querySelector(".stage")
            : (window as unknown as { kitStage: HTMLElement }).kitStage;
        const canvas = stage?.querySelector(
          "canvas.shown"
        ) as HTMLCanvasElement | null;
        const runs = canvas?.getAnimations() ?? [];
        const last = runs.at(-1);
        const frames =
          (last?.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
        return {
          committed: canvas?.style.opacity ?? null,
          runs: runs.length,
          fill: last?.effect?.getComputedTiming().fill ?? null,
          end: frames.at(-1)?.opacity ?? null,
        };
      }, how);
      const left = await gone(page)
        .then(() => true)
        .catch(() => false);
      const canvases = await page.evaluate(
        (way) =>
          (way === "hidden"
            ? document.querySelector(".stage")
            : (window as unknown as { kitStage: HTMLElement }).kitStage
          )?.querySelectorAll("canvas").length ?? null,
        how
      );
      const thrown = errors.slice(before);
      // A detached element answers no animations (getAnimations() reads the
      // document's), so its fade out is read by its end alone: gone.
      const faded =
        how === "detached" ||
        (out.runs === 1 && Number(out.end) === 0 && out.fill === "forwards");
      kit.check(
        how === "hidden"
          ? `${label}, ${status}, hidden: no error, nothing committed, one fade out to opacity 0, then gone`
          : `${label}, ${status}, detached: no error, nothing committed, then gone`,
        thrown.length === 0 &&
          out.committed === "" &&
          faded &&
          left &&
          canvases === 0,
        `${JSON.stringify(out)}; gone ${left}; ${canvases} canvases; ${thrown.join(" | ") || "no errors"}`
      );
    }

    // ── a change while hidden, shown again: the new file alone, at 1 ──
    await fresh();
    await heldFadeIn(page, status);
    const before = errors.length;
    const next = status === "ready" ? "loading" : "ready";
    await page.evaluate((to) => {
      (document.querySelector(".stage") as HTMLElement).style.display = "none";
      window.__caw.change(to);
    }, next);
    // The old file's fade out ends, the new file mounts, hidden, and loads.
    const landed = await page
      .waitForFunction(
        () =>
          document.querySelectorAll(".stage canvas").length === 1 &&
          document.querySelector(".stage canvas.shown") !== null &&
          document.querySelector(".stage canvas.shown")?.getAnimations()
            .length === 0,
        null,
        { timeout: 10_000 }
      )
      .then(() => true)
      .catch(() => false);
    await page.evaluate(() => {
      const stage = document.querySelector(".stage") as HTMLElement | null;
      if (stage) {
        stage.style.display = "";
      }
    });
    const shown = await fadeOut(page, FADING);
    const opacity = await page.evaluate((selector) => {
      const canvas = document.querySelector(selector);
      return canvas ? getComputedStyle(canvas).opacity : null;
    }, FADING);
    const thrown = errors.slice(before);
    kit.check(
      `${label}, ${status} → ${next} while hidden, shown again: no error, the new file alone at opacity 1`,
      landed &&
        thrown.length === 0 &&
        shown.runs === 0 &&
        shown.committed === "" &&
        opacity === "1",
      `${JSON.stringify(shown)}; opacity ${opacity}; ${thrown.join(" | ") || "no errors"}`
    );
    kit.check(
      `${label}: no console error or uncaught exception on the page`,
      errors.length === 0,
      errors.join(" | ") || "none"
    );
  }
};

export default { name: "caw-unrendered", run } satisfies Spec;
