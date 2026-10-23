/**
 * A conversation's composer parts (transcript/composer-fleet.ts) arrive with
 * what brings them and stand on the composer: each one's first appearance,
 * read from the engine on the benches (no hub).
 *
 *   bun scripts/probe-kit/run.ts web composer-parts
 *
 * A frame loop installed before the page's own scripts notes, for each part
 * watched, the first frame it stands in with a box (counted from the frame
 * the pill first stood in for what comes with the page, and from the task
 * of the action for what an action brings) and its box then; then its box
 * once settled, beside the pill's. At 1440 and 390 in Chromium:
 *
 * - the delegate-tray bench (`?case=4`): the tray and its first chip stand
 *   in the pill's first frame, the tray across the pill's width on its top
 *   edge;
 * - a permission parked on its session: the ask the composer grows into
 *   (Prompt) stands within a frame, across the pill's width on its foot;
 * - a question parked and minimized: its bar stands within a frame, across
 *   the pill's width over its top, Caw's face (CawFace) inside it;
 * - the recall bench: ↑ in the field brings the recall wheel (RecallWheel)
 *   within a frame, across the pill's width, its foot no lower than the
 *   pill's.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one part at a time, on one page
import type { Page } from "playwright-core";
import {
  COMPOSER,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const BENCH = "/motion/delegate-tray?case=4";
const BENCH_SESSION = "delegate-tray-bench";
const LOG = '[data-slot="tr"][role="log"]';
const PILL = 'form[data-slot="cin"]';
const TRAY = '[data-slot="tray"]:not([data-composer-away])';
const CHIP = `${TRAY} [data-tray-chip]`;
const ASK = '[data-slot="ask"]';
const CARD = `${ASK} > *`;
const BAR = '[data-slot="asked-chip"]';
const FACE = `${BAR} [data-box]`;
const WHEEL = '[data-slot="ghosts"]';

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** One part's first appearance and its settled box. */
interface Read {
  box: Box | null;
  frame: number | null;
  settled: Box | null;
}

type Reads = Record<string, Read>;

