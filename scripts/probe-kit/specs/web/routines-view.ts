/**
 * The project's routines view, as built for the owner's pins of 2026-10-15:
 *
 * 1. "the 'tomorrow, failed xx on the right ... don't line up at all, and
 *    they don't follow a consistent structure": the routines are a ledger
 *    whose Last run and Next run are fixed columns, on one clock.
 * 2. "this bento looks terrible on wider screens", "how would a
 *    professional notion template guy design it?", "if there are many
 *    routines the user has to scroll down to even find out there are event
 *    sources", "what about if the screen is big enough? a bento?": linked
 *    views behind tabs with counts and needs-you marks under
 *    --c-routines-bento-at, each a table at --c-routines-w; from it a bento
 *    of all three filling the page's height, each panel scrolling in itself.
 * 3. "why are you repeating this info that is already up there", "this
 *    should be a proper table", "why is this not formatted?": the detail
 *    holds no schedule line, its runs are a table, its instruction markdown.
 * 4. T5, the owner's pick "Archived rail": archived tasks never stand in
 *    the columns; they fold into a rail beside them, in view however wide
 *    the board runs, which opens into a column of its own.
 *
 * On the built dashboard against a scratch fleet whose hub holds them:
 * "cawco" (code stages, the owner's four routines, three archived tasks),
 * "Fleet ops" (forty routines, three event routes, two connector polls,
 * five approved actions), "Field notes" (no routines). The routines and
 * their runs are written to the hub's database with a placeholder schedule,
 * then given their real one through the hub, which works out each next slot
 * and starts no run.
 *
 * Tabs at 1024 and 1440 (cawco): the three view tabs with their counts;
 * Last and Next start on one edge in every row (≤ 0.5px) and compute
 * tabular-nums; the view is no wider than --c-routines-w and shares the
 * tabs' leading edge; switching views keeps both, puts the view in the URL,
 * and a reload opens it.
 * Bento at 1920 and 2560 (Fleet ops): the three panels with their counts
 * and needs-you marks; every panel inside the viewport; the routines
 * panel's own body scrolls (scrollHeight > clientHeight) while the page
 * does not; Last and Next still on one edge.
 * An open routine stays open from 1440 to 1920.
 * Detail at 1440 (cawco's memory curator): no schedule line; the
 * instruction renders markdown (its list a <ul>) clamped until More; the
 * runs table's columns start on one edge in every row, in tabular figures.
 * Desk 1440: one clock per row; New routine and an empty project's starters
 * are the session Composer with no attach control.
 * Phone 390: Last and Next fold into the schedule's line.
 * T5 at desk 1440 and phone 390: the folded rail stands inside the
 * viewport after the columns, none of the three in them; pressed, it opens
 * in view listing the three under its count of 3, the page no wider than
 * the viewport, focus on its Fold control; folded again, the columns are
 * as they were and focus is back on the rail.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one width at a time
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { type Fleet, MACHINE, type Seen, until } from "../../../scratch-fleet";
import { COMPOSER_FIELD, type Kit, open, type Spec, settle } from "../../kit";

const ROUTINES = 4;
const BUSY = 40;
const ARCHIVED = 3;
/** A folded row's line: Last, then Next, after the schedule's words. */
const FOLDED = /^· Last .+ · Next .+$/;
/** A time at the end of words: "Daily at 13:30", "Tomorrow 13:30". */
const CLOCK = /(\d\d:\d\d)$/;
/** A tab's or panel head's words: its title, then its count. */
const TITLED = /^(.*?)\s*(\d+)/;
const SOURCES_TAB = /Event sources/;
const ROUTINES_TAB = /Routines/;

const spread = (values: number[]) =>
  values.some(Number.isNaN) || values.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.max(...values) - Math.min(...values);
const edges = (values: number[]) => values.map((x) => x.toFixed(2)).join(",");

/** The routines ledger in `scope`: its rows' Last and Next edges and figures. */
const ledgerIn = (page: Page, scope: string) =>
  page.evaluate((within) => {
    const root = document.querySelector(within);
    const rows = [
      ...(root?.querySelectorAll("table.routines tbody.routine > tr.row") ??
        []),
    ];
    const lefts = (cell: string) =>
      rows.map(
        (row) =>
          row
            .querySelector(`[data-cell="${cell}"] .time`)
            ?.getBoundingClientRect().left ?? Number.NaN
      );
    const times = rows.flatMap((row) => [
      ...row.querySelectorAll(
        "[data-cell='last'] .time, [data-cell='next'] .time"
      ),
    ]);
    const table = root?.querySelector(".ledger")?.getBoundingClientRect();
    return {
      layout:
        document.querySelector(".routines-view")?.getAttribute("data-layout") ??
        null,
      rows: rows.length,
      last: lefts("last"),
      next: lefts("next"),
      tabular: times.map((t) => getComputedStyle(t).fontVariantNumeric),
      table: table ? { left: table.left, width: table.width } : null,
      cap: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--c-routines-w"
        )
      ),
    };
  }, scope);

