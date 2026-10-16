/**
 * The delegate tray's failure shelf (transcript/DelegateTray), on the tray's
 * bench (/motion/delegate-tray?case=…, no hub: the real SessionPane and the
 * composer lent to it), at 1440 and 390, light and dark. Owner, 10-14:
 * "this mess in delegate chips keeps happening" — a tray full of red
 * "failed" chips, and a "+N" that opened a column of chips over the
 * transcript.
 *
 * Invariant: failed delegates never clutter the chip row or cover the
 * transcript; each failure ends by Retry, Replaced by, or Dismiss with a
 * reason. Seeded with the design's cases (1 running; 1 failed; 3 running
 * and 2 failed; 5 failed; 7 running and 13 failed; 20 running), it asserts:
 *
 *  - a failure never takes a running slot or enters "+N": the running zone
 *    holds the working chips in creation order, "+N" counts only working
 *    ones, and the failures stand at the row's end as one chip (geometry);
 *  - the shelf opens inside the dock, between the row and the field, and
 *    the transcript's scroll position and box are unchanged: scrolled
 *    mid-way it keeps its scrollTop, at the tail it stays at the tail with
 *    its last row clear above the shelf, and every point of the transcript
 *    above the shelf hits the transcript (engine);
 *  - Retry, Replaced by and Dismiss with a reason each reach the hub (the
 *    request and its body), and the failure's row and chip leave; a refusal
 *    is said under its row with Try again;
 *  - a retried item's chip returns to its index in creation order;
 *  - the footer dismisses all N with one reason;
 *  - at 390 the shelf never scrolls sideways; it shows 4 rows on a desk and
 *    3 on a phone, then scrolls inside itself;
 *  - motion, scrubbed through the Animation domain at 0, 50 and 100%: the
 *    shelf opens on --dur-panel and shuts on --dur-exit, its height grows
 *    from nothing to its own, and the transcript holds its place (or its
 *    tail) at every fraction.
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each in-page reading walks the row, the shelf and the transcript in order.
import type { Page, Route } from "playwright-core";
import { Clock } from "../../anim";
import {
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  type Theme,
  type View,
} from "../../kit";

const ROUTE = "/motion/delegate-tray";
const CASES = ["1r", "1f", "3r2f", "5f", "7r13f", "20r"] as const;
const FRACTIONS = [0, 0.5, 1];

interface Call {
  act: string;
  body: unknown;
  id: string;
}

/** The bench's items in creation order: id, title, state. */
const seeded = (page: Page) =>
  page.evaluate(() =>
    Object.values(
      (
        globalThis as unknown as {
          __cawcoDebug: {
            state: {
              workItems: Record<
                string,
                { id: string; createdAt: number; state: string; title: string }
              >;
            };
          };
        }
      ).__cawcoDebug.state.workItems
    )
      .filter((item) => item.id.startsWith("wi-tray-"))
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ id, state, title }) => ({ id, state, title }))
  );

/**
 * The hub, as the page's three calls reach it: each answered after a beat
 * (so a pending state can be read) with the item as the hub would hand it
 * back, or refused once where `refuse` names the call.
 */
function hubOn(page: Page, calls: Call[], refuse: Set<string>) {
  return page.route("**/api/work-items/*/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const [, , , id, act] = url.pathname.split("/");
    const body = route.request().postDataJSON() as unknown;
    calls.push({ act, id, body });
    await new Promise((done) => setTimeout(done, 400));
    if (refuse.delete(`${act}:${id}`)) {
      await route.fulfill({
        status: 409,
        body: "The session's machine is offline, so it was not retried.",
      });
      return;
    }
    const item = await page.evaluate(
      ({ id: itemId, act: kind, why }) => {
        const was = (
          globalThis as unknown as {
            __cawcoDebug: { state: { workItems: Record<string, object> } };
          }
        ).__cawcoDebug.state.workItems[itemId];
        return kind === "retry"
          ? { ...was, state: "running", endedAt: null }
          : {
              ...was,
              dismissedAt: Date.now(),
              ...(why as object),
            };
      },
      { id, act, why: body }
    );
    await route.fulfill({ json: item });
  });
}

