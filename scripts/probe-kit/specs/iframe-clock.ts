/**
 * The clock and a same-origin iframe's first load (anim.ts). A page of its
 * own, served here: a click fades the card in (a CSS transition) and adds
 * a same-origin iframe whose page says it is ready only once its own intro
 * (a Web Animation) has finished, as a page that waits on its entrance does.
 * The same click starts a run on the button and, once it has started, drops it as
 * Svelte aborts a transition (`animation.cancel(); animation.effect = null`):
 * a run the clock must place without asking Blink for its target (the
 * kit's renderer check fails the spec where it crashes). The click runs
 * inside `catchRuns`. In order:
 *
 * 1. The iframe's first load lands and its page says it is ready, the
 *    card's run held all the while: the clock holds the page's runs, never
 *    a child frame's.
 * 2. The card's run is the clock: one run, and seeking it to half its
 *    length draws the card half in.
 * 3. Released, the card's run plays out to its end.
 */
import { Clock } from "../anim";
import { type Kit, type Spec, settle } from "../kit";

const PAGE = `<!doctype html>
<style>
  body { margin: 0; font: 16px sans-serif; }
  .card { width: 320px; height: 200px; opacity: 0; transition: opacity 400ms linear; }
  .card.in { opacity: 1; }
  iframe { width: 300px; height: 150px; border: 0; }
</style>
<button>Open</button>
<div class="card"></div>
<script>
  window.ready = false;
  addEventListener("message", (event) => {
    if (event.data === "ready") window.ready = true;
  });
  document.querySelector("button").addEventListener("click", (event) => {
    const dropped = event.currentTarget.animate(
      [{ opacity: 1 }, { opacity: 0.5 }],
      { duration: 300 }
    );
    dropped.ready.then(() => {
      dropped.cancel();
      dropped.effect = null;
    });
    document.querySelector(".card").classList.add("in");
    const frame = document.createElement("iframe");
    frame.src = "/frame";
    frame.addEventListener("load", () => { window.loaded = true; });
    document.querySelector(".card").append(frame);
  });
</script>`;

const FRAME = `<!doctype html>
<p>framed</p>
<script>
  document.querySelector("p")
    .animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 })
    .finished.then(() => parent.postMessage("ready", "*"));
</script>`;

const probe = async (kit: Kit) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new Response(new URL(request.url).pathname === "/frame" ? FRAME : PAGE, {
        headers: { "content-type": "text/html" },
      }),
  });
  try {
    const page = await kit.page("desk");
    await page.goto(`http://127.0.0.1:${server.port}/`, {
      waitUntil: "load",
    });
    const clock = await Clock.on(page);
    const runs = await clock.catchRuns(() => page.click("button"), ".card");

    const framed = await page
      .waitForFunction(
        () =>
          (window as unknown as { loaded?: boolean; ready: boolean }).loaded &&
          (window as unknown as { ready: boolean }).ready,
        null,
        { timeout: 10_000 }
      )
      .then(
        () => true,
        () => false
      );
    const held = await page.evaluate(() =>
      document
        .querySelector(".card")
        ?.getAnimations()
        .map((run) => `${run.playState} ${run.currentTime}`)
    );
    kit.check(
      "1: the iframe's first load lands and its page is ready, the card's run held",
      framed && held?.length === 1 && held[0] === "paused 0",
      `framed ${framed}; card ${JSON.stringify(held)}`
    );

    await clock.seek(0.5);
    const half = await page.evaluate(() =>
      Number(
        getComputedStyle(document.querySelector(".card") as Element).opacity
      )
    );
    kit.check(
      "2: the card's run is the clock, and at half its length the card is half in",
      runs.length === 1 &&
        runs[0]?.name === "opacity" &&
        clock.length() === 400 &&
        Math.abs(half - 0.5) < 0.01,
      `runs ${JSON.stringify(runs)}; opacity ${half}`
    );

    await clock.release();
    await settle(page);
    const landed = await page.evaluate(() => ({
      opacity: getComputedStyle(document.querySelector(".card") as Element)
        .opacity,
      running: document.getAnimations().length,
    }));
    kit.check(
      "3: released, the card's run plays out to its end",
      landed.opacity === "1" && landed.running === 0,
      JSON.stringify(landed)
    );
  } finally {
    await server.stop(true);
  }
};

const spec: Spec = { name: "iframe-clock", run: probe };
export default spec;
