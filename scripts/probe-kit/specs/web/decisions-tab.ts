/**
 * The project page's Decisions tab (PRD §5.8), read from the engine on a
 * scratch fleet seeded with three decision pages (scripts/decisions-preview
 * seed.ts), at desk 1440 and phone 390:
 *
 * - the tab lists the three with their progress copy (`5 of 12 picked ·
 *   2 notes`, `5 of 6 decided · 3 tasks` with Decided, `2 of 5 picked ·
 *   1 note`), and its trail counts the two still picked on;
 * - the picking page opens in place, live: its frame on its session's
 *   origin holds the five picks, and the composer offers I'm done picking;
 * - the decided page is its record: a card per decision with its question,
 *   the chosen chip, `Left open` for the one left open, the person's note
 *   led by their mark, and task chips that open the task's sheet, which says
 *   `Decided on Price the hosted plan › What shape is the plan?`;
 * - no element's text holds a card or option id;
 * - a card's fold opens over the update notice's fold and shows the options
 *   turned down, the writer's Recommended mark on the one recommended;
 * - the graph draws the file's seven cards, two groups and six edges, its
 *   four picked cards ringed.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time, as a hand makes them
import type { Page } from "playwright-core";
import {
  LANDING,
  ONBOARDING,
  PRICING,
  seedDecisions,
} from "../../../decisions-preview/seed";
import { MACHINE } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle, type View } from "../../kit";

const IDS = [
  ...[LANDING, PRICING, ONBOARDING].flatMap((page) =>
    page.cards.flatMap((card) => [
      card.id,
      ...card.options.map((option) => option.id),
    ])
  ),
];

/** Each tile as the tab draws it: its title, its figure, its notes and its pill. */
const tiles = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".decisions a.tile")].map(
      (tile) => ({
        title: tile.querySelector(".title")?.textContent?.trim() ?? "",
        figure: tile.querySelector(".num")?.textContent?.trim() ?? "",
        more: tile.querySelector(".more")?.textContent?.trim() ?? null,
        pill:
          tile
            .querySelector(".state-pill")
            ?.textContent?.replace(/\s+/g, " ")
            .trim() ?? null,
        width: Math.round(tile.getBoundingClientRect().width),
        left: Math.round(tile.getBoundingClientRect().left),
      })
    )
  );

/** Every text the pane draws that holds one of `ids`. */
const idsShown = (page: Page, ids: string[]) =>
  page.evaluate((wanted) => {
    const root = document.querySelector(".decisions") ?? document.body;
    const found: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (const id of wanted) {
        if (text.includes(id)) {
          found.push(`${id} in "${text.trim().slice(0, 60)}"`);
        }
      }
    }
    return found;
  }, ids);

async function listed(kit: Kit, page: Page, view: View) {
  await page.waitForFunction(
    () => document.querySelectorAll(".decisions a.tile").length === 3
  );
  // The decided page's session ends the turn Make tasks woke (the mock
  // answers at once): its pill reads Decided from then on.
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".decisions a.tile .state-pill")].some(
      (pill) => pill.textContent?.trim() === "Decided"
    )
  );
  const read = await tiles(page);
  const by = Object.fromEntries(read.map((tile) => [tile.title, tile]));
  kit.check(
    `${view}: the tab lists the three pages with their progress`,
    by["Landing page hero"]?.figure === "5 of 12 picked" &&
      by["Landing page hero"]?.more === "· 2 notes" &&
      by["Landing page hero"]?.pill === null &&
      by["Price the hosted plan"]?.figure === "5 of 6 decided · 3 tasks" &&
      by["Price the hosted plan"]?.pill === "Decided" &&
      by["Price the hosted plan"]?.more === null &&
      by["Shape onboarding"]?.figure === "2 of 5 picked" &&
      by["Shape onboarding"]?.more === "· 1 note",
    JSON.stringify(
      read.map(({ title, figure, more, pill }) => ({
        title,
        figure,
        more,
        pill,
      }))
    )
  );
  const trail = await page.evaluate(
    () =>
      document
        .querySelector('.ff-tab:has(a[href*="view=decisions"]) .tab-num')
        ?.textContent?.trim() ?? null
  );
  kit.check(
    `${view}: the tab's trail counts the two pages still picked on`,
    trail === "2",
    `trail ${trail}`
  );
  const columns = new Set(read.map((tile) => tile.left)).size;
  kit.check(
    `${view}: the tiles stand ${view === "desk" ? "across one row" : "in one column"}`,
    view === "desk" ? columns === 3 : columns === 1,
    `${columns} column(s), widths ${read.map((tile) => tile.width).join(", ")}`
  );
  const shown = await idsShown(page, IDS);
  kit.check(
    `${view}: no tile shows a card or option id`,
    shown.length === 0,
    shown.join("; ")
  );
}