/** The row as drawn: its chips in order, "+N"'s count, and the failure chip. */
const rowNow = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".host > .tray > .row");
    if (!row) {
      return null;
    }
    const box = row.getBoundingClientRect();
    const chips = [
      ...row.querySelectorAll<HTMLElement>(":scope > [data-key]"),
    ].filter((chip) => chip.checkVisibility({ opacityProperty: true }));
    const more = chips.find((chip) => chip.dataset.key === "more");
    const fail = chips.find((chip) => chip.classList.contains("failed"));
    return {
      keys: chips.map((chip) => chip.dataset.key ?? ""),
      working: chips
        .filter(
          (chip) =>
            chip.dataset.key !== "more" && !chip.classList.contains("failed")
        )
        .map((chip) => chip.dataset.key ?? ""),
      more: more ? Number(more.textContent?.replace("+", "") ?? 0) : 0,
      fail: fail
        ? {
            key: fail.dataset.key ?? "",
            text: fail.textContent?.replace(/\s+/g, " ").trim() ?? "",
            last: chips.at(-1) === fail,
          }
        : null,
      inside: chips.every((chip) => {
        const c = chip.getBoundingClientRect();
        return c.left >= box.left - 0.5 && c.right <= box.right + 0.5;
      }),
    };
  });

/** The transcript, the shelf and the dock, as drawn now. */
const scene = (page: Page) =>
  page.evaluate(() => {
    const tr = document.querySelector<HTMLElement>(".leaf .tr");
    const slot = document.querySelector<HTMLElement>(".shelf-slot");
    const shelf = document.querySelector<HTMLElement>(".shelf");
    const row = document.querySelector<HTMLElement>(".host > .tray > .row");
    const pill = document.querySelector<HTMLElement>(".leaf > .dock .composer");
    if (!(tr && row && pill)) {
      return null;
    }
    const r = tr.getBoundingClientRect();
    const s = shelf?.getBoundingClientRect() ?? null;
    // Every point of the transcript above the dock's top hits the
    // transcript's own content: nothing is drawn over the log.
    const dockTop = Math.min(
      row.getBoundingClientRect().top,
      s?.top ?? Number.POSITIVE_INFINITY
    );
    const over: string[] = [];
    for (let y = r.top + 24; y < dockTop - 4; y += 37) {
      for (const x of [r.left + r.width * 0.25, r.left + r.width * 0.5]) {
        const hit = document.elementFromPoint(x, y);
        if (!hit?.closest(".tr")) {
          over.push(
            `${Math.round(x)},${Math.round(y)}: ${hit?.tagName.toLowerCase()}.${String(hit?.className).split(" ")[0]}`
          );
        }
      }
    }
    const rows = [...tr.querySelectorAll<HTMLElement>("[data-message]")];
    const last = rows
      .map((one) => one.getBoundingClientRect())
      .filter((one) => one.height > 0)
      .reduce((a, b) => (b.bottom > a.bottom ? b : a), new DOMRect());
    return {
      top: tr.scrollTop,
      toEnd: tr.scrollHeight - tr.clientHeight - tr.scrollTop,
      box: [r.top, r.bottom, r.left, r.right].map(
        (v) => Math.round(v * 10) / 10
      ),
      slot: slot ? slot.getBoundingClientRect().height : 0,
      shelf: s
        ? { top: s.top, bottom: s.bottom, left: s.left, right: s.right }
        : null,
      inDock: !!shelf?.closest(".leaf > .dock .dock"),
      rowBottom: row.getBoundingClientRect().bottom,
      pillTop: pill.getBoundingClientRect().top,
      lastBottom: last.bottom,
      over,
    };
  });

