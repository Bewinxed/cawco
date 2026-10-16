/**
 * Pages are blocks (Projects spec §5.2; the 10-13 wireframe §1.1–1.4, §2):
 * a project page's tab content is a stack of blocks the person arranges,
 * kept per project at the hub, laid on 4, 2 or 1 columns by the page's
 * width; a custom view stands as its own tab or as a block, moved between
 * the two from its menu.
 *
 * On the built dashboard against a scratch fleet's hub, one project with a
 * few tasks and one kept view ("spend", written to its folder):
 *
 * 1. Columns: the Routines page's grid at 1440, 1024, 768 and 390 holds 4,
 *    2, 1 and 1 columns; at 1440 each of its three blocks takes the two
 *    columns its measure needs; at 1024 Routines takes both (its ledger
 *    keeps Last and Next in their columns) and the other two one each.
 * 2. Through the hub: a second browser context stands open on the page
 *    while the first moves a block (Move up) and widens one (Wide); the
 *    hub's record says so, the second context shows both without a reload,
 *    and a reload of the first keeps them.
 * 3. Motion, scrubbed on the clock (anim.ts) at 0, 50 and 100%: a block
 *    moved down slides from where it stood to its new place (`reflow`), and
 *    a block made wide tweens its width from its old to its new (`morph`).
 * 4. Desk drag: the head dragged by the mouse over another block's top
 *    edge draws the source's slot and the drop indicator; let go, the block
 *    stands there, as the hub records.
 * 5. Phone 390: the head is the platform's long-press drag source (native
 *    `draggable`, no callout, no text selection, no long-press menu), and a
 *    drag from it on the browser's own drag path moves the block, as the
 *    hub records. The hold that starts that drag on iOS is the platform's:
 *    no engine here synthesises one (headless Chromium, with or without
 *    --enable-touch-drag-drop, and WebKit deliver touchstart and touchend
 *    and never a dragstart), so the drag is started by the mouse.
 * 6. A view between tab and block: its tab's ⋯ → Place on a page →
 *    Routines takes it out of the strip and onto the Routines page as a
 *    block (the hub records it there); the block's ⋯ → Show as a tab puts
 *    it back in the strip and off the page. Placed on the Board, the board
 *    becomes its page's first block, the row's width, filling the pane's
 *    height above the view.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one step at a time
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { frames, type Kit, open, type Spec, settle } from "../../kit";

const VIEW = "spend";
const VIEW_SOURCE = `root = Column([title, table])
tasks = Query("tasks", {}, {rows: []})
title = Text("Spend per routine", "title")
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])`;
const TITLES = [
  "Retry webhook deliveries on 5xx",
  "Relay health check in the smoke suite",
  "Move the changelog to one file per release",
];
const PCTS = [0, 0.5, 1];

interface Arrangement {
  pages: Record<string, { block: string; hidden: boolean; width: string }[]>;
}

/** The blocks a page shows, in order: each one's id, span and box. */
const blocksOf = (page: Page) =>
  page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('[data-slot="blocks"]');
    return {
      columns: Number(
        document
          .querySelector('[data-slot="block-page"]')
          ?.getAttribute("data-columns") ?? 0
      ),
      tracks: grid
        ? getComputedStyle(grid).gridTemplateColumns.split(" ").length
        : 0,
      blocks: [
        ...document.querySelectorAll<HTMLElement>(
          '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
        ),
      ]
        .filter((block) => !block.hasAttribute("data-reflow-ghost"))
        .map((block) => {
          const box = block.getBoundingClientRect();
          return {
            id: block.dataset.block ?? "",
            span: Number(block.dataset.span ?? 0),
            width: block.matches("[data-wide]") ? "wide" : "narrow",
            left: Math.round(box.left),
            top: Math.round(box.top),
            w: Math.round(box.width),
          };
        }),
    };
  });
const orderOf = async (page: Page) =>
  (await blocksOf(page)).blocks.map((block) => block.id).join(",");

/**
 * Opens a block's ⋯ and picks `item` (a menu item or radio, by its name),
 * by the keyboard with the pointer parked away: no hover moves under the
 * pointer as the menu closes, so a run the clock catches is never replaced.
 */
