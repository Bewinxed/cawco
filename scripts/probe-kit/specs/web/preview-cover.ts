/**
 * The preview's loading cover while a sheet's stage starts (PreviewPane
 * `stageWaiting`, CoverState.svelte), on the cover bench
 * (`/motion/cover-state`), read from the engine. The owner, on the pending
 * canvas: "looks very messy, look at the path above spilling out, and the
 * hyperlink thing? this is terrible ux for a loading/pending state".
 *
 * With the stage's folder a deep worktree path, at the phone (390×844, an
 * iPhone's agent on WebKit), at a desk's 523px panel and at a desk's
 * window:
 *  1. The path stands on one row (its box one line tall) inside the cover's
 *     box and inside the line's own, never past their inline end.
 *  2. Too long for its row, its folders go to an ellipsis first and its
 *     last folder stands whole; the whole path is its title.
 *  3. The line holds no link and nothing link-styled: its ink is the
 *     cover's muted ink, no underline.
 *  4. The page said no console error and threw nothing (the bench hub's
 *     own 503s aside).
 *
 *   bun scripts/probe-kit/run.ts web preview-cover
 *   PROBE_ENGINE=webkit bun scripts/probe-kit/run.ts web preview-cover
 */
import { type Kit, kitsOwnMessage, open, type Spec } from "../../kit";

const DIR =
  "/home/bewinxed/.worktrees/cockpit-4f88d663/apps/dashboard/src/lib/cawco/tasks/stage";
const COVER = '[data-bench="cover"]';
const BENCH_HUB_REFUSED =
  /^Failed to load resource: the server responded with a status of 503\b/;

/** Where it is read, and whether its folder is too long for its row there. */
const cases = [
  { view: "phone", w: null, cut: true },
  { view: "desk", w: 523, cut: true },
  { view: "desk", w: null, cut: false },
] as const;

async function readCover(kit: Kit, view: "phone" | "desk", w: number | null) {
  const page = await kit.page(view);
  const errors: string[] = [];
  // The bench has no hub: its stand-in refuses every read (503, kit.ts
  // `benchHub`), which the client's own reads log whatever is open. Every
  // other console error, and anything the page threw, counts.
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !kitsOwnMessage(text) &&
      !BENCH_HUB_REFUSED.test(text)
    ) {
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`${error.name}: ${error.message}`);
  });
  const width = w === null ? "" : `&w=${w}`;
  await open(
    page,
    `${await kit.bench()}/motion/cover-state?dir=${encodeURIComponent(DIR)}${width}`,
    `${COVER} [data-slot="cover-path"]`
  );
  const seen = await page.evaluate((cover) => {
    const box = document.querySelector<HTMLElement>(cover) as HTMLElement;
    const line = box.querySelector<HTMLElement>(
      '[data-slot="cover-state"]'
    ) as HTMLElement;
    const path = box.querySelector<HTMLElement>(
      '[data-slot="cover-path"]'
    ) as HTMLElement;
    const head = path.querySelector<HTMLElement>(
      '[data-slot="cover-path-head"]'
    ) as HTMLElement;
    const tail = path.querySelector<HTMLElement>(
      '[data-slot="cover-path-tail"]'
    ) as HTMLElement;
    const at = path.getBoundingClientRect();
    const inner = box.getBoundingClientRect();
    const padEnd = Number.parseFloat(getComputedStyle(box).paddingInlineEnd);
    const own = line.getBoundingClientRect();
    const read = getComputedStyle(path);
    return {
      window: innerWidth,
      agent: navigator.userAgent.includes("iPhone"),
      text: line.textContent?.trim() ?? "",
      title: path.title,
      rows: Math.round(at.height / Number.parseFloat(read.lineHeight)),
      pastCover: Math.round((at.right - (inner.right - padEnd)) * 10) / 10,
      pastLine: Math.round((at.right - own.right) * 10) / 10,
      headCut: head.scrollWidth > head.clientWidth,
      headEllipsis: getComputedStyle(head).textOverflow,
      tail: tail.textContent,
      tailWhole: tail.scrollWidth <= tail.clientWidth,
      links: line.querySelectorAll("a").length,
      underline: [line, path, head, tail].some(
        (one) => getComputedStyle(one).textDecorationLine !== "none"
      ),
      ink: read.color === getComputedStyle(line).color,
    };
  }, COVER);
  await page.close();
  return { seen, errors };
}

const spec: Spec = {
  name: "preview-cover",
  async run(kit) {
    for (const { view, w, cut } of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      const { seen, errors } = await readCover(kit, view, w);
      const at = `${view}${w === null ? "" : ` ${w}px pane`} (${seen.window}px window${seen.agent ? ", iPhone agent" : ""})`;
      kit.check(
        `1-2: at ${at}, the stage's folder stands on one row inside the cover and its line, ${cut ? "its folders cut to an ellipsis" : "whole on the words' row"} and its last folder whole, the whole path its title`,
        seen.text === `Starting the dev server in ${DIR}…` &&
          seen.title === DIR &&
          seen.rows === 1 &&
          seen.pastCover <= 0 &&
          seen.pastLine <= 0 &&
          seen.headCut === cut &&
          seen.headEllipsis === "ellipsis" &&
          seen.tail === "stage…" &&
          seen.tailWhole,
        JSON.stringify(seen)
      );
      kit.check(
        `3-4: at ${at}, no link and nothing link-styled in the line, the path in the line's own ink, and no console error`,
        seen.links === 0 && !seen.underline && seen.ink && errors.length === 0,
        `links ${seen.links}, underline ${seen.underline}, same ink ${seen.ink}; console errors ${JSON.stringify(errors)}`
      );
    }
  },
};
export default spec;