/** The shelf's rows: their keys, how many are wholly in view, and whether it scrolls sideways. */
const shelfRows = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector<HTMLElement>(".shelf .slist");
    const shelf = document.querySelector<HTMLElement>(".shelf");
    if (!(list && shelf)) {
      return null;
    }
    const view = list.getBoundingClientRect();
    const rows = [
      ...list.querySelectorAll<HTMLElement>(":scope > .srow"),
    ].filter((one) => !one.inert);
    return {
      keys: rows.map((one) => one.dataset.shelfRow ?? ""),
      whole: rows.filter((one) => {
        const b = one.getBoundingClientRect();
        return b.top >= view.top - 0.5 && b.bottom <= view.bottom + 0.5;
      }).length,
      scrolls: list.scrollHeight > list.clientHeight + 0.5,
      sideways: [shelf, list, ...rows].some(
        (one) => one.scrollWidth > one.clientWidth + 0.5
      ),
      // What reaches past the list's edge, when something does.
      past: [...list.querySelectorAll<HTMLElement>("*")]
        .flatMap((one) => {
          const b = one.getBoundingClientRect();
          const after = getComputedStyle(one, "::after");
          return b.right > view.right + 0.5 || b.left < view.left - 0.5
            ? [
                `${one.tagName.toLowerCase()}.${String(one.className).split(" ")[0]} ${Math.round(b.left)}–${Math.round(b.right)} (after ${after.content === "none" ? "-" : after.inset})`,
              ]
            : [];
        })
        .slice(0, 6),
      widths: [shelf, list, ...rows.slice(0, 2)].map(
        (one) => `${one.scrollWidth}/${one.clientWidth}`
      ),
      heading: shelf.querySelector("h2")?.textContent?.trim() ?? "",
    };
  });

const failChip = ".host > .tray > .row > [data-key].failed";
const rowSel = (id: string) => `.shelf [data-shelf-row="${id}"]`;

/** Every case's row: the zones, and what "+N" counts. */
async function zones(kit: Kit, page: Page, base: string, where: string) {
  for (const key of CASES) {
    // biome-ignore lint/performance/noAwaitInLoops: one case at a time, on one page
    await open(
      page,
      `${base}${ROUTE}?case=${key}&theme=${where.split(" ")[1]}`,
      () => !!document.querySelector(".host > .tray > .row [data-key]")
    );
    await settle(page, 400);
    const items = await seeded(page);
    const running = items.filter((one) => one.state !== "failed");
    const failed = items.filter((one) => one.state === "failed");
    const row = await rowNow(page);
    const order = running.map((one) => one.id);
    kit.check(
      `${where} ${key}: the running zone holds working chips only, in creation order, and "+N" counts the rest of them`,
      !!row &&
        row.working.every((id, i) => id === order[i]) &&
        row.working.length + row.more === running.length,
      JSON.stringify({ row, order })
    );
    const failText =
      failed.length === 1 ? failed[0].title : `${failed.length} failed`;
    kit.check(
      `${where} ${key}: the failures stand at the row's end as one chip (${failed.length ? failText : "none"})`,
      !!row &&
        (failed.length === 0
          ? row.fail === null
          : !!row.fail &&
            row.fail.last &&
            row.fail.text.includes(failText) &&
            (failed.length > 1 || row.fail.key === failed[0].id)),
      JSON.stringify(row?.fail)
    );
    kit.check(
      `${where} ${key}: every chip stands inside the row`,
      !!row?.inside,
      JSON.stringify(row?.keys)
    );
  }
}