/** The view tabs: each one's words, whether chosen, and the strip's edge. */
const tabsOf = (page: Page) =>
  page.evaluate(() => {
    const list = document.querySelector(".view-head [role='tablist']");
    return {
      left: list?.getBoundingClientRect().left ?? Number.NaN,
      // A tab's segment: its button (role tab) and the count trailing it.
      tabs: [...(list?.querySelectorAll(".ff-tab") ?? [])].map((segment) => {
        const tab = segment.querySelector("[role='tab']");
        return {
          words: (segment as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
          name: tab?.getAttribute("aria-label") ?? null,
          chosen: tab?.getAttribute("aria-selected") === "true",
          needs: segment.querySelector(".needs") !== null,
        };
      }),
      part: new URL(location.href).searchParams.get("part"),
      view: document.querySelector(".view")?.getAttribute("data-part") ?? null,
      viewBox: (() => {
        const r = document.querySelector(".view")?.getBoundingClientRect();
        return r ? { left: r.left, width: r.width } : null;
      })(),
    };
  });

async function tabs(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(
      page,
      `${base}/project/${projectId}?view=routines`,
      () => document.querySelectorAll("tbody.routine").length >= 4
    );
    await settle(page);
    const at = `tabs ${width}`;
    // What a reviewer reads: the page as it stands.
    await page.screenshot({
      path: join(kit.out, `routines-tabs-${width}.png`),
    });
    const g = await ledgerIn(page, ".view");
    const t = await tabsOf(page);
    const titled = t.tabs.map((tab) => tab.words.match(TITLED)?.slice(1, 3));
    kit.check(
      `${at}: the page is the view tabs, Routines ${ROUTINES} chosen, Event sources 0 and Approved actions 0 beside it; Routines carries the needs-you mark for its failing routine`,
      g.layout === "tabs" &&
        JSON.stringify(titled) ===
          JSON.stringify([
            ["Routines", String(ROUTINES)],
            ["Event sources", "0"],
            ["Approved actions", "0"],
          ]) &&
        t.tabs[0]?.chosen === true &&
        t.tabs[0]?.needs === true &&
        t.tabs[0]?.name === `Routines, ${ROUTINES}, 1 failing` &&
        t.tabs[1]?.name === "Event sources, 0",
      JSON.stringify(t.tabs)
    );
    kit.check(
      `${at}: every row's Last and Next time starts on one edge (≤ 0.5px), in tabular figures`,
      g.rows === ROUTINES &&
        spread(g.last) <= 0.5 &&
        spread(g.next) <= 0.5 &&
        g.tabular.length === ROUTINES * 2 &&
        g.tabular.every((v) => v.includes("tabular-nums")),
      `last ${edges(g.last)}; next ${edges(g.next)}; ${[...new Set(g.tabular)].join(" | ")}`
    );
    kit.check(
      `${at}: the ledger is no wider than --c-routines-w and starts on the tabs' edge`,
      g.table !== null &&
        g.cap > 0 &&
        g.table.width <= g.cap + 0.5 &&
        Math.abs(g.table.left - t.left) <= 0.5,
      `ledger ${JSON.stringify(g.table)}, cap ${g.cap}, tabs at ${t.left}`
    );

    // Another view: the same cap and edge, its name in the URL, kept on reload.
    await page
      .locator(".view-head")
      .getByRole("tab", { name: SOURCES_TAB })
      .click();
    await settle(page);
    const sources = await tabsOf(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(".view[data-part='sources']");
    await settle(page);
    const reloaded = await tabsOf(page);
    kit.check(
      `${at}: Event sources is its own view, on the same edge and no wider than the cap; the URL names it and a reload opens it`,
      sources.view === "sources" &&
        sources.part === "sources" &&
        sources.tabs[1]?.chosen === true &&
        sources.viewBox !== null &&
        Math.abs(sources.viewBox.left - t.left) <= 0.5 &&
        sources.viewBox.width <= g.cap + 0.5 &&
        reloaded.view === "sources" &&
        reloaded.tabs[1]?.chosen === true,
      `${JSON.stringify(sources)}; reloaded ${JSON.stringify(reloaded)}`
    );
    await page
      .locator(".view-head")
      .getByRole("tab", { name: ROUTINES_TAB })
      .click();
    await settle(page);
    const back = await tabsOf(page);
    const again = await ledgerIn(page, ".view");
    kit.check(
      `${at}: back on Routines, the URL drops the view and the ledger keeps its edges`,
      back.part === null &&
        back.view === "routines" &&
        spread([...again.last, ...g.last]) <= 0.5 &&
        spread([...again.next, ...g.next]) <= 0.5,
      `${JSON.stringify(back)}; last ${edges(again.last)}`
    );
  }
  await page.close();
}

/** The bento: each panel's box, its head's words, and whose scroll is whose. */
const bentoOf = (page: Page) =>
  page.evaluate(() => {
    const pane =
      document.querySelector<HTMLElement>(".pane") ?? document.scrollingElement;
    return {
      layout:
        document.querySelector(".routines-view")?.getAttribute("data-layout") ??
        null,
      vh: innerHeight,
      page: {
        scroll: document.scrollingElement?.scrollHeight ?? 0,
        client: document.scrollingElement?.clientHeight ?? 0,
        paneScroll: pane?.scrollHeight ?? 0,
        paneClient: pane?.clientHeight ?? 0,
      },
      panels: [...document.querySelectorAll(".bento > .panel")].map((panel) => {
        const box = panel.getBoundingClientRect();
        const scroller = panel.querySelector<HTMLElement>(".panel-body");
        return {
          part: panel.getAttribute("data-part"),
          head: (
            panel.querySelector(".panel-title") as HTMLElement | null
          )?.innerText
            .replace(/\s+/g, " ")
            .trim(),
          needs: panel.querySelector(".panel-title .needs") !== null,
          top: box.top,
          bottom: box.bottom,
          overflowY: scroller ? getComputedStyle(scroller).overflowY : null,
          scroll: scroller?.scrollHeight ?? 0,
          client: scroller?.clientHeight ?? 0,
        };
      }),
    };
  });

async function bento(kit: Kit, base: string, busyId: string) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  for (const width of [1920, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    await open(
      page,
      `${base}/project/${busyId}?view=routines`,
      () => document.querySelectorAll(".bento tbody.routine").length >= 40
    );
    await settle(page);
    const at = `bento ${width}`;
    await page.screenshot({
      path: join(kit.out, `routines-bento-${width}.png`),
    });
    const b = await bentoOf(page);
    const heads = b.panels.map((panel) =>
      panel.head?.match(TITLED)?.slice(1, 3)
    );
    kit.check(
      `${at}: Fleet ops is a bento of Routines ${BUSY}, Event sources 7 (four routes, two connector polls, the GitHub poller) and Approved actions 6, each head with its needs-you mark (failing routines, a failing source, actions waiting)`,
      b.layout === "bento" &&
        JSON.stringify(heads) ===
          JSON.stringify([
            ["Routines", String(BUSY)],
            ["Event sources", "7"],
            ["Approved actions", "6"],
          ]) &&
        b.panels.every((panel) => panel.needs),
      JSON.stringify(
        b.panels.map(({ part, head, needs }) => ({ part, head, needs }))
      )
    );
    kit.check(
      `${at}: every panel is inside the viewport at load`,
      b.panels.length === 3 &&
        b.panels.every((panel) => panel.top >= 0 && panel.bottom <= b.vh + 0.5),
      JSON.stringify(
        b.panels.map(({ part, top, bottom }) => ({ part, top, bottom }))
      )
    );
    const routines = b.panels.find((panel) => panel.part === "routines");
    kit.check(
      `${at}: the ${BUSY} routines scroll in their own panel while the page does not`,
      routines !== undefined &&
        routines.overflowY === "auto" &&
        routines.scroll > routines.client &&
        b.panels.every((panel) => panel.overflowY === "auto") &&
        b.page.scroll <= b.page.client + 1 &&
        b.page.paneScroll <= b.page.paneClient + 1,
      JSON.stringify({ page: b.page, panels: b.panels })
    );
    const g = await ledgerIn(page, ".panel[data-part='routines']");
    kit.check(
      `${at}: in the bento's Routines panel every row's Last and Next time starts on one edge, in tabular figures`,
      g.rows === BUSY &&
        spread(g.last) <= 0.5 &&
        spread(g.next) <= 0.5 &&
        g.tabular.every((v) => v.includes("tabular-nums")),
      `rows ${g.rows}; last spread ${spread(g.last).toFixed(2)}; next spread ${spread(g.next).toFixed(2)}`
    );
  }

  // The open routine stays open from tabs to the bento.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(
    page,
    `${base}/project/${busyId}?view=routines`,
    () => document.querySelectorAll(".view tbody.routine").length >= 40
  );
  await settle(page);
  // Its weekly schedule sorts it far down the forty: bring it into view first.
  const busyCell = page.locator(
    "tbody.routine[data-routine='busy-2'] td.col-last"
  );
  await busyCell.scrollIntoViewIfNeeded();
  await settle(page);
  const cell = await busyCell.boundingBox();
  if (cell) {
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
  }
  await settle(page);
  const before = await page.evaluate(
    () =>
      document
        .querySelector("tbody.routine[data-state='open']")
        ?.getAttribute("data-routine") ?? null
  );
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.waitForSelector(".bento");
  await settle(page);
  const after = await page.evaluate(() => {
    const body = document.querySelector(
      ".bento tbody.routine[data-state='open']"
    );
    const rows = body?.querySelectorAll(".detail table.actions tr.action");
    return {
      open: body?.getAttribute("data-routine") ?? null,
      actions: rows?.length ?? 0,
      from: body?.querySelector(".detail table.actions .from") !== null,
    };
  });
  kit.check(
    "1440 → 1920: the routine open under the tabs is open in the bento",
    before === "busy-2" && after.open === "busy-2",
    `before ${before}, after ${JSON.stringify(after)}`
  );
  kit.check(
    "bento 1920: an open routine's detail lists the actions its runs proposed, without its own name",
    after.actions === 1 && !after.from,
    JSON.stringify(after)
  );

  // What the hub records, read back: an action's routine, a route's last delivery.
  const read = await page.evaluate(() => ({
    actions: [
      ...document.querySelectorAll(".panel[data-part='actions'] tr.action"),
    ].map((row) => ({
      what: row.querySelector(".what")?.textContent?.trim() ?? "",
      from: row.querySelector(".from")?.textContent?.trim() ?? null,
    })),
    routes: [
      ...document.querySelectorAll(".panel[data-part='sources'] tr.row"),
    ].map((row) => ({
      name: row.querySelector(".name")?.textContent?.trim() ?? "",
      sub: row.querySelector(".sub")?.textContent?.trim() ?? "",
      last:
        (
          row.querySelector("[data-cell='last']") as HTMLElement | null
        )?.innerText
          .replace(/\s+/g, " ")
          .trim() ?? "",
    })),
  }));
  const fromRun = read.actions.find((row) => row.what === PROPOSED);
  kit.check(
    "bento 1920: the action busy-4's delegate run proposed says it came from that routine",
    fromRun?.from === "From Check the relay's health",
    JSON.stringify(read.actions)
  );
  const toMerge = read.routes.filter(
    (row) => row.name === "Smoke tests on merge"
  );
  const labelled = toMerge.find((row) => row.sub.includes(RELEASE));
  const plain = toMerge.find((row) => !row.sub.includes(RELEASE));
  const quiet = read.routes.find((row) => row.name === "Triage new issues");
  kit.check(
    "bento 1920: two routes to one routine that differ only by a label filter show their own Last read: the labelled one's three hours ago, the other's just now; a route with none says No events yet",
    toMerge.length === 2 &&
      labelled?.last === "Delivered, 3h ago" &&
      plain?.last.startsWith("Delivered, ") === true &&
      plain.last !== labelled.last &&
      quiet?.last === "No events yet",
    JSON.stringify(read.routes)
  );
  await page.close();
}