async function pick(page: Page, title: string, item: string) {
  await page.mouse.move(1, 1);
  await page.getByRole("button", { name: `More for ${title}` }).focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await menu.waitFor();
  await menu
    .getByRole("menuitem", { name: item, exact: true })
    .or(menu.getByRole("menuitemradio", { name: item, exact: true }))
    .focus();
  await page.keyboard.press("Enter");
}

/** The hub's record of one page: its blocks in order, `id:width` with `!` for hidden. */
async function hubPage(base: string, projectId: string, name: string) {
  const response = await fetch(`${base}/api/projects/${projectId}/blocks`);
  const read = (await response.json()) as Arrangement;
  return (read.pages[name] ?? [])
    .map((each) => `${each.block}:${each.width}${each.hidden ? "!" : ""}`)
    .join(",");
}

async function columns(kit: Kit, page: Page, phone: Page, url: string) {
  const want: [number, number, string][] = [
    [1440, 4, "routines:2,sources:2,actions:2"],
    [1024, 2, "routines:2,sources:1,actions:1"],
    [768, 1, "routines:1,sources:1,actions:1"],
  ];
  for (const [width, count, spans] of want) {
    await page.setViewportSize({ width, height: 1000 });
    await settle(page);
    const read = await blocksOf(page);
    kit.check(
      `columns ${width}: the Routines page's grid holds ${count} column${count > 1 ? "s" : ""}, its blocks taking ${spans}`,
      read.columns === count &&
        read.tracks === count &&
        read.blocks.map((b) => `${b.id}:${b.span}`).join(",") === spans,
      JSON.stringify(read)
    );
  }
  await open(
    phone,
    url,
    '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
  );
  await settle(phone);
  const read = await blocksOf(phone);
  kit.check(
    "columns 390: one column, the three blocks stacked in order at the column's width",
    read.columns === 1 &&
      read.tracks === 1 &&
      read.blocks.length === 3 &&
      read.blocks.every((b, i, all) => i === 0 || b.top > all[i - 1].top) &&
      new Set(read.blocks.map((b) => b.left)).size === 1,
    JSON.stringify(read)
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await settle(page);
}

async function throughHub(
  kit: Kit,
  page: Page,
  other: Page,
  base: string,
  projectId: string,
  url: string
) {
  await open(
    other,
    url,
    '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
  );
  await settle(other);
  await pick(page, "Approved actions", "Move up");
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll(
          '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
        ),
      ]
        .map((b) => (b as HTMLElement).dataset.block)
        .join(",") === "routines,actions,sources"
  );
  await settle(page);
  kit.check(
    "hub: Move up on Approved actions is the hub's record of the Routines page",
    (await hubPage(base, projectId, "routines")) ===
      "routines:narrow,actions:narrow,sources:narrow",
    await hubPage(base, projectId, "routines")
  );
  const seen = await other
    .waitForFunction(
      () =>
        [
          ...document.querySelectorAll(
            '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
          ),
        ]
          .map((b) => (b as HTMLElement).dataset.block)
          .join(",") === "routines,actions,sources",
      null,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    "second context: the move reaches a page open in another browser context, with no reload",
    seen,
    await orderOf(other)
  );
  await pick(page, "Routines", "Wide");
  await page.waitForSelector(
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-wide][data-block='routines']"
  );
  await settle(page);
  const widened = await other
    .waitForSelector(
      ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-wide][data-block='routines'][data-span='4']",
      {
        timeout: 10_000,
      }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    "second context: Wide on Routines reaches the other context, spanning its four columns",
    widened &&
      (await hubPage(base, projectId, "routines")) ===
        "routines:wide,actions:narrow,sources:narrow",
    `${await hubPage(base, projectId, "routines")}; ${JSON.stringify(await blocksOf(other))}`
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-wide][data-block='routines']"
  );
  await settle(page);
  const after = await blocksOf(page);
  kit.check(
    "reload: the moved and widened arrangement survives a reload",
    after.blocks.map((b) => `${b.id}:${b.width}`).join(",") ===
      "routines:wide,actions:narrow,sources:narrow",
    JSON.stringify(after)
  );
}