/** The shelf opened and shut on the clock: lengths, height, and the transcript's place at each fraction. */
async function motion(
  kit: Kit,
  page: Page,
  where: string,
  pinned: boolean
): Promise<void> {
  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    const ms = (name: string) => Number.parseFloat(s.getPropertyValue(name));
    return { panel: ms("--dur-panel"), exit: ms("--dur-exit") };
  });
  const before = await scene(page);
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => page.locator(failChip).click(),
    ".shelf-slot",
    5000
  );
  const openLength = clock.length();
  const at: { slot: number; top: number; toEnd: number; box: number[] }[] = [];
  for (const f of FRACTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one fraction at a time, on one clock
    await clock.seek(f);
    await frames(page);
    const now = await scene(page);
    at.push({
      slot: now?.slot ?? -1,
      top: now?.top ?? -1,
      toEnd: now?.toEnd ?? -1,
      box: now?.box ?? [],
    });
  }
  await clock.release();
  await settle(page, 300);
  const opened = await scene(page);
  kit.check(
    `${where} ${pinned ? "at the tail" : "mid-way"}: the shelf opens over --dur-panel (${tokens.panel}ms), growing from nothing to its height at 0/50/100%`,
    Math.abs(openLength - tokens.panel) <= 1 &&
      at[0].slot <= 1 &&
      at[1].slot > 1 &&
      at[1].slot < (opened?.slot ?? 0) - 1 &&
      Math.abs(at[2].slot - (opened?.slot ?? 0)) <= 1,
    JSON.stringify({ openLength, at, full: opened?.slot })
  );
  kit.check(
    pinned
      ? `${where} at the tail: the transcript stays at its tail at 0/50/100% and after, its box unchanged`
      : `${where} mid-way: the transcript keeps its scroll position at 0/50/100% and after, its box unchanged`,
    !!before &&
      !!opened &&
      [...at, { top: opened.top, toEnd: opened.toEnd, box: opened.box }].every(
        (one) =>
          (pinned ? one.toEnd <= 1 : Math.abs(one.top - before.top) <= 1) &&
          one.box.join() === before.box.join()
      ),
    JSON.stringify({
      before: before && [before.top, before.toEnd, before.box],
      at,
      after: opened && [opened.top, opened.toEnd],
    })
  );
  kit.check(
    `${where} ${pinned ? "at the tail" : "mid-way"}: the shelf stands inside the dock, between the row and the field, and nothing is drawn over the transcript`,
    !!opened?.shelf &&
      opened.inDock &&
      opened.shelf.top >= opened.rowBottom - 0.5 &&
      opened.shelf.bottom <= opened.pillTop + 0.5 &&
      opened.over.length === 0 &&
      (!pinned || opened.lastBottom <= opened.shelf.top + 0.5),
    JSON.stringify(opened)
  );
  // Shut with Escape, on --dur-exit.
  const shut = await Clock.on(page);
  await shut.catchRuns(
    () => page.keyboard.press("Escape"),
    ".shelf-slot",
    5000
  );
  const shutLength = shut.length();
  await shut.release();
  await settle(page, 300);
  const focused = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.dataset.key ?? null
  );
  kit.check(
    `${where}: Escape shuts the shelf over --dur-exit (${tokens.exit}ms) and gives focus back to its chip`,
    Math.abs(shutLength - tokens.exit) <= 1 &&
      (await page.locator(".shelf").count()) === 0 &&
      focused !== null,
    JSON.stringify({ shutLength, focused })
  );
}

/** The scroller put mid-way, or at its tail, as a reader leaves it. */
async function scrollTo(page: Page, tail: boolean): Promise<void> {
  await page.evaluate(async (end) => {
    const tr = document.querySelector<HTMLElement>(".leaf .tr");
    if (!tr) {
      return;
    }
    const range = tr.scrollHeight - tr.clientHeight;
    tr.scrollTop = end ? range : Math.round(range / 2);
    tr.dispatchEvent(new Event("scroll"));
    await new Promise((done) => setTimeout(done, 300));
  }, tail);
  await settle(page, 300);
}