/** An open routine's detail, from the engine. */
async function detail(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  await open(
    page,
    `${base}/project/${projectId}?view=routines`,
    () => document.querySelectorAll("tbody.routine").length >= 4
  );
  await settle(page);
  const cell = await page
    .locator("tbody.routine[data-routine='rt-curator'] td.col-last")
    .boundingBox();
  if (cell) {
    await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2);
  }
  await page.waitForSelector(
    "tbody.routine[data-routine='rt-curator'] .detail .instruction"
  );
  await settle(page);
  const read = () =>
    page.evaluate(() => {
      const body = document.querySelector(
        "tbody.routine[data-routine='rt-curator']"
      );
      const line = body?.querySelector(".sub-words")?.textContent?.trim() ?? "";
      const box = body?.querySelector(".detail");
      const instruction = box?.querySelector<HTMLElement>(".instruction");
      const runs = [...(box?.querySelectorAll("table.runs tr.run") ?? [])];
      const lefts = (name: string) =>
        runs.map(
          (row) =>
            row.querySelector(`[data-cell="${name}"]`)?.getBoundingClientRect()
              .left ?? Number.NaN
        );
      return {
        line,
        repeats: line !== "" && (box?.textContent ?? "").includes(line),
        when: box?.querySelector(".when") !== null,
        list: instruction?.querySelector("ul li") !== null,
        clamped: instruction?.hasAttribute("data-clamped") ?? false,
        height: instruction?.getBoundingClientRect().height ?? 0,
        more:
          (
            box?.querySelector(".instruction-wrap .more") as HTMLElement | null
          )?.innerText.trim() ?? null,
        heads: [...(box?.querySelectorAll("table.runs th") ?? [])].map((th) =>
          th.textContent?.trim()
        ),
        runs: runs.length,
        when_: lefts("when"),
        outcome: lefts("outcome"),
        took: lefts("took"),
        tabular: runs.map(
          (row) =>
            getComputedStyle(row.querySelector("[data-cell='when']") as Element)
              .fontVariantNumeric
        ),
      };
    });
  const d = await read();
  kit.check(
    "detail 1440: the detail repeats nothing of the row: no schedule line",
    !(d.when || d.repeats),
    JSON.stringify({ line: d.line, when: d.when, repeats: d.repeats })
  );
  kit.check(
    "detail 1440: the instruction renders its markdown (its list a <ul>), clamped with More",
    d.list && d.clamped && d.more === "More",
    JSON.stringify({ list: d.list, clamped: d.clamped, more: d.more })
  );
  await page
    .locator("tbody.routine[data-routine='rt-curator'] .instruction-wrap .more")
    .click();
  await settle(page);
  const whole = await read();
  kit.check(
    "detail 1440: More shows the whole instruction, and says Less",
    !whole.clamped && whole.height > d.height && whole.more === "Less",
    `clamped ${d.height.toFixed(0)}px → ${whole.height.toFixed(0)}px, ${whole.more}`
  );
  kit.check(
    "detail 1440: Recent runs is a table (When, Outcome, Took, Result) whose columns start on one edge in every row, in tabular figures",
    JSON.stringify(d.heads) ===
      JSON.stringify(["When", "Outcome", "Took", "Result"]) &&
      d.runs === 3 &&
      spread(d.when_) <= 0.5 &&
      spread(d.outcome) <= 0.5 &&
      spread(d.took) <= 0.5 &&
      d.tabular.every((v) => v.includes("tabular-nums")),
    `${JSON.stringify(d.heads)}; when ${edges(d.when_)}; outcome ${edges(d.outcome)}; took ${edges(d.took)}`
  );
  await page.close();
}