async function picking(kit: Kit, page: Page, view: View, url: string) {
  await open(page, `${url}&page=landing`, ".decisions .page-head");
  const frame = await page.waitForSelector("iframe.kit-page");
  const src = (await frame.getAttribute("src")) ?? "";
  const inner = await frame.contentFrame();
  const picked = inner
    ? await inner
        .waitForFunction(
          () => document.querySelectorAll("[data-cawco-picked]").length === 5,
          null,
          { timeout: 30_000 }
        )
        .then(() => true)
        .catch(() => false)
    : false;
  kit.check(
    `${view}: the picking page opens in place, live on its session's origin, its five picks kept`,
    src.includes("/__cawco/page/") && picked,
    `src ${src}, picks shown ${picked}`
  );
  const dock = await page.evaluate(() => ({
    primary:
      document.querySelector(".dock .primary")?.textContent?.trim() ?? null,
    placeholder:
      document.querySelector<HTMLTextAreaElement>(
        ".dock textarea:not([aria-hidden])"
      )?.placeholder ?? null,
    figure:
      document.querySelector(".page-head .num")?.textContent?.trim() ?? null,
  }));
  kit.check(
    `${view}: its composer offers I'm done picking, its head says 5 of 12 picked`,
    dock.primary === "I'm done picking" &&
      dock.placeholder === "Add a note…" &&
      dock.figure === "5 of 12 picked",
    JSON.stringify(dock)
  );
}

async function decided(kit: Kit, page: Page, view: View, url: string) {
  await open(page, `${url}&page=pricing`, ".decisions .record");
  await settle(page);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".record")].map((card) => ({
      question: card.querySelector(".question")?.textContent?.trim() ?? "",
      // The keycap and the label, each its own box in the chip: read apart.
      chosen: [...card.querySelectorAll(".chosen .kit-chip.sel")].map(
        (chip) =>
          `${chip.querySelector(".kit-keycap")?.textContent?.trim() ?? ""} ${chip.querySelector(".label")?.textContent?.trim() ?? ""}`
      ),
      open: card.querySelector(".open-card")?.textContent?.trim() ?? null,
      note: card.querySelector(".note .words")?.textContent?.trim() ?? null,
      mark: card.querySelector(".note .mark") !== null,
      tasks: [...card.querySelectorAll<HTMLAnchorElement>(".tasks a")].map(
        (chip) => ({
          text: chip.textContent?.replace(/\s+/g, " ").trim() ?? "",
          href: chip.getAttribute("href") ?? "",
        })
      ),
      left: Math.round(card.getBoundingClientRect().left),
    }))
  );
  const by = Object.fromEntries(cards.map((card) => [card.question, card]));
  const shape = by["What shape is the plan?"];
  kit.check(
    `${view}: the decided page is its record: questions, chosen chips, Left open, notes led by the mark`,
    cards.length === 6 &&
      shape?.chosen[0] === "2 Per machine" &&
      shape?.note === "machines are what cost us" &&
      shape?.mark === true &&
      by["Pricing in the top bar?"]?.open === "Left open" &&
      by["Pricing in the top bar?"]?.chosen.length === 0 &&
      by["How long is the trial?"]?.chosen[0] === "2 A month",
    JSON.stringify(
      cards.map(({ question, chosen, open: left, note }) => ({
        question,
        chosen,
        left,
        note,
      }))
    )
  );
  const chips = cards.flatMap((card) => card.tasks);
  kit.check(
    `${view}: its task chips name their tasks and link to the task's sheet`,
    chips.length === 3 &&
      chips.every((chip) => chip.href.includes("task=tsk-")) &&
      shape?.tasks[0]?.text.endsWith("Bill by machine joined") === true,
    JSON.stringify(chips)
  );
  const columns = new Set(cards.map((card) => card.left)).size;
  kit.check(
    `${view}: the record stands ${view === "desk" ? "two across" : "in one column"}`,
    view === "desk" ? columns === 2 : columns === 1,
    `${columns} column(s)`
  );
  const shown = await idsShown(page, IDS);
  kit.check(
    `${view}: no element shows a card or option id`,
    shown.length === 0,
    shown.join("; ")
  );

  // The fold: the trial's turned-down option wears the writer's Recommended mark.
  const trial = page.locator(".record", { hasText: "How long is the trial?" });
  const toggle = trial.locator(".fold-row button");
  const before = (await toggle.textContent())?.replace(/\s+/g, " ").trim();
  await toggle.click();
  await settle(page);
  const fold = await trial.evaluate((card) => {
    const inner = card.querySelector<HTMLElement>(".fold-inner");
    return {
      open: card.querySelector(".fold")?.hasAttribute("data-open") ?? false,
      opacity: inner ? getComputedStyle(inner).opacity : null,
      height: Math.round(inner?.getBoundingClientRect().height ?? 0),
      toggle:
        card
          .querySelector(".fold-row button")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      others: [...card.querySelectorAll(".other")].map((row) => ({
        text: row.textContent?.replace(/\s+/g, " ").trim() ?? "",
        tag: row.querySelector(".tag")?.textContent?.trim() ?? null,
        faded: getComputedStyle(row.querySelector(".kit-chip") as Element)
          .opacity,
      })),
      why: card.querySelector(".fold .why")?.textContent?.trim() ?? null,
    };
  });
  kit.check(
    `${view}: the fold opens on the options turned down, the recommended one marked`,
    before === "1 other option" &&
      fold.open &&
      fold.opacity === "1" &&
      fold.height > 0 &&
      fold.toggle === "Hide other options" &&
      fold.others.length === 1 &&
      fold.others[0]?.text.includes("Two weeks") === true &&
      fold.others[0]?.tag === "Recommended" &&
      fold.others[0]?.faded === "0.5" &&
      fold.why === "A fleet takes a week to set up properly.",
    JSON.stringify({ before, ...fold })
  );

  // A task chip opens the task's sheet in place, which names its decision.
  await page.locator(".record .tasks a").first().click();
  const sheet = await page
    .waitForFunction(
      () =>
        document
          .querySelector(".task-sheet .decided")
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? null,
      null,
      { timeout: 30_000 }
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
  kit.check(
    `${view}: a task chip opens its sheet, which says where it was decided`,
    sheet === "Decided on Price the hosted plan › What shape is the plan?",
    `sheet says ${JSON.stringify(sheet)}`
  );
  await page.keyboard.press("Escape");
}