/** A box's drawn left, top and width at 0, 50 and 100% of the clock. */
async function scrub(
  clock: Clock,
  page: Page,
  selector: string
): Promise<{ left: number; top: number; w: number }[]> {
  const read: { left: number; top: number; w: number }[] = [];
  for (const f of PCTS) {
    await clock.seek(f);
    read.push(
      await page.evaluate((sel) => {
        const box = document.querySelector(sel)?.getBoundingClientRect();
        return {
          left: box?.left ?? Number.NaN,
          top: box?.top ?? Number.NaN,
          w: box?.width ?? Number.NaN,
        };
      }, selector)
    );
  }
  return read;
}

const between = (a: number, mid: number, b: number) =>
  Math.min(a, b) + 1 < mid && mid < Math.max(a, b) - 1;

async function motion(kit: Kit, page: Page) {
  // From routines (wide), then actions | sources on one row: actions moves
  // down past sources, and sources slides from the row's trailing half to
  // its leading half. Read on sources, whose own ⋯ is not touched.
  const before = await blocksOf(page);
  const was = before.blocks.find((b) => b.id === "sources");
  const clock = await Clock.on(page);
  await clock.catchRuns(
    () => pick(page, "Approved actions", "Move down"),
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-block='sources']"
  );
  const moved = await scrub(
    clock,
    page,
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-block='sources']"
  );
  await clock.release();
  await settle(page);
  const now = (await blocksOf(page)).blocks.find((b) => b.id === "sources");
  const [start, middle, end] = moved;
  kit.check(
    "motion: Move down slides the block from where it stood (0%) through between (50%) to its new place (100%)",
    was !== undefined &&
      now !== undefined &&
      start !== undefined &&
      middle !== undefined &&
      end !== undefined &&
      Math.abs(start.left - was.left) <= 1 &&
      Math.abs(start.top - was.top) <= 1 &&
      Math.abs(end.left - now.left) <= 1 &&
      Math.abs(end.top - now.top) <= 1 &&
      (between(was.left, middle.left, now.left) ||
        between(was.top, middle.top, now.top)),
    `was ${JSON.stringify(was)}, now ${JSON.stringify(now)}, drawn ${JSON.stringify(moved)}`
  );
  // Sources now stands first on its row, narrow at two columns: Wide keeps
  // its place and tweens its width to the row's.
  const narrow = (await blocksOf(page)).blocks.find((b) => b.id === "sources");
  const wideClock = await Clock.on(page);
  await wideClock.catchRuns(
    () => pick(page, "Event sources", "Wide"),
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-block='sources']"
  );
  const grown = await scrub(
    wideClock,
    page,
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-block='sources']"
  );
  await wideClock.release();
  await settle(page);
  const wide = (await blocksOf(page)).blocks.find((b) => b.id === "sources");
  kit.check(
    "motion: Wide tweens the block's width from its old (0%) through between (50%) to the row's (100%)",
    narrow !== undefined &&
      wide !== undefined &&
      wide.span === 4 &&
      Math.abs(grown[0].w - narrow.w) <= 1 &&
      between(narrow.w, grown[1].w, wide.w) &&
      Math.abs(grown[2].w - wide.w) <= 1,
    `narrow ${narrow?.w}, wide ${wide?.w}, drawn ${grown.map((g) => g.w.toFixed(1)).join(" → ")}`
  );
  // Back to narrow for what follows.
  await pick(page, "Event sources", "Narrow");
  await page.waitForSelector(
    ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-narrow][data-block='sources']"
  );
  await settle(page);
}