/**
 * One clock per row: the schedule line and Next run read on the viewer's
 * clock; the zone a routine was set in, with its time there, is the line's
 * hover beside the exact next run.
 */
async function oneClock(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  await open(
    page,
    `${base}/project/${projectId}?view=routines`,
    () => document.querySelectorAll("tbody.routine").length >= 4
  );
  await settle(page);
  const rows = await page.evaluate(() => {
    const viewer = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [...document.querySelectorAll("tbody.routine")].map((body) => {
      const zone = body.getAttribute("data-zone") ?? "";
      return {
        zone,
        away: zone !== viewer,
        place: (zone.split("/").at(-1) ?? zone).replaceAll("_", " "),
        line: body.querySelector(".sub-words")?.textContent?.trim() ?? "",
        title: body.querySelector(".sub")?.getAttribute("title") ?? "",
        next:
          body.querySelector("[data-cell='next'] .time")?.textContent?.trim() ??
          "",
      };
    });
  });
  const clock = (text: string) => text.match(CLOCK)?.[1] ?? null;
  const bad = rows.filter(
    (row) =>
      clock(row.line) === null ||
      clock(row.line) !== clock(row.next) ||
      row.line.includes(row.place) ||
      !row.title.includes("next ") ||
      (row.away
        ? !row.title.includes(`${row.place} time · next `)
        : row.title.includes(" time ·"))
  );
  kit.check(
    "desk 1440: one clock per row: the schedule line's time is Next run's, no zone on the line; a routine set in another zone names it, with its time there, in the line's hover",
    rows.length === ROUTINES && bad.length === 0,
    JSON.stringify(rows)
  );
  await page.close();
}

/**
 * Asking Caw for a routine is the session Composer with words alone
 * (`attach` off), where CawField stood: New routine opens it over the
 * ledger; on an empty project a starter puts its words in it, unsent.
 */
async function asks(
  kit: Kit,
  base: string,
  projectId: string,
  emptyId: string
) {
  const page = await kit.page("desk");
  page.setDefaultTimeout(60_000);
  const composer = () =>
    page.evaluate((sel) => {
      const field = document.querySelector<HTMLElement>(`.ask-caw ${sel}`);
      return {
        field: field !== null,
        focused: field !== null && document.activeElement === field,
        value: field?.textContent ?? null,
        attach: document.querySelectorAll(".ask-caw .att-btn").length,
        path: location.pathname,
      };
    }, COMPOSER_FIELD);
  await open(
    page,
    `${base}/project/${projectId}?view=routines`,
    () => document.querySelectorAll("tbody.routine").length >= 4
  );
  await settle(page);
  await page.getByRole("button", { name: "New routine" }).click();
  await page.waitForSelector(`.ask-caw ${COMPOSER_FIELD}`);
  await settle(page);
  const opened = await composer();
  kit.check(
    "desk 1440: New routine opens the session Composer over the ledger, focused, with no attach control",
    opened.field && opened.focused && opened.attach === 0,
    JSON.stringify(opened)
  );

  await open(page, `${base}/project/${emptyId}?view=routines`, ".kit-chip");
  await settle(page);
  const chip = page.locator(".routine-starters .kit-chip").first();
  const words = (await chip.innerText()).trim();
  await chip.click();
  await settle(page);
  const picked = await composer();
  kit.check(
    "desk 1440, empty project: a starter puts its words in the Composer under it, unsent (the page stays)",
    picked.field &&
      picked.value === words &&
      picked.focused &&
      picked.attach === 0 &&
      picked.path === `/project/${emptyId}`,
    `${JSON.stringify(picked)}; chip "${words}"`
  );
  await page.close();
}

async function phone(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("phone");
  page.setDefaultTimeout(60_000);
  await open(
    page,
    `${base}/project/${projectId}?view=routines`,
    () => document.querySelectorAll("tbody.routine").length >= 4
  );
  await settle(page);
  const folded = await page.evaluate(() =>
    [...document.querySelectorAll("tbody.routine tr.row")].map((row) => ({
      column: getComputedStyle(
        row.querySelector("[data-cell='last']") as Element
      ).display,
      line: (row.querySelector(".folded") as HTMLElement | null)?.innerText
        .replace(/\s+/g, " ")
        .trim(),
      shown:
        (row.querySelector(".folded")?.getBoundingClientRect().width ?? 0) > 0,
    }))
  );
  kit.check(
    "phone 390: Last and Next leave their columns and fold into the schedule's line, in that order",
    folded.length === ROUTINES &&
      folded.every(
        (row) =>
          row.column === "none" && row.shown && FOLDED.test(row.line ?? "")
      ),
    JSON.stringify(folded)
  );
  await page.close();
}