/** The three ways out, the retried chip's place, and a refusal. */
async function ways(
  kit: Kit,
  page: Page,
  base: string,
  where: string,
  calls: Call[],
  refuse: Set<string>
) {
  await open(
    page,
    `${base}${ROUTE}?case=3r2f&theme=${where.split(" ")[1]}`,
    failChip
  );
  await settle(page, 400);
  const items = await seeded(page);
  const [newer, older] = items
    .filter((one) => one.state === "failed")
    .reverse();
  await scrollTo(page, false);
  await motion(kit, page, where, false);
  await scrollTo(page, true);
  await motion(kit, page, where, true);

  await page.locator(failChip).click();
  await settle(page, 400);
  const listed = await shelfRows(page);
  kit.check(
    `${where}: the shelf lists the failures newest first under "2 failures need a decision"`,
    listed?.keys.join() === [newer.id, older.id].join() &&
      listed.heading === "2 failures need a decision",
    JSON.stringify(listed)
  );

  // Retry, refused once: said under the row, then Try again goes.
  refuse.add(`retry:${older.id}`);
  calls.length = 0;
  await page
    .locator(`${rowSel(older.id)} button`, { hasText: "Retry" })
    .click();
  await page.waitForTimeout(150);
  const pending = await page
    .locator(rowSel(older.id), { hasText: "Retrying…" })
    .count();
  await settle(page, 700);
  const fault = await page
    .locator(rowSel(older.id), { hasText: "machine is offline" })
    .count();
  kit.check(
    `${where}: Retry reaches the hub, pending "Retrying…", and a refusal is said under its row`,
    calls.some((one) => one.act === "retry" && one.id === older.id) &&
      pending > 0 &&
      fault > 0,
    JSON.stringify({ calls, pending, fault })
  );
  await page
    .locator(`${rowSel(older.id)} button`, { hasText: "Try again" })
    .click();
  await settle(page, 900);
  const afterRetry = await rowNow(page);
  const order = items
    .filter((one) => one.state !== "failed" || one.id === older.id)
    .map((one) => one.id);
  kit.check(
    `${where}: retried, its row leaves the shelf and its chip stands at its own index (${order.indexOf(older.id)}) in creation order`,
    (await page.locator(rowSel(older.id)).count()) === 0 &&
      // The zone in creation order with it back in: what the row shows is
      // the order's head and "+N" the rest, so it stands at its index
      // whether shown or folded.
      !!afterRetry &&
      afterRetry.working.every((id, i) => id === order[i]) &&
      afterRetry.working.length + afterRetry.more === order.length &&
      (order.indexOf(older.id) >= afterRetry.working.length ||
        afterRetry.working.indexOf(older.id) === order.indexOf(older.id)),
    JSON.stringify({ afterRetry, order })
  );

  // Replaced by: the menu lists what came after it; a pick reaches the hub.
  // One failure left: its own chip opens the shelf.
  await page
    .locator(".shelf")
    .count()
    .then(async (n) => {
      if (n === 0) {
        await page.locator(failChip).click();
        await settle(page, 400);
      }
    });
  const later = items.filter(
    (one) => items.indexOf(one) > items.indexOf(newer)
  );
  calls.length = 0;
  await page
    .locator(`${rowSel(newer.id)} button`, { hasText: "Replaced by" })
    .click();
  await settle(page, 300);
  const menu = await page
    .locator(
      '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]'
    )
    .allTextContents();
  const disabled = later.length === 0;
  if (disabled) {
    kit.check(
      `${where}: with no later item, Replaced by is disabled and says why`,
      (await page
        .locator(
          `${rowSel(newer.id)} .nolater[title="No later item to point at yet"] button:disabled`
        )
        .count()) === 1
    );
  } else {
    await page
      .locator(
        '[data-slot="dropdown-menu-content"] [data-slot="dropdown-menu-item"]'
      )
      .first()
      .click();
    await settle(page, 900);
    kit.check(
      `${where}: Replaced by lists this session's later items and the pick reaches the hub; the failure leaves`,
      menu.length === later.length &&
        calls.some(
          (one) =>
            one.act === "dismiss" &&
            one.id === newer.id &&
            (one.body as { replacedBy?: string }).replacedBy === later[0].id
        ) &&
        (await page.locator(failChip).count()) === 0,
      JSON.stringify({ menu, later: later.map((one) => one.title), calls })
    );
  }

  // Dismiss with a reason, on a fresh load: the field, Escape, Enter.
  await open(
    page,
    `${base}${ROUTE}?case=3r2f&theme=${where.split(" ")[1]}`,
    failChip
  );
  await settle(page, 400);
  await page.locator(failChip).click();
  await settle(page, 400);
  await page
    .locator(`${rowSel(older.id)} button`, { hasText: "Dismiss…" })
    .click();
  await settle(page, 200);
  const field = page.locator(`${rowSel(older.id)} input`);
  const empty = await page
    .locator(`${rowSel(older.id)} button[type="submit"]`)
    .isDisabled();
  const focusedField = await field.evaluate(
    (el) => el === document.activeElement
  );
  await page.keyboard.press("Escape");
  await settle(page, 200);
  const cancelled =
    (await field.count()) === 0 && (await page.locator(".shelf").count()) === 1;
  await page
    .locator(`${rowSel(older.id)} button`, { hasText: "Dismiss…" })
    .click();
  await settle(page, 200);
  calls.length = 0;
  await field.fill("Folded into the newer tray item");
  await page.keyboard.press("Enter");
  await settle(page, 900);
  kit.check(
    `${where}: Dismiss… asks why (focused, Dismiss off while empty, Escape cancels); Enter sends the reason to the hub and the row leaves`,
    empty &&
      focusedField &&
      cancelled &&
      calls.some(
        (one) =>
          one.act === "dismiss" &&
          one.id === older.id &&
          (one.body as { reason?: string }).reason ===
            "Folded into the newer tray item"
      ) &&
      (await page.locator(rowSel(older.id)).count()) === 0,
    JSON.stringify({ empty, focusedField, cancelled, calls })
  );
  // An outside press shuts the shelf.
  const box = await page.locator(".leaf .tr").boundingBox();
  if (box) {
    await page.mouse.click(box.x + box.width / 2, box.y + 60);
  }
  await settle(page, 400);
  kit.check(
    `${where}: a press outside shuts the shelf`,
    (await page.locator(".shelf").count()) === 0
  );
}

