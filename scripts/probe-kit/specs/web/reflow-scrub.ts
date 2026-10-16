/**
 * A `reflow` list's motion on the clock (motion/rows `reflow`), on the
 * folder-tabs bench's Working list (WorkTabs), on the desk: a row put in at
 * the list's head arrives and the rows under it slide down to make its room,
 * every run caught as it starts and held (anim.ts), then read at 0, 50 and
 * 100% of the batch: each marked row's top in the list, and its opacity.
 *
 * A reading, not a gate: it is what the list's motion is compared by before
 * and after a change to when its places are read (the change heard, the
 * frame's callbacks reading them).
 */
import { Clock } from "../../anim";
import { type Kit, open, type Spec, settle } from "../../kit";

const ROUTE = "/motion/folder-proof?at=1&work=working";
const LIST = '[data-strip="work"] [data-reflow]';
const PCTS = [0, 0.5, 1];
/** A reflow's runs are a panel's length or a pop's; longer is something else's. */
const BATCH_MS = 2000;

async function read(kit: Kit): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}${ROUTE}&theme=light`,
    `${LIST} [data-flip]`,
    120_000
  );
  await settle(page, 800);
  const clock = await Clock.on(page);
  const runs = await clock.catchRuns(
    () =>
      page.evaluate((sel) => {
        const list = document.querySelector<HTMLElement>(sel);
        const row = list?.querySelector<HTMLElement>("[data-flip]");
        if (!row) {
          return;
        }
        const twin = row.cloneNode(true) as HTMLElement;
        for (const node of [twin, ...twin.querySelectorAll("[data-share]")]) {
          node.removeAttribute("data-share");
        }
        twin.dataset.probeTwin = "";
        row.before(twin);
      }, LIST),
    LIST
  );
  kit.note(
    `reflow-scrub: runs (kind, name, length, easing): ${[
      ...new Set(
        runs.map(
          (one) =>
            `${one.type} ${one.name || "-"} ${Math.round(one.end)}ms ${one.easing}`
        )
      ),
    ].join("; ")} (${runs.length} in all)`
  );
  // The batch's own clock: the list's loops (a skeleton's sweep, 19.2s)
  // started beside it are not its motion and would stretch every reading
  // past it.
  clock.runs = runs.filter((one) => !one.loop && one.end < BATCH_MS);
  const at: string[] = [];
  for (const f of PCTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one point of the clock at a time
    await clock.seek(f);
    at.push(
      `${f * 100}%: ${await page.evaluate((sel) => {
        const list = document.querySelector<HTMLElement>(sel);
        if (!list) {
          return "no list";
        }
        const { top } = list.getBoundingClientRect();
        return [...list.querySelectorAll<HTMLElement>("[data-flip]")]
          .slice(0, 6)
          .map(
            (row) =>
              `${(row.getBoundingClientRect().top - top).toFixed(1)}@${Number(getComputedStyle(row).opacity).toFixed(2)}`
          )
          .join(" ");
      }, LIST)}`
    );
  }
  kit.note(
    `reflow-scrub: each row's top in the list @ opacity, by seek: ${at.join(" | ")}`
  );
  await clock.release();
  await page.close();
}

/**
 * A row put in from a frame's callbacks: by the end of that frame (a task
 * queued from the callbacks runs after its paint) the row it was put in
 * front of is still drawn where it stood, held there for its slide down,
 * not where it jumped to. Read on a page of its own, before any clock holds
 * its runs.
 */
async function movesInFrame(kit: Kit): Promise<void> {
  const page = await kit.page("desk", { theme: "light" });
  await open(
    page,
    `${await kit.bench()}${ROUTE}&theme=light`,
    `${LIST} [data-flip]`,
    120_000
  );
  // A fixed wait: the list's own loops never land.
  await page.waitForTimeout(1200);
  const started = await page.evaluate(
    (sel) =>
      new Promise<string>((done) => {
        // No frame came in 3s: said, not waited on.
        setTimeout(() => done("no frame in 3s"), 3000);
        requestAnimationFrame(() => {
          try {
            const list = document.querySelector<HTMLElement>(sel);
            // A row, not a group of them: a marked box with no marked box in it.
            const row = [
              ...(list?.querySelectorAll<HTMLElement>("[data-flip]") ?? []),
            ].find((one) => !one.querySelector("[data-flip]"));
            if (!(list && row)) {
              done("no list");
              return;
            }
            const twin = row.cloneNode(true) as HTMLElement;
            for (const node of [
              twin,
              ...twin.querySelectorAll("[data-share]"),
            ]) {
              node.removeAttribute("data-share");
            }
            const was = row.getBoundingClientRect().top;
            row.before(twin);
            // Where it is drawn at the end of this frame, and of the next.
            setTimeout(() => {
              const first = row.getBoundingClientRect().top - was;
              requestAnimationFrame(() =>
                setTimeout(() => {
                  const second = row.getBoundingClientRect().top - was;
                  const laid = twin.getBoundingClientRect().height;
                  done(
                    JSON.stringify({
                      first: Number(first.toFixed(1)),
                      second: Number(second.toFixed(1)),
                      laid: Number(laid.toFixed(1)),
                    })
                  );
                })
              );
            });
          } catch (error) {
            done(`threw: ${String(error)}`);
          }
        });
      }),
    LIST
  );
  // Moved in that frame, the row under it starts its slide there, and the
  // next frame takes it a step on; moved a frame late, that frame drew it
  // where it jumped to and the next snaps it back by the row's height.
  let step = Number.NaN;
  let laid = Number.NaN;
  try {
    const frames = JSON.parse(started) as {
      first: number;
      laid: number;
      second: number;
    };
    step = Math.abs(frames.second - frames.first);
    ({ laid } = frames);
  } catch {
    // Not a reading: said below as it came.
  }
  kit.check(
    "reflow-scrub: a row put in from a frame's callbacks: the row under it moves in that frame, no jump between its first two frames",
    Number.isFinite(step) && step < laid / 2,
    `drawn from where it stood at the end of that frame and the next: ${started}`
  );
  await page.close();
}

const spec: Spec = {
  name: "reflow-scrub",
  run: async (kit) => {
    try {
      await movesInFrame(kit);
      await read(kit);
      kit.check("reflow-scrub: reads to its end", true, "");
    } catch (error) {
      kit.check(
        "reflow-scrub: reads to its end",
        false,
        String(error).split("\n")[0]
      );
    }
  },
};
export default spec;