/** The board's archived tasks, as the engine has them. */
const archiveState = (page: Page) =>
  page.evaluate(() => {
    const box = (selector: string) => {
      const r = document.querySelector(selector)?.getBoundingClientRect();
      return r && r.width > 0
        ? { left: r.left, right: r.right, width: r.width }
        : null;
    };
    return {
      vw: innerWidth,
      scrollW: document.documentElement.scrollWidth,
      rail: box(".archive-rail"),
      railOpen: box(".rail-open"),
      railCount:
        document.querySelector(".rail-open .count")?.textContent?.trim() ??
        null,
      railCards: document.querySelectorAll(".rail-open li[data-archived]")
        .length,
      railKind:
        document.querySelector(".rail-open .kind")?.textContent?.trim() ?? null,
      railOpacity: [
        ...document.querySelectorAll(".rail-open li[data-archived] > *"),
      ].map((card) => getComputedStyle(card).opacity),
      foldH:
        document.querySelector(".rail-close")?.getBoundingClientRect().height ??
        0,
      board: box(".board"),
      inColumns: document.querySelectorAll(".board li[data-archived]").length,
      focused: document.activeElement?.className ?? null,
    };
  });

async function archive(kit: Kit, base: string, projectId: string) {
  for (const device of ["desk", "phone"] as const) {
    const page = await kit.page(device);
    page.setDefaultTimeout(60_000);
    const at = `T5 rail at ${device === "desk" ? 1440 : 390}`;
    await open(page, `${base}/project/${projectId}`, ".archive-rail");
    await settle(page);
    const folded = await archiveState(page);
    kit.check(
      `${at}: folded, the Archived rail stands inside the viewport beside the columns, none of the ${ARCHIVED} in them`,
      folded.rail !== null &&
        folded.rail.left >= 0 &&
        folded.rail.right <= folded.vw &&
        folded.board !== null &&
        folded.board.right <= folded.rail.left &&
        folded.inColumns === 0 &&
        folded.scrollW <= folded.vw,
      JSON.stringify(folded)
    );
    await page.click(".archive-rail");
    await page.waitForSelector(".rail-open");
    await settle(page, 400);
    const opened = await archiveState(page);
    await page.screenshot({
      path: join(kit.out, `board-archived-open-${opened.vw}.png`),
    });
    kit.check(
      `${at}: pressed, the rail opens in view and lists the ${ARCHIVED} archived tasks, undimmed, under its count and the word archived, none in the columns; Fold the archive ${device === "phone" ? "a 44px touch target" : "30px tall"}`,
      opened.railCards === ARCHIVED &&
        opened.railCount === String(ARCHIVED) &&
        opened.railKind === "archived" &&
        opened.railOpacity.every((o) => o === "1") &&
        opened.foldH >= (device === "phone" ? 44 : 30) &&
        opened.inColumns === 0 &&
        opened.railOpen !== null &&
        opened.railOpen.left >= 0 &&
        opened.railOpen.right <= opened.vw &&
        opened.scrollW <= opened.vw &&
        (opened.focused ?? "").includes("rail-close"),
      JSON.stringify(opened)
    );
    await page.click(".rail-close");
    await page.waitForSelector(".archive-rail");
    await settle(page, 400);
    const closed = await archiveState(page);
    kit.check(
      `${at}: Fold the archive closes the rail again, the columns back as they were`,
      closed.railOpen === null &&
        closed.rail !== null &&
        closed.board !== null &&
        folded.board !== null &&
        Math.abs(closed.board.width - folded.board.width) <= 0.5 &&
        closed.inColumns === 0 &&
        (closed.focused ?? "").includes("archive-rail"),
      JSON.stringify(closed)
    );
    await page.close();
  }
}

const TASKS: { title: string; kind: string; archived?: boolean }[] = [
  { title: "Retry webhook deliveries on 5xx", kind: "todo" },
  { title: "Relay health check in the smoke suite", kind: "todo" },
  { title: "Move the changelog to one file per release", kind: "active" },
  { title: "Approve the beta note wording", kind: "you" },
  { title: "Bump Effect to 4.2", kind: "done" },
  { title: "Old relay docs page", kind: "done", archived: true },
  { title: "Retire the v1 changelog script", kind: "done", archived: true },
  { title: "Spike: poll GitHub every minute", kind: "dropped", archived: true },
];

// --- what the hub holds ---------------------------------------------------------

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const NEW_YORK = "America/New_York";
const QATAR = "Asia/Qatar";
/** Every routine is written with this; its real schedule is then set through the hub. */
const PLACEHOLDER_CRON = "0 0 1 1 *";

interface SeedRun {
  /** How long ago it started, in days. */
  ago: number;
  outcome: "delivered" | "silent" | "failed";
  output?: string;
  reason?: string;
  /** A delegate run's work item: its session's proposals are the routine's. */
  workItem?: string;
}

/** The busy project's delegate run whose session proposes an action through the hub. */
const PROPOSING_ROUTINE = "busy-4";
const PROPOSING_ITEM = "wi-busy-4";
const PROPOSING_SESSION = "probe-run-session";
const PROPOSED = "Move 2 issues to Ready";
interface SeedRoutine {
  createdBy?: string;
  cron: string;
  enabled?: boolean;
  /** An agent's routine turning itself off in this many days, unless kept. */
  expiresIn?: number;
  id: string;
  name: string;
  prompt: string;
  runs: SeedRun[];
  target: "delegate" | "lead" | "curator";
  zone: string;
}

const CURATOR_PROMPT = `You are this project's memory curator. Its sessions write notes into its inbox; you decide what of them the project keeps, and the person approves it.

- Lasting facts: memory_propose them, one call per file, with the file's whole new text and the ids of the notes it comes from.
- Every other note: memory_classify it.

Nothing you propose changes a file until the person approves it. Finish with finish_item, its headline NO_REPLY when you proposed nothing, else one line naming what you proposed.`;