/** 7 running, 13 failed: the shelf's height, its sideways scroll, and the footer. */
async function many(
  kit: Kit,
  page: Page,
  base: string,
  where: string,
  calls: Call[],
  phone: boolean
) {
  await open(
    page,
    `${base}${ROUTE}?case=7r13f&theme=${where.split(" ")[1]}`,
    failChip
  );
  await settle(page, 400);
  await page.locator(failChip).click();
  await settle(page, 500);
  const listed = await shelfRows(page);
  const cap = phone ? 3 : 4;
  kit.check(
    `${where} 7r13f: the shelf shows ${cap} rows whole, then scrolls inside itself, and never sideways`,
    !!listed &&
      listed.keys.length === 13 &&
      listed.whole === cap &&
      listed.scrolls &&
      !listed.sideways,
    JSON.stringify(listed)
  );
  // Three rows showing their actions, one as its reason field: still no
  // sideways scroll, and the field asking why stands whole in view where
  // its row stood (the list has not scrolled under it).
  const listAt = () =>
    page.evaluate(() => {
      const list = document.querySelector<HTMLElement>(".shelf .slist");
      const field = list?.querySelector<HTMLElement>(".srow input");
      const v = list?.getBoundingClientRect();
      const f = field?.getBoundingClientRect();
      return {
        top: list?.scrollTop ?? -1,
        field: !!f,
        inView:
          !!(v && f) && f.top >= v.top - 0.5 && f.bottom <= v.bottom + 0.5,
        focused: !!field && field === document.activeElement,
      };
    });
  const rest = await listAt();
  await page
    .locator(".shelf .srow")
    .first()
    .locator("button", { hasText: "Dismiss…" })
    .click();
  const pressed = await listAt();
  await settle(page, 300);
  const asked = await listAt();
  await page.keyboard.type("Folded into the newer item");
  await settle(page, 300);
  const typed = await listAt();
  kit.check(
    `${where} 7r13f: Dismiss… on the first row puts its field, focused, in view, and the list keeps its scroll`,
    [asked, typed].every(
      (one) => one.field && one.inView && one.focused && one.top === rest.top
    ),
    JSON.stringify({ rest, pressed, asked, typed })
  );
  const asking = await shelfRows(page);
  kit.check(
    `${where} 7r13f: with a reason field open among the rows, the shelf still never scrolls sideways`,
    !!asking && !asking.sideways,
    JSON.stringify(asking)
  );
  await page.keyboard.press("Escape");
  await settle(page, 200);
  // The footer: one reason for all 13.
  calls.length = 0;
  await page
    .locator(".shelf .sfoot button", {
      hasText: "Dismiss all 13 with one reason…",
    })
    .click();
  await settle(page, 200);
  await page.locator(".shelf .sfoot input").fill("Superseded by the redesign");
  await page.keyboard.press("Enter");
  await settle(page, 1200);
  const dismissed = calls.filter(
    (one) =>
      one.act === "dismiss" &&
      (one.body as { reason?: string }).reason === "Superseded by the redesign"
  );
  const row = await rowNow(page);
  kit.check(
    `${where} 7r13f: the footer dismisses all 13 with one reason; the failure chip and the shelf leave, the row keeps its 7`,
    new Set(dismissed.map((one) => one.id)).size === 13 &&
      (await page.locator(failChip).count()) === 0 &&
      (await page.locator(".shelf").count()) === 0 &&
      !!row &&
      row.working.length + row.more === 7,
    JSON.stringify({ dismissed: dismissed.length, row })
  );
}

