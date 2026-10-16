/**
 * The web transcript's list (virtua) keeps a whole, finite layout while its
 * tail grows and settles, and while the reader pages up to the start and
 * jumps back to the latest row: a scratch fleet's session seeded with 820
 * Bash calls (the newest page and older ones), the built dashboard against
 * its hub, on the desk. Runtime measures (frames.ts):
 *
 *  - a burst of 6 wheels up from the tail inside 300ms, while older pages
 *    land: the newest call in view moves by whole wheels on every painted
 *    frame, never back, by all of them in all;
 *  - wheeling up to the conversation's first row: every wheel the scroller
 *    had room for moves the rows by its distance within 2px, and no painted
 *    frame shows a blank stretch over 4px;
 *  - Jump to latest: the view only moves down, no blank stretch, and it
 *    ends on the newest rows;
 *  - four turns at the tail (three calls and a streamed reply each): each
 *    reply is drawn;
 *  - no `NaN` style and no page error, all along.
 */

import { type Reply, type Seen, until } from "../../../scratch-fleet";
import { SCROLLER, tell, watch, watched, wholeWheels } from "../../frames";
import { COMPOSER, open, type Spec } from "../../kit";

const ROWS = 820;
const TURNS = 4;
const BURST = 6;
const WHEEL = 600;

/** The topmost marker row fully in view, every marker in view, and the scroll. */
const firstRow = () => {
  const scroller = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  if (!scroller) {
    return null;
  }
  const box = scroller.getBoundingClientRect();
  let best: { row: string; y: number } | null = null;
  const seen = new Set<string>();
  const all: string[] = [];
  const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const row = node.textContent?.match(
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
      /(row-\d{4}|turn-\d+-call-\d|Reply \d+)/
    )?.[1];
    if (!row || seen.has(row)) {
      continue;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom) {
      seen.add(row);
      all.push(row);
      if (!best || rect.top - box.top < best.y) {
        best = { row, y: rect.top - box.top };
      }
    }
  }
  return { first: best, rows: all, scrollTop: scroller.scrollTop };
};

/** Where a marker's text stands in the view: the innermost element holding all of it. */
const yOf = (wanted: string) => {
  const scroller = document.querySelector<HTMLElement>(
    '[aria-label="Session transcript"]'
  );
  if (!scroller) {
    return null;
  }
  let found: Element | null = null;
  for (const element of scroller.querySelectorAll("*")) {
    if (
      element.textContent?.includes(wanted) &&
      (!found || found.contains(element))
    ) {
      found = element;
    }
  }
  const rect = found?.getBoundingClientRect();
  return rect && rect.height > 0
    ? rect.top - scroller.getBoundingClientRect().top
    : null;
};