/** Drags `from`'s head by the mouse onto `to`'s top edge; reads mid-drag what is drawn. */
async function dragOnto(page: Page, from: string, to: string) {
  const head = await page
    .locator(
      `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='${from}'] [data-slot="block-head"] [data-slot="title"]`
    )
    .boundingBox();
  const target = await page
    .locator(
      `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='${to}']`
    )
    .boundingBox();
  if (!(head && target)) {
    throw new Error(`no head for ${from} or no block ${to}`);
  }
  await page.mouse.move(head.x + 4, head.y + head.height / 2);
  await page.mouse.down();
  const x = target.x + target.width / 2;
  const y = target.y + 6;
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(
      head.x + 4 + ((x - head.x - 4) * step) / 12,
      head.y + head.height / 2 + ((y - head.y - head.height / 2) * step) / 12
    );
  }
  await page.mouse.move(x, y + 1);
  // What the drag draws lands on the frame after the pointer's move
  // (Pragmatic hears a target's drag once a frame): read once the frames
  // after the pointer came to rest are drawn, not the first indicator its
  // way there drew (it crosses the target's bottom half first).
  await frames(page);
  await frames(page);
  await page
    .waitForFunction(
      () =>
        document.querySelector(
          ':is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-dragging]'
        ) !== null &&
        document.querySelector(
          ':is([data-slot="block"], [data-field-separator-block], [data-switch-block]) :is([data-drop], [data-slot="drop"])'
        ) !== null,
      null,
      { timeout: 2000 }
    )
    .catch(() => undefined);
  const mid = await page.evaluate(() => ({
    slot:
      document.querySelector<HTMLElement>(
        ':is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-dragging]'
      )?.dataset.block ?? null,
    drop: document
      .querySelector(
        ':is([data-slot="block"], [data-field-separator-block], [data-switch-block]) :is([data-drop], [data-slot="drop"])'
      )
      ?.getAttribute("data-edge"),
    on:
      document.querySelector<HTMLElement>(
        ':is([data-slot="block"], [data-field-separator-block], [data-switch-block]):has(> :is([data-drop], [data-slot="drop"]))'
      )?.dataset.block ?? null,
  }));
  await page.mouse.up();
  return mid;
}

async function deskDrag(kit: Kit, page: Page, base: string, projectId: string) {
  const before = await orderOf(page);
  const mid = await dragOnto(page, "sources", "routines");
  await page.waitForFunction(
    () =>
      document
        .querySelector<HTMLElement>(
          '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
        )
        ?.getAttribute("data-block") === "sources",
    null,
    { timeout: 10_000 }
  );
  await settle(page);
  const after = await orderOf(page);
  kit.check(
    "desk drag: mid-drag the source stands as its slot and the drop indicator is on the target's top edge",
    mid.slot === "sources" && mid.drop === "top" && mid.on === "routines",
    JSON.stringify(mid)
  );
  kit.check(
    "desk drag: let go on Routines' top edge, Event sources stands first, as the hub records",
    after.startsWith("sources,routines") &&
      (await hubPage(base, projectId, "routines")).startsWith(
        "sources:narrow,routines:wide"
      ),
    `before ${before}, after ${after}, hub ${await hubPage(base, projectId, "routines")}`
  );
}

async function phoneDrag(
  kit: Kit,
  phone: Page,
  base: string,
  projectId: string,
  url: string
) {
  await open(
    phone,
    url,
    '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
  );
  await settle(phone);
  const head = await phone.evaluate(() => {
    const el = document.querySelector<HTMLElement>(
      ':is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block=\'actions\'] [data-slot="block-head"]'
    );
    const styles = el ? getComputedStyle(el) : null;
    return {
      draggable: el?.getAttribute("draggable") ?? null,
      callout:
        (styles as unknown as { webkitTouchCallout?: string } | null)
          ?.webkitTouchCallout ?? null,
      select: styles?.userSelect ?? null,
      menu: el?.closest("[data-slot='context-menu-trigger']") !== null,
      height: el?.getBoundingClientRect().height ?? 0,
    };
  });
  kit.check(
    "phone 390: the head is the platform's long-press drag source: draggable, no callout, no text selection, no long-press menu, 44px tall",
    head.draggable === "true" &&
      (head.callout === "none" || head.callout === null) &&
      head.select === "none" &&
      !head.menu &&
      head.height >= 44,
    JSON.stringify(head)
  );
  const before = await orderOf(phone);
  const first = before.split(",")[0] ?? "";
  await dragOnto(phone, "actions", first);
  await phone.waitForFunction(
    () =>
      document
        .querySelector<HTMLElement>(
          '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
        )
        ?.getAttribute("data-block") === "actions",
    null,
    { timeout: 10_000 }
  );
  await settle(phone);
  kit.check(
    "phone 390: a drag from the head onto the first block's top moves Approved actions first, as the hub records",
    (await orderOf(phone)).startsWith("actions,") &&
      (await hubPage(base, projectId, "routines")).startsWith("actions:"),
    `before ${before}, after ${await orderOf(phone)}, hub ${await hubPage(base, projectId, "routines")}`
  );
}