/** 20 running: "+N" opens the shelf on what it holds, and nothing else. */
async function folded(kit: Kit, page: Page, base: string, where: string) {
  await open(
    page,
    `${base}${ROUTE}?case=20r&theme=${where.split(" ")[1]}`,
    () => !!document.querySelector('.host > .tray > .row [data-key="more"]')
  );
  await settle(page, 400);
  const row = await rowNow(page);
  const items = await seeded(page);
  await page.locator('.host > .tray > .row [data-key="more"]').click();
  await settle(page, 500);
  const listed = await shelfRows(page);
  const held = items.slice(row?.working.length ?? 0).map((one) => one.id);
  kit.check(
    `${where} 20r: "+${row?.more}" opens the shelf on the delegates it holds, in order`,
    !!listed && listed.keys.join() === held.join() && held.length === row?.more,
    JSON.stringify({ listed: listed?.keys, held })
  );
  const over = (await scene(page))?.over ?? ["no scene"];
  kit.check(
    `${where} 20r: what "+N" opens covers no part of the transcript`,
    over.length === 0,
    over.join("; ")
  );
}

/**
 * The row and the open shelf as drawn, cropped to the dock, for the design
 * review that reads them (kit.out); nothing is asserted on them.
 */
async function captures(kit: Kit, page: Page, base: string, where: string) {
  const slug = where.replace(/\s+/g, "-");
  const dock = async (name: string) => {
    const box = await page.evaluate(() => {
      const tray = document.querySelector(".host > .tray");
      const pill = document.querySelector(".leaf > .dock .composer");
      if (!(tray && pill)) {
        return null;
      }
      const t = tray.getBoundingClientRect();
      const p = pill.getBoundingClientRect();
      return {
        x: p.left - 8,
        y: t.top - 8,
        width: p.width + 16,
        height: p.bottom - t.top + 16,
      };
    });
    if (box) {
      const path = `${kit.out}/${slug}-${name}.png`;
      await page.screenshot({ path, clip: box });
      kit.note(`capture ${path}`);
    }
  };
  for (const key of ["3r2f", "7r13f"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one case at a time, on one page
    await open(
      page,
      `${base}${ROUTE}?case=${key}&theme=${where.split(" ")[1]}`,
      failChip
    );
    await settle(page, 400);
    await dock(`${key}-row`);
    await page.locator(failChip).click();
    await settle(page, 500);
    await dock(`${key}-shelf`);
  }
  await page
    .locator(".shelf .srow")
    .first()
    .locator("button", { hasText: "Dismiss…" })
    .click();
  // The field takes focus a tick after the press: typed before, the keys
  // land on the list.
  await settle(page, 200);
  await page.keyboard.type("Folded into the newer item");
  await settle(page, 300);
  await dock("7r13f-reason");
}

async function leg(
  kit: Kit,
  base: string,
  view: View,
  theme: Theme
): Promise<void> {
  const page = await kit.page(view, { theme });
  const where = `${page.viewportSize()?.width}px ${theme}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    // A hub read answered by the dev server's own "no hub" page.
    if (!error.message.includes("is not valid JSON")) {
      errors.push(error.message.split("\n")[0]);
    }
  });
  page.on("console", (message) => {
    // The bench has no hub: the reads it makes of one fail as network
    // errors, which say nothing about the page.
    const text = message.text();
    if (
      message.type() === "error" &&
      !(
        text.startsWith("Failed to load resource") ||
        text.startsWith("WebSocket connection to") ||
        text.includes("502 Bad Gateway") ||
        text.includes("is not valid JSON")
      )
    ) {
      errors.push(message.text().split("\n")[0]);
    }
  });
  const calls: Call[] = [];
  const refuse = new Set<string>();
  await hubOn(page, calls, refuse);
  await zones(kit, page, base, where);
  await ways(kit, page, base, where, calls, refuse);
  await many(kit, page, base, where, calls, view === "phone");
  await folded(kit, page, base, where);
  await captures(kit, page, base, where);
  kit.check(
    `${where}: no page errors (a ResizeObserver loop included)`,
    errors.length === 0,
    errors.slice(0, 5).join(" | ")
  );
  await page.close();
}

const spec: Spec = {
  name: "tray-shelf",
  async run(kit) {
    const base = await kit.bench();
    for (const view of ["desk", "phone"] as const) {
      for (const theme of ["light", "dark"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one leg at a time, each its own page
        await leg(kit, base, view, theme);
      }
    }
  },
};
export default spec;
