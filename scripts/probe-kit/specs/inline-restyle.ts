/**
 * A value that changes while its element is mounted restyles that element,
 * not everything under it: written inline as the standard property main
 * wrote it (282054d12), never as an inherited custom property a utility
 * reads. Run on this tree and on main's, the elements restyled per change
 * are main's.
 *
 *   bun scripts/probe-kit/run.ts inline-restyle
 *
 * One pane at the desk on a scratch fleet, three sessions as its tabs. Each
 * interaction is read off a DevTools trace from the act to `SETTLE_MS` past
 * it: the elements its style passes restyled (`UpdateLayoutTree`), and how
 * many times the element that carries the value had its inline style
 * written (a MutationObserver on its `style`).
 *
 * 1. The shell as the window resizes: its height is the visible area's
 *    bottom (visible-viewport `floor`), so every step of the window's height
 *    writes it.
 * 2. The session's card as it moves between tabs: the pointer on one tab
 *    opens its details card, then onto the other, whose details stand
 *    taller; the card's morph takes the new height.
 * 3. The composer's offer stack: a plain session in a repository another
 *    session works in is offered, at its turn's end, to become a project
 *    (project-offers.ts `repo`), and the stack takes the offer's height; put
 *    off ("Not now"), it gives it back.
 *
 * Every number is written to `numbers.json`; nothing is asserted here, the
 * two trees' numbers are compared beside each other.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one change at a time, as a person makes them
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { SCROLLER, traceMain } from "../frames";
import { type Kit, open, type Spec } from "../kit";

/** After an act, for its frames, transitions and the morph to run out. */
const SETTLE_MS = 1500;
/** The window's height steps, px from the desk's own. */
const STEPS = [-80, 0, -160, 0];
/** The scratch repository's origin, as a remote a project can be keyed by. */
const REMOTE = "https://example.com/probe/inline-restyle.git";
/** A title that wraps in the card, so the second tab's details stand taller. */
const LONG_TITLE =
  "A session whose title runs on long enough to wrap onto more lines in the card than the other one";

/** One interaction, read. */
interface Read {
  /** How many times the carrying element's inline style was written. */
  changes: number;
  leg: string;
  /** Style passes in the window. */
  passes: number;
  /** Elements the style passes restyled, summed. */
  restyled: number;
}

/** The mock: every turn, a word. */
function sceneModel() {
  const tag = crypto.randomUUID().slice(0, 6);
  const mark = (name: string) => `inline-restyle ${name} ${tag}`;
  const respond = (request: Seen): Reply =>
    request.tools
      ? { everyMs: 5, words: ["Done."] }
      : { everyMs: 1, words: ["Inline restyle"] };
  return { mark, respond };
}

/** Elements restyled and style writes to `target` from the act to `SETTLE_MS` past it. */
async function measure(
  page: Page,
  leg: string,
  target: string,
  act: () => Promise<void>
): Promise<Read> {
  await page.evaluate((selector) => {
    const w = window as unknown as {
      __writes: number;
      __writeWatch?: MutationObserver;
    };
    w.__writeWatch?.disconnect();
    w.__writes = 0;
    w.__writeWatch = new MutationObserver((records) => {
      for (const record of records) {
        if ((record.target as Element).matches(selector)) {
          w.__writes += 1;
        }
      }
    });
    w.__writeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
    });
  }, target);
  const main = await traceMain(
    page,
    async () => {
      await page.evaluate(() => performance.mark("inline-restyle:from"));
      await act();
      await page.waitForTimeout(SETTLE_MS);
      await page.evaluate(() => performance.mark("inline-restyle:to"));
    },
    { restyles: true }
  );
  const at = (name: string) =>
    main.marks.find((one) => one.name === name)?.at ?? 0;
  const from = at("inline-restyle:from");
  const to = at("inline-restyle:to");
  const styles = main.tasks
    .filter((task) => task.at >= from && task.at <= to)
    .flatMap((task) => task.passes.filter((pass) => pass.name !== "Layout"));
  const changes = await page.evaluate(() => {
    const w = window as unknown as {
      __writes: number;
      __writeWatch?: MutationObserver;
    };
    w.__writeWatch?.disconnect();
    return w.__writes;
  });
  return {
    leg,
    changes,
    passes: styles.length,
    restyled: styles.reduce((sum, pass) => sum + pass.elements, 0),
  };
}

/** The visible tab of `id`. */
const tabOf = (page: Page, id: string) =>
  page.locator(`[data-session-tab="${id}"]`).filter({ visible: true }).first();

