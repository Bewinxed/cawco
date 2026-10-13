/**
 * The kit's one-clock reading (anim.ts `Clock.oneClock`), on a page of its
 * own served here: two cards whose opacity transitions start together on a
 * press, and two whose second starts a frame after the first. Each press
 * runs inside `catchRuns`, and the reading compares the caught runs' start
 * times as the protocol reported them starting (a held run's page-side
 * `startTime` is null). In order:
 *
 * 1. Started on the same frame, the two runs are one clock, each with a
 *    start time.
 * 2. Started a frame apart, they are not: the reading names the start.
 */
import { Clock } from "../anim";
import { type Kit, type Spec, settle } from "../kit";

const PAGE = `<!doctype html>
<style>
  .card { width: 120px; height: 80px; opacity: 0; transition: opacity 400ms linear; }
  .card.in { opacity: 1; }
</style>
<button class="together">Together</button>
<button class="apart">Apart</button>
<div class="pair together"><div class="card"></div><div class="card"></div></div>
<div class="pair apart"><div class="card"></div><div class="card"></div></div>
<script>
  const cards = (sel) => document.querySelectorAll(sel + " .card");
  document.querySelector("button.together").addEventListener("click", () => {
    for (const card of cards(".pair.together")) card.classList.add("in");
  });
  document.querySelector("button.apart").addEventListener("click", () => {
    const [first, second] = cards(".pair.apart");
    first.classList.add("in");
    // The first starts on the next frame's style pass; the second a frame later.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => second.classList.add("in"))
    );
  });
</script>`;

const probe = async (kit: Kit) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(PAGE, { headers: { "content-type": "text/html" } }),
  });
  try {
    const page = await kit.page("desk");
    await page.goto(`http://127.0.0.1:${server.port}/`, { waitUntil: "load" });
    const clock = await Clock.on(page);

    const together = await clock.catchRuns(
      () => page.click("button.together"),
      ".pair.together"
    );
    const same = clock.oneClock();
    kit.check(
      "1: started on the same frame, the two runs are one clock, each with a start time",
      together.length === 2 &&
        together.every((run) => run.start !== null) &&
        same.faults.length === 0,
      `starts ${together.map((run) => run.start).join(", ")}; ${same.faults.join("; ") || "no faults"}`
    );
    await clock.release();
    await settle(page);

    const apart = await clock.catchRuns(
      () => page.click("button.apart"),
      ".pair.apart"
    );
    const off = clock.oneClock();
    kit.check(
      "2: started a frame apart, the two runs are not one clock",
      apart.length === 2 && off.faults.length === 1,
      `starts ${apart.map((run) => run.start).join(", ")}; ${off.faults.join("; ") || "no faults"}`
    );
    await clock.release();
  } finally {
    await server.stop(true);
  }
};

const spec: Spec = { name: "one-clock", run: probe };
export default spec;