/** The owner's four: three Caw made for the X account, and the memory curator the hub makes. */
const OWN: SeedRoutine[] = [
  {
    id: "rt-shortlist",
    name: "Daily reply shortlist for X",
    cron: "30 6 * * *",
    zone: NEW_YORK,
    target: "delegate",
    prompt:
      "Search X for today's posts @CawCoDev should reply to. Shortlist the best 10 to 15, each with its link, why it is worth a reply and an angle. Post nothing.",
    runs: [1, 2, 3].map((ago) => ({
      ago,
      outcome: "delivered",
      output: `Today's reply shortlist for @CawCoDev: ${10 + ago} posts. Nothing was posted.`,
    })),
  },
  {
    id: "rt-milestone",
    name: "Weekly X milestone check",
    cron: "0 9 * * 1",
    zone: NEW_YORK,
    target: "delegate",
    prompt:
      "Read @CawCoDev's follower counts and its posts' reach for the week. Say which milestone it passed since last Monday, or how far the next one is.",
    runs: [
      {
        ago: 2,
        outcome: "failed",
        reason:
          "None of the allowed x-use tools return @CawCoDev's follower counts, so no milestone could be checked.",
      },
      {
        ago: 9,
        outcome: "delivered",
        output: "No milestone passed this week.",
      },
    ],
  },
  {
    id: "rt-measure",
    name: "Measure posts after 48 hours",
    cron: "0 10 * * *",
    zone: NEW_YORK,
    target: "lead",
    prompt:
      "For each @CawCoDev post that turned 48 hours old since the last run, read its views, replies and follows. Say nothing when none did.",
    runs: [1, 2, 3].map((ago) => ({ ago, outcome: "silent" })),
  },
  {
    id: "rt-curator",
    name: "Memory curator",
    cron: "0 6 * * *",
    zone: QATAR,
    target: "curator",
    createdBy: "hub",
    prompt: CURATOR_PROMPT,
    runs: [1, 2, 3].map((ago) => ({
      ago,
      outcome: "silent",
      reason: "the inbox holds no notes to curate",
    })),
  },
];

/** The busy project's routines' names, schedules and zones, cycled to forty. */
const BUSY_KINDS = [
  ["Triage new issues", "0 9 * * 1-5", NEW_YORK],
  ["Smoke tests on merge", "0 3 * * *", NEW_YORK],
  ["Bump dependencies", "0 7 * * 1", QATAR],
  ["Write the changelog", "30 18 * * *", QATAR],
  ["Check the relay's health", "15 4 * * *", QATAR],
  ["Sum up yesterday's sessions", "30 8 * * *", QATAR],
  ["Label duplicate issues", "0 12 * * 1-5", NEW_YORK],
  ["Weekly release notes", "0 16 * * 5", QATAR],
] as const;
const busyRoutines = (): SeedRoutine[] =>
  Array.from({ length: BUSY }, (_, index) => {
    const [name, cron, zone] =
      BUSY_KINDS[index % BUSY_KINDS.length] ?? BUSY_KINDS[0];
    const failed = index % 9 === 3;
    return {
      id: `busy-${index}`,
      name:
        index < BUSY_KINDS.length
          ? name
          : `${name} (${Math.floor(index / BUSY_KINDS.length) + 1})`,
      cron,
      zone,
      target: `busy-${index}` === PROPOSING_ROUTINE ? "delegate" : "lead",
      createdBy: "caw",
      enabled: index % 11 !== 5,
      ...(index % 13 === 7 ? { expiresIn: 3 } : {}),
      prompt: `Do the ${name.toLowerCase()} for this project.\n\n- Read what changed since the last run\n- Say what you did in one line`,
      runs:
        index % 17 === 16
          ? []
          : [
              {
                ago: (index + 1) / 30,
                ...(`busy-${index}` === PROPOSING_ROUTINE
                  ? { workItem: PROPOSING_ITEM }
                  : {}),
                outcome: failed ? "failed" : "delivered",
                ...(failed
                  ? { reason: "the GitHub token was refused" }
                  : { output: `${name}: done.` }),
              },
            ],
    };
  });

