/**
 * Caw's open in WebKit, frame by frame under a finger (owner: "the pressing
 * on caw is very laggy when it opens and not smooth"): a scratch fleet whose
 * machine landed a nightly with notes, so his panel holds the update alone,
 * its notes open; the built dashboard against its hub in Playwright's WebKit
 * at 390×844, touch, 3x, a tapped button taking no focus (an iPhone's
 * shape). Twenty taps, each watched for 2.6s from the press (the open, his
 * smile in and back out), each closed and let rest before the next. Runtime
 * cadence (frames.ts, requestAnimationFrame from the frame before the tap):
 *
 *  - the panel opens on every tap;
 *  - no interval in any open is over 25ms (a 60Hz frame and a half: a
 *    dropped frame), the press's own frame included. The longest four are
 *    named with what the page's own code did inside each (`attribute`):
 *    WebKit through Playwright has no performance trace.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { attribute, ourWork, tell, watch, watched } from "../../frames";
import { open, type Spec } from "../../kit";

const RUNS = 20;
const DROPPED_MS = 25;
const WATCH_MS = 2600;
const REST_MS = 2600;
const SOURCE_VERSION = "0.0.0-dev";
const NOTES = [
  "### New",
  "",
  "- Caw's panel says what each notice is and what to do about it",
  "- Clear all in the Notices head",
  "- Moved logins name their provider and how many machines lack them",
  "- The update's notes fold in its row, open when it stands alone",
  "",
  "### Improved",
  "",
  "- Deny and Approve stand together, tinted by what they do",
  "- An ask leads with its project, and its machine by its mark",
  "",
  "### Fixed",
  "",
  '- "Sign in there" pointed at the wrong machine',
  "- Notices hid under the panel's foot",
].join("\n");

/**
 * A tapped button takes no focus, as on the iPhone: "Most browsers do give
 * focus to a button being clicked, but Safari does not, by design" (MDN,
 * <button>, Clicking and focus). Playwright's Linux WebKit does.
 */
function noButtonFocus() {
  window.addEventListener(
    "mousedown",
    (event) => {
      if ((event.target as Element | null)?.closest("button")) {
        event.preventDefault();
      }
    },
    { capture: true }
  );
}

const spec: Spec = {
  name: "webkit-caw",
  run: async (kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 10, words: ["Done."] }));
    const binary = join(fleet.home, ".local", "share", "cawco", "binary");
    await mkdir(binary, { recursive: true });
    await writeFile(
      join(binary, "installation.json"),
      JSON.stringify({
        hubUrl: "http://127.0.0.1:9",
        installedVersion: SOURCE_VERSION,
        role: "agent",
        root: binary,
      })
    );
    const landedAt = Date.now() - 60_000;
    await writeFile(
      join(binary, "update-state.json"),
      JSON.stringify({
        channel: "nightly",
        installedVersion: SOURCE_VERSION,
        hostsHub: false,
        phase: "installed",
        updatedAt: landedAt,
        keeperFailedVersion: SOURCE_VERSION,
        sessiondVersion: SOURCE_VERSION,
        landed: {
          at: landedAt,
          outcome: "installed",
          version: "0.2.0-nightly.2522+e3cbba1d",
          notes: NOTES,
        },
      })
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    const page = await kit.page("phone", {
      engine: "webkit",
      scale: 3,
      init: [watch, attribute, noButtonFocus],
    });
    await open(page, await fleet.dashboard(), "[data-needs-caw]", 90_000);
    await page.waitForFunction(
      () =>
        document
          .querySelector("[data-needs-caw]")
          ?.getAttribute("aria-label")
          ?.includes("notice") === true,
      undefined,
      { timeout: 90_000 }
    );
    const box = await page.locator("[data-needs-caw]").boundingBox();
    if (!box) {
      throw new Error("Caw has no box");
    }
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    // Fonts, the first snapshot, his face drawn ahead.
    await page.waitForTimeout(3000);
    const opened: boolean[] = [];
    /** Each open's frame intervals, with what our own code did inside each. */
    const runs: { at: number; ms: number; ours: number; heaviest: string }[][] =
      [];
    for (let n = 0; n < RUNS; n += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one open at a time, each from rest
      await tell(page, { rafs: [], calls: [], tap: -1, cadence: true });
      // Frames drawn before the tap too, so the one it lands in is measured.
      await page.waitForTimeout(150);
      await page.touchscreen.tap(at.x, at.y);
      await page.waitForTimeout(WATCH_MS);
      const seen = await watched(page);
      await tell(page, { cadence: false });
      const before = seen.rafs.findLastIndex((t) => t <= seen.tap);
      const frames = seen.rafs.slice(Math.max(0, before));
      const intervals = frames.slice(1).map((t, k) => {
        const from = frames[k] as number;
        const work = ourWork(seen.calls, from, t);
        return {
          at: from - seen.tap,
          ms: t - from,
          ours: work.ms,
          heaviest: work.heaviest,
        };
      });
      opened.push(
        await page.evaluate(
          () =>
            document.querySelector(".caw-pop[data-state=open][data-shown]") !==
            null
        )
      );
      await page.touchscreen.tap(at.x, at.y);
      // The close's own smile in and out land before the next open.
      await page.waitForTimeout(REST_MS);
      runs.push(intervals);
    }
    kit.check(
      `the panel opens on every tap (${RUNS})`,
      opened.every(Boolean),
      `${opened.filter(Boolean).length} of ${RUNS} opened`
    );
    // The longest intervals, each with what our code did inside it, so a
    // dropped frame says whose it was.
    const longest = runs
      .flatMap((intervals, n) => intervals.map((one) => ({ ...one, n })))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 4);
    const worst = longest[0]?.ms ?? 0;
    kit.check(
      `no interval over ${DROPPED_MS}ms in any of ${RUNS} opens`,
      worst <= DROPPED_MS,
      `longest: ${longest
        .map(
          (one) =>
            `${one.ms.toFixed(0)}ms at +${one.at.toFixed(0)} in open ${one.n} (our code ${one.ours.toFixed(0)}ms${one.ours > 0 ? `, ${one.heaviest}` : ""})`
        )
        .join("; ")}`
    );
  },
};
export default spec;