/** The pointer onto the middle of `id`'s tab. */
async function pointOnto(page: Page, id: string): Promise<void> {
  const box = await tabOf(page, id).boundingBox();
  if (!box) {
    throw new Error(`inline-restyle: the tab ${id} has no box`);
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The composer's offer stack: Composer's `stack`, the one that writes its
 * block size (the pane group's own `stack` writes none), in its dock.
 */
const STACK = '[data-slot="stack"][style*="block-size"]';
/** The tallest stack the page draws, px. */
const stackHeight = (page: Page) =>
  page.evaluate(
    (selector) =>
      Math.max(
        0,
        ...[...document.querySelectorAll(selector)].map(
          (el) => el.getBoundingClientRect().height
        )
      ),
    STACK
  );

const run = async (kit: Kit) => {
  const scene = sceneModel();
  const fleet = await kit.fleet(scene.respond);
  // The repository's origin as a host's URL: a bare folder's path names no
  // repository (upstream-guard `normaliseRemote`), so no session would share
  // one. Read as the URL only; nothing fetches from it.
  await Bun.$`git -C ${fleet.repo} remote set-url origin ${REMOTE}`.quiet();
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const short = await fleet.spawn("claude", "Quiet");
  await fleet.send(short, `${scene.mark("short")}: hello.`);
  const long = await fleet.spawn("claude", LONG_TITLE);
  await fleet.send(long, `${scene.mark("long")}: hello.`);
  // Alone in the repository: its turn's end offers nothing.
  const asker = await fleet.spawn("claude", "Offered", fleet.repo);
  await fleet.send(asker, `${scene.mark("idle")}: hello.`);
  const base = await fleet.dashboard();

  const page = await kit.page("desk");
  await page.addInitScript(
    ([held, active]) => {
      localStorage.setItem(
        "cawco-workspace",
        JSON.stringify({
          v: 1,
          root: { t: "l", id: "pone", tabs: held, active, opened: null },
          focusedLeaf: "pone",
        })
      );
    },
    [[short, long, asker], short] as const
  );
  await open(
    page,
    `${base}/session/${short}`,
    `${SCROLLER} [data-row]`,
    120_000
  );
  await page.waitForTimeout(3000);
  const reads: Read[] = [];
  const keep = (read: Read) => {
    reads.push(read);
    kit.note(
      `${read.leg}: ${read.restyled} elements restyled in ${read.passes} style passes; the value written ${read.changes} times`
    );
  };

  // 1. The shell as the window resizes.
  const desk = page.viewportSize() ?? { width: 1440, height: 900 };
  for (const step of STEPS) {
    keep(
      await measure(
        page,
        `1: the window to ${desk.height + step}px tall`,
        '[data-slot="shell"]',
        () => page.setViewportSize({ ...desk, height: desk.height + step })
      )
    );
  }

  // 2. The details card from one tab to the other, and back.
  await page.mouse.move(0, 0);
  await pointOnto(page, short);
  await until(
    "the short session's card",
    () => page.locator("[data-session-details-popover]").count(),
    (n) => n > 0,
    15_000
  );
  await page.waitForTimeout(SETTLE_MS);
  for (const [to, words] of [
    [long, "to the long title's tab"],
    [short, "back to the short one's"],
  ] as const) {
    keep(
      await measure(
        page,
        `2: the card ${words}`,
        '[data-slot="details-morph"]',
        () => pointOnto(page, to)
      )
    );
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(SETTLE_MS);

  // 3. The offer stack as the offer arrives, and as it is put off. Another
  // session now works in the repository, so the offered one's next turn
  // ends with the offer.
  const sibling = await fleet.spawn("claude", "Beside it", fleet.repo);
  await fleet.send(sibling, `${scene.mark("sibling")}: hello.`);
  await tabOf(page, asker).evaluate((el) => (el as HTMLElement).click());
  await page.waitForTimeout(SETTLE_MS);
  keep(
    await measure(page, "3: the project offer arrives", STACK, async () => {
      await fleet.send(asker, `${scene.mark("offered")}: again.`);
      await until(
        "the project offer on the composer",
        () => stackHeight(page),
        (h) => h > 0,
        120_000
      );
    })
  );
  keep(
    await measure(page, "3: the project offer put off", STACK, async () => {
      await page
        .locator(STACK)
        .getByRole("button", { name: "Not now" })
        .first()
        .click();
      await until(
        "the stack given back",
        () => stackHeight(page),
        (h) => h === 0,
        30_000
      );
    })
  );
  await writeFile(
    join(kit.out, "numbers.json"),
    `${JSON.stringify(reads, null, 2)}\n`
  );
};

const spec: Spec = { name: "inline-restyle", run };
export default spec;