/** The strip's tab names, as the page draws them. */
const stripOf = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("[aria-label='Views'] [role='tab']")]
      .map((tab) => (tab as HTMLElement).innerText.trim())
      .join(",")
  );

/** Opens the view's own tab; its head not up, says what the page and the hub show instead. */
async function openView(
  page: Page,
  base: string,
  hub: string,
  projectId: string
) {
  try {
    await open(
      page,
      `${base}/project/${projectId}?view=view:${VIEW}`,
      '[data-slot="view-head"]',
      20_000
    );
  } catch (error) {
    const shown = await page.evaluate(() => ({
      url: location.href,
      view: document.querySelector<HTMLElement>('[data-slot="pane"]')?.dataset
        .view,
      strip: [...document.querySelectorAll("[role='tab']")].map((tab) =>
        (tab as HTMLElement).innerText.trim()
      ),
      alerts: [
        ...document.querySelectorAll(
          "[role='alert'], :is([data-id-page-notice], [data-slot=\"notice\"])"
        ),
      ].map((alert) => (alert as HTMLElement).innerText.trim()),
    }));
    const views = await fetch(`${hub}/api/projects/${projectId}/views`).then(
      (response) => response.text()
    );
    throw new Error(
      `the view's tab has no head: ${JSON.stringify(shown)}; the hub's views ${views.slice(0, 400)}; ${String(error).split("\n")[0]}`,
      { cause: error }
    );
  }
}