/** The hub's answer to a change of a routine, as the owner makes it. */
async function patchRoutine(fleet: Fleet, id: string, change: object) {
  const response = await fetch(`${fleet.base}/api/routines/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!response.ok) {
    throw new Error(
      `PATCH routine ${id}: ${response.status} ${await response.text()}`
    );
  }
}

/**
 * Routines and their runs, written as the hub keeps them, each then given
 * its real schedule through the hub (a new schedule's next slot is the
 * hub's to work out, and starts no run).
 */
async function seedRoutines(
  fleet: Fleet,
  projectId: string,
  routines: SeedRoutine[]
) {
  const now = Date.now();
  for (const routine of routines) {
    fleet.write(
      "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, expires_at, next_slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?)",
      routine.id,
      projectId,
      routine.name,
      PLACEHOLDER_CRON,
      routine.zone,
      routine.target,
      routine.prompt,
      routine.enabled === false ? 0 : 1,
      routine.createdBy ?? "caw",
      routine.expiresIn === undefined ? 1 : 0,
      routine.expiresIn === undefined ? null : now + routine.expiresIn * DAY,
      now + 365 * DAY,
      now - 30 * DAY
    );
    routine.runs.forEach((run, index) => {
      const startedAt = now - run.ago * DAY;
      fleet.write(
        "INSERT INTO routine_runs (id, routine_id, slot, attempt, state, outcome, output, reason, work_item_id, started_at, ended_at) VALUES (?, ?, ?, 1, 'ended', ?, ?, ?, ?, ?, ?)",
        `${routine.id}-run-${index}`,
        routine.id,
        new Date(startedAt).toISOString(),
        run.outcome,
        run.output ?? null,
        run.reason ?? null,
        run.workItem ?? null,
        startedAt,
        startedAt + 4 * MIN
      );
    });
    await patchRoutine(fleet, routine.id, { cron: routine.cron });
  }
}

/**
 * The busy project's event sources (three routes, two connector polls, one
 * of them failing) and its five approved actions (two waiting on you), one
 * of them proposed by busy-2's run.
 */
async function seedSources(fleet: Fleet, projectId: string) {
  const now = Date.now();
  const connection = async (name: string, service: string) => {
    await fleet.api("/api/connections", {
      name,
      service,
      account: "@cawco",
      transport: "http",
      url: "http://127.0.0.1:9/mcp",
      auth: "none",
    });
    return name;
  };
  const gmail = await connection("support-mail", "gmail");
  const github = await connection("repo-stats", "github");
  // Two routes to busy-1 that differ only by a label filter; the labelled
  // one is older, so a merged pull request labelled `release` (which both
  // match) is delivered by it, and an unlabelled one by the other.
  const ROUTES = [
    [LABEL_ROUTE, "github:*", ["pr.merged"], RELEASE, "busy-1"],
    [PLAIN_ROUTE, "github:*", ["pr.merged"], null, "busy-1"],
    ["route-linear", "conn:linear-issues:*", ["item"], null, "busy-0"],
    ["route-slack", "conn:slack-releases:*", ["item"], null, "busy-7"],
  ] as const;
  ROUTES.forEach(([id, source, kinds, label, routineId], index) => {
    fleet.write(
      "INSERT INTO event_routes (id, project_id, source, kinds, label, routine_id, enabled, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'owner', ?)",
      id,
      projectId,
      source,
      JSON.stringify(kinds),
      label,
      routineId,
      now - (ROUTES.length - index) * MIN
    );
  });
  const POLLS = [
    [gmail, "list_messages", 900, null],
    [github, "list_stargazers", 3600, "rate limited"],
  ] as const;
  POLLS.forEach(([connectionId, tool, intervalS, reason], index) => {
    fleet.write(
      "INSERT INTO connector_polls (id, project_id, connection, tool, args, interval_s, items_path, id_path, version_path, enabled, reason, polled_at, created_by, created_at) VALUES (?, ?, ?, ?, '{}', ?, '', 'id', 'id', 1, ?, ?, 'owner', ?)",
      `poll-${index}`,
      projectId,
      connectionId,
      tool,
      intervalS,
      reason,
      now - (index + 1) * 6 * MIN,
      now
    );
  });
  // As the hub keeps them: each names the routine whose run proposed it.
  const ACTIONS = [
    ["github", "Close 3 duplicate issues", "proposed", "busy-6", null],
    [
      "slack",
      "Post the release notes in #releases",
      "proposed",
      "busy-7",
      null,
    ],
    ["github", "Open the dependency bump pull request", "done", "busy-2", null],
    ["gmail", "Reply to a support thread", "denied", "busy-5", null],
    ["linear", "Move 4 issues to Ready", "failed", "busy-0", now - DAY],
  ] as const;
  ACTIONS.forEach(([service, reason, state, routineId, checkedAt], index) => {
    const args = JSON.stringify({ index });
    const at = now - (index + 1) * DAY;
    fleet.write(
      "INSERT INTO actions (id, project_id, task_id, connection, service, account, tool, args, args_hash, run_at, reason, proposed_by, routine_id, run_id, state, idempotency_key, approved_at, started_at, ended_at, error, checked_at, created_at) VALUES (?, ?, NULL, ?, ?, '@cawco', 'call', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      `action-${index}`,
      projectId,
      service === "gmail" ? gmail : github,
      service,
      args,
      new Bun.CryptoHasher("sha256").update(args).digest("hex"),
      reason,
      `session-of-${routineId}`,
      routineId,
      `${routineId}-run-0`,
      state,
      `cawco-action-${index}`,
      state === "done" || state === "failed" ? at : null,
      state === "done" || state === "failed" ? at : null,
      state === "proposed" ? null : at + MIN,
      state === "failed" ? "Linear refused the token" : null,
      checkedAt,
      at
    );
  });
}

// --- GitHub, faked: what the poller reads ------------------------------------------

const REPO = "cawco/fleet-ops";
const GITHUB_TOKEN = `ghp_probe_${crypto.randomUUID().replaceAll("-", "")}`;
const RELEASE = "release";
const LABEL_ROUTE = "route-release";
const PLAIN_ROUTE = "route-merged";
/** How long ago the labelled pull request's event is said to have landed. */
const LABELLED_AGO = 3 * 60 * MIN;

/** The repository's pull requests, as GitHub lists them; the probe adds to it. */
const pulls: { label: string | null; number: number }[] = [];

/** GitHub's REST lists the poller reads: the pulls above, nothing else. */
function fakeGitHub(): string {
  const at = new Date().toISOString();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      if (request.headers.get("authorization") !== `Bearer ${GITHUB_TOKEN}`) {
        return Response.json({ message: "Bad credentials" }, { status: 401 });
      }
      if (url.pathname === `/repos/${REPO}/pulls`) {
        return Response.json(
          pulls.map((pr) => ({
            number: pr.number,
            html_url: `https://github.com/${REPO}/pull/${pr.number}`,
            title: `PR ${pr.number}`,
            body: null,
            user: { login: "alice" },
            labels: pr.label ? [{ name: pr.label }] : [],
            head: { ref: `feature-${pr.number}` },
            base: { repo: { full_name: REPO } },
            state: "closed",
            created_at: at,
            updated_at: new Date().toISOString(),
            closed_at: new Date().toISOString(),
            merged_at: new Date().toISOString(),
          }))
        );
      }
      if (url.pathname.startsWith(`/repos/${REPO}/issues`)) {
        return Response.json([]);
      }
      return new Response("not found", { status: 404 });
    },
  });
  return `http://127.0.0.1:${server.port}`;
}

/**
 * The busy project's repository polled through the hub's own GitHub poller:
 * two merged pull requests, one labelled `release`, each routed by the hub,
 * which records the route that delivered it. The labelled one's landing is
 * then dated three hours back, so the two routes' Last read differ.
 * Answers the route the hub recorded for each.
 */
