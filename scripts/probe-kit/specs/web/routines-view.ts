/**
 * The routines preview after the owner's pins of 2026-10-15:
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
 * 4. T5, "this button doesn't seem to do anything": the archive rail stood
 *    past the viewport's edge, and Dimmed in place changed nothing until a
 *    second control was pressed.
 *
 * On the built dashboard against a scratch fleet: "cawco" (code stages, the
 * preview's four routines, three archived tasks), "Fleet ops" (forty
 * routines, event sources, actions), "Field notes" (no routines).
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
 * T5 at desk 1440: the rail is inside the viewport, opens, and lists the
 * three; picking Dimmed in place shows them dimmed in their columns, the
 * first brought into the board's view.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one width at a time
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

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
    const b = await bentoOf(page);
    const heads = b.panels.map((panel) =>
      panel.head?.match(TITLED)?.slice(1, 3)
    );
    kit.check(
      `${at}: Fleet ops is a bento of Routines ${BUSY}, Event sources 5 and Approved actions 5, each head with its needs-you mark (failing routines, a failing source, actions waiting)`,
      b.layout === "bento" &&
        JSON.stringify(heads) ===
          JSON.stringify([
            ["Routines", String(BUSY)],
            ["Event sources", "5"],
            ["Approved actions", "5"],
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
  const cell = await page
    .locator("tbody.routine[data-routine='busy-2'] td.col-last")
    .boundingBox();
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
    page.evaluate(() => {
      const field =
        document.querySelector<HTMLTextAreaElement>(".ask-caw textarea");
      return {
        field: field !== null,
        focused: field !== null && document.activeElement === field,
        value: field?.value ?? null,
        attach: document.querySelectorAll(".ask-caw .att-btn").length,
        path: location.pathname,
      };
    });
  await open(
    page,
    `${base}/project/${projectId}?view=routines`,
    () => document.querySelectorAll("tbody.routine").length >= 4
  );
  await settle(page);
  await page.getByRole("button", { name: "New routine" }).click();
  await page.waitForSelector(".ask-caw textarea");
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
    const board = document.querySelector(".board")?.getBoundingClientRect();
    const rail = document
      .querySelector(".archive-rail")
      ?.getBoundingClientRect();
    const dimmed = [...document.querySelectorAll("li[data-archived]")];
    const first = dimmed[0]?.getBoundingClientRect();
    return {
      vw: innerWidth,
      rail: rail ? { left: rail.left, right: rail.right } : null,
      openCards: document.querySelectorAll(".rail-open li[data-archived]")
        .length,
      openBox: (() => {
        const r = document.querySelector(".rail-open")?.getBoundingClientRect();
        return r ? { left: r.left, right: r.right } : null;
      })(),
      dimmed: dimmed.length,
      opacity: dimmed.map(
        (li) => getComputedStyle(li.firstElementChild as Element).opacity
      ),
      firstInView:
        first && board
          ? first.left >= board.left - 0.5 && first.right <= board.right + 0.5
          : false,
      toggle:
        document
          .querySelector(".archived-toggle")
          ?.getAttribute("aria-pressed") ?? null,
    };
  });

async function archive(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("desk", {
    init: [
      () =>
        localStorage.setItem(
          "cawco.preview.routines-picks.v3",
          JSON.stringify({ place: "tab", archived: "rail" })
        ),
    ],
  });
  page.setDefaultTimeout(60_000);
  await open(page, `${base}/project/${projectId}`, ".archive-rail");
  await settle(page);
  const folded = await archiveState(page);
  kit.check(
    "T5 rail at 1440: the folded archive stands inside the viewport",
    folded.rail !== null &&
      folded.rail.left >= 0 &&
      folded.rail.right <= folded.vw,
    JSON.stringify(folded)
  );
  await page.click(".archive-rail");
  await page.waitForSelector(".rail-open");
  await settle(page);
  const opened = await archiveState(page);
  kit.check(
    `T5 rail at 1440: pressed, the Archive opens in view and lists the ${ARCHIVED} archived tasks`,
    opened.openCards === ARCHIVED &&
      opened.openBox !== null &&
      opened.openBox.right <= opened.vw,
    JSON.stringify(opened)
  );

  // The owner's move: the switch, to Dimmed in place.
  await page
    .locator("button.kit-segment", { hasText: "Dimmed in place" })
    .click();
  await page.waitForFunction(
    (n) => document.querySelectorAll("li[data-archived]").length === n,
    ARCHIVED
  );
  await settle(page, 400);
  const dim = await archiveState(page);
  kit.check(
    `T5 dimmed at 1440: picking Dimmed in place shows the ${ARCHIVED} dimmed in their columns, the rail gone`,
    dim.dimmed === ARCHIVED &&
      dim.rail === null &&
      dim.openCards === 0 &&
      dim.toggle === "true" &&
      dim.opacity.every((o) => Number(o) < 1),
    JSON.stringify(dim)
  );
  kit.check(
    "T5 dimmed at 1440: the first dimmed card is brought into the board's view",
    dim.firstInView,
    JSON.stringify(dim)
  );
  await page.close();
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

const spec: Spec = {
  name: "routines-view",
  async run(kit) {
    const fleet = await kit.fleet((_: Seen) => ({
      everyMs: 20,
      words: ["Ready."],
    }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    // The routines are the dashboard's preview data, keyed on these names.
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "cawco",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
      template: "code",
    });
    const busy = await fleet.api<{ id: string }>("/api/projects", {
      name: "Fleet ops",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
      template: "code",
    });
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