/** The frame loop: `__parts.watch(selectors)` starts a count, and each selector's first frame with a box is noted. */
const FRAMES = () => {
  const seen: Record<string, { frame: number; box: Box }> = {};
  let watched: string[] = [];
  let frame = 0;
  let from = 0;
  const tick = () => {
    frame += 1;
    for (const selector of watched) {
      if (seen[selector]) {
        continue;
      }
      const el = document.querySelector(selector);
      const rect = el?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        seen[selector] = {
          frame: frame - from,
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        };
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  Object.assign(globalThis, {
    __parts: {
      seen,
      watch: (selectors: readonly string[]) => {
        for (const selector of selectors) {
          delete seen[selector];
        }
        watched = [...watched, ...selectors];
        from = frame;
      },
    },
  });
};

interface Parts {
  seen: Record<string, { frame: number; box: Box }>;
  watch: (selectors: readonly string[]) => void;
}

const boxOf = (page: Page, selector: string): Promise<Box | null> =>
  page.evaluate((sel) => {
    const rect = document.querySelector(sel)?.getBoundingClientRect();
    return rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  }, selector);

/** Each selector's first appearance, counted from `base` (a selector whose first frame is the count's start), and its box now. */
async function readAll(
  page: Page,
  selectors: string[],
  base?: string
): Promise<Reads> {
  const seen = await page.evaluate(
    () => (globalThis as unknown as { __parts: Parts }).__parts.seen
  );
  const start = base ? (seen[base]?.frame ?? 0) : 0;
  const reads: Reads = {};
  for (const selector of selectors) {
    const first = seen[selector];
    reads[selector] = {
      frame: first ? first.frame - start : null,
      box: first?.box ?? null,
      settled: await boxOf(page, selector),
    };
  }
  return reads;
}

/** Parks an ask on the bench's session (a permission, or a question), or takes it back; the count for `watched` starts in the same task. */
const park = (
  page: Page,
  kind: "permission" | "question" | null,
  watched: string[] = []
) =>
  page.evaluate(
    ([id, what, list]) => {
      (globalThis as unknown as { __parts: Parts }).__parts.watch(
        list as string[]
      );
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: { sessions: Record<string, { pending: unknown[] }> };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[id as string];
      if (!session) {
        throw new Error(`no session ${id}`);
      }
      const presentation = {
        asker: "",
        changes: [],
        command: what === "permission" ? "bun run lint:changed" : "",
        fields: [],
        project: "cockpit",
        summary: "Lint the files this change touched",
      };
      const permission = {
        heard: 0,
        input: { command: "bun run lint:changed" },
        instanceId: id,
        presentation,
        requestId: "composer-parts-ask",
        toolName: "Bash",
      };
      const question = {
        heard: 0,
        input: {
          questions: [
            {
              question: "Which voice should the notes take?",
              header: "Voice",
              multiSelect: false,
              options: [
                { label: "Plain", description: "Say it plainly." },
                { label: "Warm", description: "Say it warmly." },
              ],
            },
          ],
        },
        instanceId: id,
        presentation,
        requestId: "composer-parts-question",
        toolName: "AskUserQuestion",
      };
      const parked = { permission, question } as const;
      session.pending = what ? [parked[what]] : [];
    },
    [BENCH_SESSION, kind, watched] as const
  );

const LEGS: { view: View; name: string }[] = [
  { view: "desk", name: "1440" },
  { view: "phone", name: "390" },
];

async function leg(
  kit: Kit,
  base: string,
  view: View
): Promise<{ reads: Record<string, Reads>; thrown: string[] }> {
  const reads: Record<string, Reads> = {};
  const thrown: string[] = [];
  const page = await kit.page(view, { init: [FRAMES] });
  page.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
  await page.addInitScript(
    (list) => (globalThis as unknown as { __parts: Parts }).__parts.watch(list),
    [PILL, TRAY, CHIP]
  );
  await open(page, `${base}${BENCH}`, LOG, 120_000);
  await page.waitForSelector(CHIP, { timeout: 30_000 });
  await settle(page, 800);
  reads.load = await readAll(page, [PILL, TRAY, CHIP], PILL);

  await park(page, "permission", [ASK, CARD]);
  await page.waitForSelector(CARD, { timeout: 15_000 });
  await settle(page, 800);
  reads.permission = await readAll(page, [ASK, CARD, PILL]);
  await park(page, null);
  await settle(page, 800);

  await park(page, "question");
  await page.waitForSelector('button[aria-label="Minimize question"]', {
    timeout: 15_000,
  });
  await settle(page, 800);
  // The count starts in the task that presses it.
  await page.evaluate(
    (list) => {
      (globalThis as unknown as { __parts: Parts }).__parts.watch(list);
      document
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Minimize question"]'
        )
        ?.click();
    },
    [BAR, FACE]
  );
  await page.waitForSelector(BAR, { timeout: 15_000 });
  await settle(page, 800);
  reads.question = await readAll(page, [BAR, FACE, PILL]);
  await park(page, null);
  await page.close();

  const recall = await kit.page(view, { init: [FRAMES] });
  recall.on("pageerror", (error) => thrown.push(error.message.slice(0, 300)));
  await open(recall, `${base}/motion/recall`, COMPOSER, 120_000);
  await settle(recall, 800);
  await recall.locator(COMPOSER).click();
  // ↑ in the field, the count starting in the task that presses it.
  await recall.evaluate(
    ([list, field]) => {
      (globalThis as unknown as { __parts: Parts }).__parts.watch(list);
      document.querySelector(field)?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          code: "ArrowUp",
          bubbles: true,
          cancelable: true,
        })
      );
    },
    [[WHEEL], COMPOSER] as const
  );
  await recall.waitForSelector(WHEEL, { timeout: 15_000 });
  await settle(recall, 800);
  reads.recall = await readAll(recall, [WHEEL, PILL]);
  await recall.keyboard.press("Escape");
  await recall.close();
  return { reads, thrown };
}

