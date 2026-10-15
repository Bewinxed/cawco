/**
 * The routines preview after the owner's pins of 2026-10-15:
 *
 * 1. "the 'tomorrow, failed xx on the right ... don't line up at all, and
 *    they don't follow a consistent structure": the routines are a ledger
 *    whose Last run and Next run are fixed columns.
 * 2. "this bento looks terrible on wider screens, why isn't it adapting to
 *    the layout": the ledger stops at --c-routines-w; Event sources and
 *    Approved actions stand in a rail beside it once the page's place is
 *    1280px wide or more, under it below that.
 * 3. "this button doesn't seem to do anything" (T5, archived tasks): the
 *    archive rail stood after the board's last column, past the viewport's
 *    edge, and Dimmed in place changed nothing until a second control was
 *    pressed. Both now show on the board as they are picked.
 *
 * On the built dashboard against a scratch fleet: "cawco" (code stages, the
 * preview's four routines, three archived tasks among its tasks).
 *
 * Widths 1024, 1440, 1920, 2560:
 * - every row's Last and Next time starts on one edge (getBoundingClientRect,
 *   within 0.5px), and every time cell computes tabular-nums;
 * - the ledger is no wider than --c-routines-w;
 * - the rail stands beside the ledger when the place is ≥ 1280px, under it
 *   (same leading edge, below its foot) when narrower.
 * Phone 390: Last and Next fold into the schedule's line.
 * T5 at desk 1440: the rail is inside the viewport, opens, and lists the
 * three; picking Dimmed in place shows the three dimmed in their columns,
 * the first brought into the board's view.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one width at a time
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const WIDTHS = [1024, 1440, 1920, 2560];
const RAIL_AT = 1280;
const ROUTINES = 4;
const ARCHIVED = 3;
/** A folded row's line: Last, then Next, after the schedule's words. */
const FOLDED = /^· Last .+ · Next .+$/;

/** The ledger's and the rail's geometry, read off the engine. */
const ledger = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r
        ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        : null;
    };
    const rows = [...document.querySelectorAll("tbody.routine tr.row")];
    const lefts = (cell: string) =>
      rows.map(
        (row) =>
          row
            .querySelector(`[data-cell="${cell}"] .time`)
            ?.getBoundingClientRect().left ?? Number.NaN
      );
    const times = [
      ...document.querySelectorAll(
        "[data-cell='last'] .time, [data-cell='next'] .time"
      ),
    ];
    const cap = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--c-routines-w"
      )
    );
    return {
      rows: rows.length,
      last: lefts("last"),
      next: lefts("next"),
      texts: rows.map((row) =>
        [...row.querySelectorAll("[data-cell] .time")].map((t) =>
          t.textContent?.trim()
        )
      ),
      tabular: times.map((t) => getComputedStyle(t).fontVariantNumeric),
      place:
        document.querySelector(".routines-place")?.getBoundingClientRect()
          .width ?? 0,
      cap,
      table: box(document.querySelector(".ledger")),
      side: box(document.querySelector(".routines-view > .side")),
    };
  });

const spread = (values: number[]) =>
  values.some(Number.isNaN)
    ? Number.POSITIVE_INFINITY
    : Math.max(...values) - Math.min(...values);

async function widths(kit: Kit, base: string, projectId: string) {
  const page = await kit.page("desk", {
    init: [
      () =>
        localStorage.setItem(
          "cawco.preview.routines-picks.v3",
          JSON.stringify({ place: "tab", archived: "dim" })
        ),
    ],
  });
  page.setDefaultTimeout(60_000);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await open(
      page,
      `${base}/project/${projectId}?view=routines`,
      () => document.querySelectorAll("tbody.routine").length >= 4
    );
    await settle(page);
    const g = await ledger(page);
    const at = `${width}`;
    kit.check(
      `${at}: the ledger draws the ${ROUTINES} routines`,
      g.rows === ROUTINES,
      `${g.rows}`
    );
    kit.check(
      `${at}: every row's Last and Next time starts on one edge (≤ 0.5px)`,
      spread(g.last) <= 0.5 && spread(g.next) <= 0.5,
      `last ${g.last.map((x) => x.toFixed(2)).join(",")}; next ${g.next
        .map((x) => x.toFixed(2))
        .join(",")}; ${JSON.stringify(g.texts)}`
    );
    kit.check(
      `${at}: every time cell computes tabular-nums`,
      g.tabular.length === ROUTINES * 2 &&
        g.tabular.every((v) => v.includes("tabular-nums")),
      `${g.tabular.length} cells: ${[...new Set(g.tabular)].join(" | ")}`
    );
    const tableW = g.table ? g.table.right - g.table.left : Number.NaN;
    kit.check(
      `${at}: the ledger is no wider than --c-routines-w`,
      g.cap > 0 && tableW <= g.cap + 0.5,
      `ledger ${tableW.toFixed(1)}, cap ${g.cap}`
    );
    const { table, side } = g;
    if (g.place >= RAIL_AT) {
      kit.check(
        `${at}: the place is ${g.place.toFixed(0)}px (≥ ${RAIL_AT}): the rail stands beside the ledger`,
        table !== null &&
          side !== null &&
          side.left >= table.right &&
          Math.abs(side.top - table.top) < table.bottom - table.top,
        JSON.stringify({ table, side })
      );
    } else {
      kit.check(
        `${at}: the place is ${g.place.toFixed(0)}px (< ${RAIL_AT}): the two sections stack under the ledger`,
        table !== null &&
          side !== null &&
          side.top >= table.bottom &&
          Math.abs(side.left - table.left) <= 0.5,
        JSON.stringify({ table, side })
      );
    }
  }
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
    // The routines are the dashboard's preview data, keyed on this name.
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "cawco",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
      template: "code",
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
    await widths(kit, base, project.id);
    await phone(kit, base, project.id);
    await archive(kit, base, project.id);
  },
};
export default spec;
