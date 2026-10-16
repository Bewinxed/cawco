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

const spec: Spec = {
  name: "reflow-scrub",
  run: async (kit) => {
    try {
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