const said = (box: Box | null) =>
  box
    ? `${box.x.toFixed(1)},${box.y.toFixed(1)} ${box.width.toFixed(1)}×${box.height.toFixed(1)}`
    : "none";

/** Within half a pixel. */
const at = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/** The part's settled box spans the pill's width. */
const across = (part: Box | null, pill: Box | null) =>
  !!part && !!pill && at(part.x, pill.x) && at(part.width, pill.width);

const inside = (inner: Box | null, outer: Box | null) =>
  !!inner &&
  !!outer &&
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  inner.x + inner.width <= outer.x + outer.width + 0.5 &&
  inner.y + inner.height <= outer.y + outer.height + 0.5;

const foot = (box: Box) => box.y + box.height;

/** One leg's rules over its reads. */
function judge(kit: Kit, name: string, reads: Record<string, Reads>): void {
  /** One part's read in one state; none when that state never ran. */
  const pick = (state: string, selector: string): Read | undefined =>
    (reads[state] as Reads | undefined)?.[selector];
  const line = (read: Read | undefined) =>
    `frame ${read?.frame}, first ${said(read?.box ?? null)}, settled ${said(read?.settled ?? null)}`;
  const tray = pick("load", TRAY);
  const chip = pick("load", CHIP);
  const pillAt = pick("load", PILL)?.settled ?? null;
  kit.check(
    `${name}: the tray and its first chip stand in the pill's first frame, the tray across the pill's width on its top edge`,
    tray?.frame === 0 &&
      chip?.frame === 0 &&
      across(tray.settled, pillAt) &&
      !!tray.settled &&
      !!pillAt &&
      at(foot(tray.settled), pillAt.y),
    `tray ${line(tray)}; chip ${line(chip)}; pill ${said(pillAt)}`
  );
  const ask = pick("permission", ASK);
  const askPill = pick("permission", PILL)?.settled ?? null;
  kit.check(
    `${name}: a parked permission's ask stands within a frame, across the pill's width on its foot`,
    ask?.frame !== null &&
      (ask?.frame ?? 2) <= 1 &&
      across(ask?.settled ?? null, askPill) &&
      !!ask?.settled &&
      !!askPill &&
      at(foot(ask.settled), foot(askPill)),
    `ask ${line(ask)}; pill ${said(askPill)}`
  );
  const bar = pick("question", BAR);
  const face = pick("question", FACE);
  const barPill = pick("question", PILL)?.settled ?? null;
  kit.check(
    `${name}: a minimized question's bar stands within a frame, across the pill's width over its top, Caw's face inside it`,
    (bar?.frame ?? 2) <= 1 &&
      (face?.frame ?? 2) <= 1 &&
      across(bar?.settled ?? null, barPill) &&
      !!bar?.settled &&
      !!barPill &&
      foot(bar.settled) <= barPill.y + 0.5 &&
      inside(face?.settled ?? null, bar.settled),
    `bar ${line(bar)}; face ${line(face)}; pill ${said(barPill)}`
  );
  const wheel = pick("recall", WHEEL);
  const wheelPill = pick("recall", PILL)?.settled ?? null;
  kit.check(
    `${name}: ↑ brings the recall wheel within a frame, across the pill's width, its foot no lower than the pill's`,
    (wheel?.frame ?? 2) <= 1 &&
      across(wheel?.settled ?? null, wheelPill) &&
      !!wheel?.settled &&
      !!wheelPill &&
      foot(wheel.settled) <= foot(wheelPill) + 0.5,
    `wheel ${line(wheel)}; pill ${said(wheelPill)}`
  );
}

const run = async (kit: Kit) => {
  const base = await kit.bench();
  for (const { view, name } of LEGS) {
    const { reads, thrown } = await leg(kit, base, view);
    kit.check(
      `${name}: no page error while the parts come and go`,
      thrown.length === 0,
      thrown.join(" | ")
    );
    judge(kit, name, reads);
  }
};

const spec: Spec = { name: "composer-parts", run };
export default spec;