const spec: Spec = {
  name: "virtua-tail",
  run: async (kit) => {
    const MARK = `tail probe ${crypto.randomUUID().slice(0, 6)}`;
    const TURN = /tail-turn-(\d+)/g;
    let calls = 0;
    const turnCalls = new Map<string, number>();
    const respond = (request: Seen): Reply => {
      const turn = [...request.all.matchAll(TURN)].at(-1)?.[1];
      if (turn !== undefined && request.tools) {
        const done = turnCalls.get(turn) ?? 0;
        if (done < 3) {
          turnCalls.set(turn, done + 1);
          return {
            everyMs: 1,
            words: [],
            tool: {
              name: "Bash",
              input: {
                command: `echo turn-${turn}-call-${done}`,
                description: `Turn ${turn} call ${done}`,
              },
            },
          };
        }
        return {
          everyMs: 25,
          words:
            `Reply ${turn} streams in a few dozen words so the live row grows over several frames before it settles into the turn's own row at the tail of the list, where everything moves.`
              .split(" ")
              .map((word) => `${word} `),
        };
      }
      if (request.tools && request.all.includes(MARK) && calls < ROWS) {
        calls += 1;
        const n = String(calls).padStart(4, "0");
        return {
          everyMs: 1,
          words: [],
          tool: {
            name: "Bash",
            input: { command: `echo row-${n}`, description: `Print row-${n}` },
          },
        };
      }
      return { everyMs: 5, words: ["Done."] };
    };
    const fleet = await kit.fleet(respond);
    const rowsOf = async (id: string) => {
      interface PageRead {
        blocks: unknown[];
        cursor: string | null;
        tail?: { busy?: boolean };
      }
      const newest = await fleet.api<PageRead>(
        `/api/instances/${id}/transcript`
      );
      let rows = newest.blocks.length;
      let { cursor } = newest;
      while (cursor) {
        // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
        const older = await fleet.api<PageRead>(
          `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
        );
        rows += older.blocks.length;
        ({ cursor } = older);
      }
      return { rows, busy: newest.tail?.busy === true };
    };
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const sessionId = await fleet.spawn("claude", "Tail probe");
    await fleet.send(sessionId, `${MARK}: print the rows.`);
    await until(
      `${ROWS} rows in the session`,
      () => rowsOf(sessionId),
      (held) => held.rows >= ROWS && !held.busy,
      40 * 60_000
    );

    const page = await kit.page("desk", { init: [watch] });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource")
      ) {
        pageErrors.push(message.text());
      }
    });
    await open(
      page,
      `${await fleet.dashboard()}/session/${sessionId}`,
      SCROLLER,
      120_000
    );
    await until(
      "the session's rows on screen",
      () => page.evaluate(firstRow),
      (shown) => !!shown?.first,
      120_000
    );
    await page.waitForTimeout(3000);
    const area = await page.locator(SCROLLER).boundingBox();
    if (!area) {
      throw new Error("no transcript scroller on the page");
    }
    const mid = { x: area.x + area.width / 2, y: area.y + area.height / 2 };
    await page.mouse.move(mid.x, mid.y);

    // The burst: sent straight to the browser on a timer, none waiting for
    // the one before it to be handled (Playwright's own wheel waits for each).
    const anchor =
      (await page.evaluate(firstRow))?.rows
        .filter((row) => row.startsWith("row-"))
        .at(-1) ?? null;
    await tell(page, { anchor, ys: [] });
    const input = await page.context().newCDPSession(page);
    await Promise.all(
      Array.from(
        { length: BURST },
        (_, wheel) =>
          new Promise<void>((done, fail) => {
            setTimeout(
              () => {
                input
                  .send("Input.dispatchMouseEvent", {
                    type: "mouseWheel",
                    ...mid,
                    deltaX: 0,
                    deltaY: -WHEEL,
                  })
                  .then(() => done(), fail);
              },
              (wheel * 300) / BURST
            );
          })
      )
    );
    await page.waitForTimeout(4000);
    const burst = wholeWheels((await watched(page)).ys, WHEEL, BURST, true);
    await tell(page, { anchor: null });
    kit.check(
      `${BURST} wheels inside 300ms: ${anchor} moves by whole wheels on every painted frame, never back, by all of them`,
      burst.faults.length === 0,
      `${burst.frames} painted frames, widest step ${burst.widest.toFixed(1)}px, moved ${burst.moved.toFixed(1)}px${burst.faults.length ? `; ${burst.faults.slice(0, 5).join(", ")}` : ""}`
    );

    // Up to the first row.
    const misses: string[] = [];
    let measured = 0;
    let wheels = 0;
    for (; wheels < 800; wheels += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
      const before = await page.evaluate(firstRow);
      if (before?.rows.includes("row-0001") && before.scrollTop <= 1) {
        break;
      }
      await page.mouse.wheel(0, -WHEEL);
      await page.waitForTimeout(250);
      // Only a wheel the scroller had room for is held to its distance.
      if (!before?.first || before.scrollTop < WHEEL + 1) {
        continue;
      }
      const y = await page.evaluate(yOf, before.first.row);
      if (y === null) {
        continue;
      }
      measured += 1;
      if (Math.abs(y - before.first.y - WHEEL) > 2) {
        misses.push(
          `${before.first.row} moved ${(y - before.first.y).toFixed(1)}`
        );
      }
    }
    await page.waitForTimeout(1500);
    const opening = await page.evaluate(firstRow);
    kit.check(
      "scrolled to the conversation's first row",
      opening?.rows.includes("row-0001") === true,
      `${wheels} wheels; first row in view ${opening?.first?.row}`
    );
    kit.check(
      "every wheel moved the rows by its distance",
      misses.length === 0,
      `${measured} wheels measured${misses.length ? `; off: ${misses.slice(0, 8).join("; ")}` : ""}`
    );
    const up = (await watched(page)).gap;
    kit.check(
      "no blank stretch in view while paging up",
      up.px <= 4,
      `widest ${up.px.toFixed(1)}px${up.where ? `, ${up.where}` : ""}`
    );

    // Jump to latest.
    await tell(page, {
      tops: [],
      sampling: true,
      gap: { px: 0, at: 0, top: 0, where: "" },
    });
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await page.waitForTimeout(4000);
    const glide = await watched(page);
    await tell(page, { sampling: false });
    const back = glide.tops.filter(
      (top, i) => i > 0 && top < (glide.tops[i - 1] as number) - 0.5
    );
    kit.check(
      "the jump to latest only moves down",
      back.length === 0,
      `${glide.tops.length} frames, ${back.length} moved up`
    );
    kit.check(
      "no blank stretch in view during the jump",
      glide.gap.px <= 4,
      `widest ${glide.gap.px.toFixed(1)}px`
    );
    const newest = `row-${String(ROWS).padStart(4, "0")}`;
    const bottom = await page.evaluate(firstRow);
    kit.check(
      "the jump ends on the newest rows",
      bottom?.rows.includes(newest) === true,
      `last in view ${bottom?.rows.at(-1)}`
    );

    // Turns at the tail: grow, then settle.
    for (let turn = 1; turn <= TURNS; turn += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one turn at a time, each at the tail the last left
      const spoken = (await rowsOf(sessionId)).rows;
      const field = page.locator(`${COMPOSER}:visible`).first();
      await field.fill(`tail-turn-${turn}: one more turn.`);
      await field.press("Enter");
      await until(
        `turn ${turn} settled`,
        () => rowsOf(sessionId),
        (held) => held.rows > spoken && !held.busy,
        120_000
      );
      await page.waitForTimeout(2500);
      const drawn = await page.evaluate(yOf, `Reply ${turn} streams`);
      kit.check(`turn ${turn}: its reply is drawn`, drawn !== null);
    }
    const seen = await watched(page);
    kit.check(
      "no NaN in any style",
      seen.nan.length === 0,
      seen.nan.length
        ? seen.nan.slice(0, 3).join(" | ")
        : `${seen.frames} frames watched`
    );
    const errors = [...seen.errors, ...pageErrors];
    kit.check(
      "no page error",
      errors.length === 0,
      errors.slice(0, 4).join(" | ")
    );
  },
};
export default spec;
