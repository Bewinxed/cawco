/**
 * The clock (anim.ts `Clock`) keeps a pseudo-element's run when it settles
 * what the page still holds. The protocol names a `::before` run by the
 * pseudo-element's own node, which resolves to a `CSSPseudoElement`; the
 * page's run has the host as its `effect.target` and "::before" as its
 * `effect.pseudoElement`. When a catch's runs outnumber what the page reads
 * (a run whose element left mid-catch), `liveOf` counts each node's held
 * runs, and counted on the target alone the `::before` run read 0 and the
 * clock threw on a page that held it (composer-layers, chromium 680, a
 * parked ask with the plan ring's fill moving, under a full run's load).
 *
 * Here on a page of its own, every time: a button's `::before` fill and a
 * sibling's opacity start one transition each, the clock holds both, and
 * the sibling leaves the document before the catch is read. The catch
 * keeps the `::before` run and lets the gone one go.
 *
 *   bun scripts/probe-kit/run.ts clock-pseudo
 */
import { Clock } from "../../anim";
import type { Spec } from "../../kit";

const SCENE = `<!doctype html>
<style>
  #chip::before { content: ""; display: block; inline-size: 10px; block-size: 10px; background-color: white; transition: background-color 2s linear; }
  #chip.on::before { background-color: black; }
  #gone { transition: opacity 2s linear; }
  #gone.on { opacity: 0; }
</style>
<div id="scene"><button id="chip" type="button">Plan</button><p id="gone">Leaving</p></div>`;

const spec: Spec = {
  name: "clock-pseudo",
  run: async (kit) => {
    const page = await kit.page("desk");
    await page.setContent(SCENE);
    const clock = await Clock.on(page);
    let runs: Awaited<ReturnType<Clock["catchRuns"]>> = [];
    let thrown = "";
    try {
      runs = await clock.catchRuns(async () => {
        await page.evaluate(() => {
          for (const id of ["chip", "gone"]) {
            document.getElementById(id)?.classList.add("on");
          }
        });
        // Both held and placed inside the scene, then the sibling leaves.
        await page.waitForTimeout(300);
        await page.evaluate(() => document.getElementById("gone")?.remove());
      }, "#scene");
    } catch (error) {
      [thrown = ""] = String(error).split("\n");
    }
    const kept = runs.map((one) => `${one.type} ${one.name}`).join(", ");
    const [only] = runs;
    kit.check(
      "clock-pseudo: a held ::before run stays on the clock when a run beside it leaves the document",
      thrown === "" && runs.length === 1 && only?.name === "background-color",
      thrown || `kept: ${kept}`
    );
    await clock.release();
    await page.close();
  },
};
export default spec;