async function deliverPulls(
  fleet: Fleet,
  projectId: string
): Promise<{ labelled: string | null; plain: string | null }> {
  const send = async (method: string, path: string, body: object) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${path}: ${response.status} ${await response.text()}`);
    }
  };
  await fleet.api("/api/connections", {
    name: "gh-fleet-ops",
    service: "github",
    account: "probe",
    transport: "http",
    url: "http://127.0.0.1:9/mcp",
    auth: "bearer",
  });
  await send("PUT", "/api/connections/gh-fleet-ops/key", { key: GITHUB_TOKEN });
  await send("PUT", `/api/projects/${projectId}/ingress/github`, {
    connection: "gh-fleet-ops",
  });
  const poll = () =>
    send("POST", `/api/projects/${projectId}/ingress/github/poll`, {});
  // The poller's first poll only sets its mark.
  await poll();
  pulls.push({ number: 12, label: RELEASE }, { number: 13, label: null });
  await poll();
  const routeOf = (key: string) =>
    fleet.query<{ route_id: string | null }>(
      "SELECT route_id FROM inbound_events WHERE delivery_key = ? AND routed_to IS NOT NULL",
      key
    )[0];
  await until(
    "both merged pull requests routed",
    () => [routeOf("pr:12:merged"), routeOf("pr:13:merged")],
    (rows) => rows.every((row) => row !== undefined),
    30_000
  );
  fleet.write(
    "UPDATE inbound_events SET received_at = ? WHERE delivery_key = 'pr:12:merged'",
    Date.now() - LABELLED_AGO
  );
  return {
    labelled: routeOf("pr:12:merged")?.route_id ?? null,
    plain: routeOf("pr:13:merged")?.route_id ?? null,
  };
}

/** A stdio MCP stub with one tool an action may call. */
const TRACKER_STUB = `
let buffer = "";
const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf("\\n"); at >= 0; at = buffer.indexOf("\\n")) {
    const line = buffer.slice(0, at);
    buffer = buffer.slice(at + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.method === "initialize") {
      send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "tracker-stub", version: "1" } } });
    } else if (m.method === "tools/list") {
      send({ jsonrpc: "2.0", id: m.id, result: { tools: [{ name: "move_issues", description: "Moves issues to a state.", inputSchema: { type: "object", properties: { state: { type: "string" } } } }] } });
    } else if (m.id !== undefined) {
      send({ jsonrpc: "2.0", id: m.id, result: {} });
    }
  }
});
`;

/**
 * A routine's delegate run proposes an action through the hub's own
 * `action_propose`, as its session would: a worker session whose work item
 * is busy-4's run, holding its session credential, on a connection the
 * project lists. Answers what the hub recorded.
 */
async function proposeFromRun(
  fleet: Fleet,
  projectId: string
): Promise<{ routineId: string | null; runId: string | null }> {
  const stub = join(fleet.sandbox, "tracker-stub.cjs");
  await writeFile(stub, TRACKER_STUB);
  await fleet.api("/api/connections", {
    name: "ops-tracker",
    service: "linear",
    account: "@cawco",
    transport: "stdio",
    command: process.execPath,
    args: [stub],
    auth: "none",
    projects: [projectId],
  });
  fleet.write(
    "INSERT INTO instances (id, machine_id, cwd, project_id, work_item_id, role, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'worker', 'Check the relay', ?, ?)",
    PROPOSING_SESSION,
    MACHINE,
    fleet.repo,
    projectId,
    PROPOSING_ITEM,
    Date.now(),
    Date.now()
  );
  const credential = randomBytes(32).toString("base64url");
  fleet.write(
    "INSERT INTO session_identities (instance_id, credential_hash, installed_at) VALUES (?, ?, ?)",
    PROPOSING_SESSION,
    new Bun.CryptoHasher("sha256").update(credential).digest("hex"),
    Date.now()
  );
  const response = await fetch(
    `${fleet.base}/api/delegation/call/${PROPOSING_SESSION}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "action_propose",
        arguments: {
          connection: "ops-tracker",
          tool: "move_issues",
          args: { state: "Ready" },
          reason: PROPOSED,
        },
      }),
    }
  );
  const said = await response.text();
  if (!response.ok) {
    throw new Error(`action_propose: ${response.status} ${said}`);
  }
  const [action] = fleet.query<{
    routine_id: string | null;
    run_id: string | null;
  }>(
    "SELECT routine_id, run_id FROM actions WHERE proposed_by = ?",
    PROPOSING_SESSION
  );
  return {
    routineId: action?.routine_id ?? null,
    runId: action?.run_id ?? null,
  };
}

const spec: Spec = {
  name: "routines-view",
  async run(kit) {
    const fleet = await kit.fleet((_: Seen) => ({
      everyMs: 20,
      words: ["Ready."],
    }));
    fleet.env.CAWCO_GITHUB_API = fakeGitHub();
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "cawco",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
      template: "code",
    });
    // Its own checkout, whose origin is on github.com: the poller reads it.
    const busyRepo = join(fleet.sandbox, "fleet-ops");
    await mkdir(busyRepo, { recursive: true });
    await Bun.$`git init -q -b main && echo ops > README.md && git add -A && git -c user.name=Owner -c user.email=owner@probe.test commit -qm 'First commit' && git remote add origin https://github.com/${REPO}.git`
      .cwd(busyRepo)
      .quiet();
    const busy = await fleet.api<{ id: string }>("/api/projects", {
      name: "Fleet ops",
      machineId: MACHINE,
      cwd: busyRepo,
      caw: false,
      template: "code",
    });
    await until(
      "Fleet ops' remote",
      () =>
        fleet.query<{ remote: string | null }>(
          "SELECT remote FROM projects WHERE id = ?",
          busy.id
        )[0]?.remote,
      (remote) => remote === `github.com/${REPO}`,
      60_000
    );
    // No routines: the empty page's starters over the Composer.
    const empty = await fleet.api<{ id: string }>("/api/projects", {
      name: "Field notes",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const { stages } = await fleet.api<{
      stages: { kind: string; name: string }[];
    }>(`/api/projects/${project.id}/stages`);
    for (const task of TASKS) {
      const made = await fleet.api<{ id: string }>(
        `/api/projects/${project.id}/tasks`,
        { title: task.title }
      );
      const stage = stages.find((each) => each.kind === task.kind)?.name;
      if (stage && task.kind !== "todo") {
        await fleet.api(`/api/projects/${project.id}/tasks/${made.id}/stage`, {
          stage,
        });
      }
      if (task.archived) {
        await fleet.api(
          `/api/projects/${project.id}/tasks/${made.id}/archive`,
          { archived: true }
        );
      }
    }
    await seedRoutines(fleet, project.id, OWN);
    await seedRoutines(fleet, busy.id, busyRoutines());
    await seedSources(fleet, busy.id);
    const delivered = await deliverPulls(fleet, busy.id);
    kit.check(
      "hub: of two routes to one routine that differ only by a label filter, each merged pull request records the route that delivered it (the oldest matching)",
      delivered.labelled === LABEL_ROUTE && delivered.plain === PLAIN_ROUTE,
      JSON.stringify(delivered)
    );
    const proposed = await proposeFromRun(fleet, busy.id);
    kit.check(
      "hub: an action a routine's delegate run proposes through action_propose records that routine and run",
      proposed.routineId === PROPOSING_ROUTINE &&
        proposed.runId === `${PROPOSING_ROUTINE}-run-0`,
      JSON.stringify(proposed)
    );
    const base = await fleet.dashboard();
    await tabs(kit, base, project.id);
    await bento(kit, base, busy.id);
    await detail(kit, base, project.id);
    await oneClock(kit, base, project.id);
    await asks(kit, base, project.id, empty.id);
    await phone(kit, base, project.id);
    await archive(kit, base, project.id);
  },
};
export default spec;