async function tabAndBlock(
  kit: Kit,
  page: Page,
  other: Page,
  base: string,
  hub: string,
  projectId: string
) {
  await openView(page, base, hub, projectId);
  await settle(page);
  const strip = await stripOf(page);
  await page.getByRole("button", { name: "More for Spend" }).click();
  await page.getByRole("menuitem", { name: "Place on a page" }).click();
  await page.getByRole("menuitem", { name: "Routines", exact: true }).click();
  await page.waitForSelector(
    `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='view:${VIEW}']`
  );
  await settle(page);
  const placed = {
    view: new URL(page.url()).searchParams.get("view"),
    strip: await stripOf(page),
    hub: await hubPage(hub, projectId, "routines"),
    order: await orderOf(page),
  };
  kit.check(
    "tab → block: Place on a page → Routines takes Spend out of the strip and onto the Routines page as its last block, narrow, as the hub records",
    strip.includes("Spend") &&
      !placed.strip.includes("Spend") &&
      placed.view === "routines" &&
      placed.order.endsWith(`view:${VIEW}`) &&
      placed.hub.endsWith(`view:${VIEW}:narrow`),
    `${strip} → ${JSON.stringify(placed)}`
  );
  const reached = await other
    .waitForSelector(
      `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='view:${VIEW}']`,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    "second context: the placed view reaches the other context's Routines page as a block",
    reached,
    await orderOf(other)
  );
  await pick(page, "Spend", "Show as a tab");
  await page.waitForFunction(
    (block) =>
      !document.querySelector(
        `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='${block}']`
      ),
    `view:${VIEW}`
  );
  await settle(page);
  const back = {
    strip: await stripOf(page),
    hub: await hubPage(hub, projectId, "routines"),
  };
  kit.check(
    "block → tab: Show as a tab takes Spend off the page and back into the strip, as the hub records",
    back.strip.includes("Spend") && !back.hub.includes(`view:${VIEW}`),
    JSON.stringify(back)
  );

  // On the Board: the board is its page's first block, the row's width,
  // filling the pane above the view.
  await openView(page, base, hub, projectId);
  await page.getByRole("button", { name: "More for Spend" }).click();
  await page.getByRole("menuitem", { name: "Place on a page" }).click();
  await page.getByRole("menuitem", { name: "Board", exact: true }).click();
  await page.waitForSelector(
    `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='view:${VIEW}']`
  );
  await settle(page);
  const board = await page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('[data-slot="pane"]');
    const block = document.querySelector<HTMLElement>(
      ":is([data-slot=\"block\"], [data-field-separator-block], [data-switch-block])[data-block='board']"
    );
    const body = block?.querySelector<HTMLElement>('[data-slot="block-body"]');
    const stages = block?.querySelector<HTMLElement>('[data-slot="board"]');
    const styles = pane ? getComputedStyle(pane) : null;
    return {
      view: pane?.dataset.view ?? null,
      span: Number(block?.dataset.span ?? 0),
      columns: Number(
        document
          .querySelector('[data-slot="block-page"]')
          ?.getAttribute("data-columns") ?? 0
      ),
      body: Math.round(body?.getBoundingClientRect().height ?? 0),
      paneContent: pane
        ? Math.round(
            pane.clientHeight -
              Number.parseFloat(styles?.paddingBlockStart ?? "0") -
              Number.parseFloat(styles?.paddingBlockEnd ?? "0")
          )
        : 0,
      headH: Math.round(
        block
          ?.querySelector('[data-slot="block-head"]')
          ?.getBoundingClientRect().height ?? 0
      ),
      board: Math.round(stages?.getBoundingClientRect().height ?? 0),
      order: [
        ...document.querySelectorAll(
          '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
        ),
      ]
        .map((b) => (b as HTMLElement).dataset.block)
        .join(","),
    };
  });
  kit.check(
    "board: with Spend placed on it, the board is the page's first block, the row's width, its body the pane's height less its head, the view after it",
    board.view === "blocks" &&
      board.order === `board,view:${VIEW}` &&
      board.span === board.columns &&
      board.body > 200 &&
      Math.abs(board.body + board.headH + 7 - board.paneContent) <= 2 &&
      board.board > 0,
    JSON.stringify(board)
  );
  await pick(page, "Spend", "Show as a tab");
  await page.waitForFunction(
    (block) =>
      !document.querySelector(
        `:is([data-slot="block"], [data-field-separator-block], [data-switch-block])[data-block='${block}']`
      ),
    `view:${VIEW}`
  );
}

const spec: Spec = {
  name: "blocks",
  async run(kit) {
    const fleet = await kit.fleet(() => ({ everyMs: 20, words: ["Ready."] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    const project = await fleet.api<{ id: string }>("/api/projects", {
      name: "cawco",
      caw: false,
    });
    for (const title of TITLES) {
      await fleet.api(`/api/projects/${project.id}/tasks`, { title });
    }
    const written = await fetch(
      `${fleet.base}/api/projects/${project.id}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: `views/${VIEW}.oui`,
          content: VIEW_SOURCE,
        }),
      }
    );
    if (!written.ok) {
      throw new Error(
        `writing the view: ${written.status} ${await written.text()}`
      );
    }
    const base = await fleet.dashboard();
    const url = `${base}/project/${project.id}?view=routines`;

    const page = await kit.page("desk");
    page.setDefaultTimeout(60_000);
    const other = await kit.page("desk");
    other.setDefaultTimeout(60_000);
    const phone = await kit.page("phone");
    phone.setDefaultTimeout(60_000);
    await open(
      page,
      url,
      '[data-slot="blocks"] > :is([data-slot="block"], [data-field-separator-block], [data-switch-block])'
    );
    await settle(page);
    kit.check(
      "first read: an arrangement never written is the page's own blocks in their order, and the hub holds none",
      (await orderOf(page)) === "routines,sources,actions" &&
        (await hubPage(fleet.base, project.id, "routines")) === "",
      await orderOf(page)
    );

    await columns(kit, page, phone, url);
    await throughHub(kit, page, other, fleet.base, project.id, url);
    await motion(kit, page);
    await deskDrag(kit, page, fleet.base, project.id);
    await phoneDrag(kit, phone, fleet.base, project.id, url);
    await tabAndBlock(kit, page, other, base, fleet.base, project.id);
  },
};
export default spec;