async function graph(kit: Kit, page: Page, view: View, url: string) {
  await open(page, `${url}&mode=graph`, ".svelte-flow__node-decision");
  await page.waitForFunction(
    () => document.querySelectorAll(".svelte-flow__node-decision").length === 7
  );
  await page.waitForFunction(
    () => document.querySelectorAll(".svelte-flow__edge").length === 6
  );
  const drawn = await page.evaluate(() => ({
    cards: document.querySelectorAll(".svelte-flow__node-decision").length,
    picked: document.querySelectorAll(".decision-node[data-picked]").length,
    frames: [...document.querySelectorAll(".decision-group .label")].map(
      (label) => label.textContent?.trim() ?? ""
    ),
    edges: document.querySelectorAll(".svelte-flow__edge").length,
    segment:
      document
        .querySelector(".seg-row [data-state='on']")
        ?.textContent?.trim() ?? null,
  }));
  kit.check(
    `${view}: the graph draws the file's cards, groups and edges, its picked cards ringed`,
    drawn.cards === 7 &&
      drawn.picked === 4 &&
      drawn.edges === 6 &&
      drawn.frames.join("|") === "The first ten minutes|The hero" &&
      drawn.segment === "Graph",
    JSON.stringify(drawn)
  );
}

const spec: Spec = {
  name: "decisions-tab",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const seeded = await seedDecisions(fleet, {
      name: "launch-q4",
      machineId: MACHINE,
      cwd: fleet.repo,
    });
    const base = await fleet.dashboard();
    const url = `${base}/project/${seeded.projectId}?view=decisions`;
    for (const view of ["desk", "phone"] as const) {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      await open(page, url, ".decisions");
      await listed(kit, page, view);
      await picking(kit, page, view, url);
      await decided(kit, page, view, url);
      await graph(kit, page, view, url);
      await page.close();
    }
  },
};
export default spec;
