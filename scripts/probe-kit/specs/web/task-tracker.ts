/**
 * The task tracker on the dashboard (TaskSheet's labels, fields, relations
 * and activity; the board's filter, ticks and bulk bar), through a real hub
 * on a scratch fleet, read from the engine (the page's DOM and the hub's own
 * answers), at desk 1440 and phone 390. A project is seeded with four
 * tasks, each with labels, a type and a `priority` field.
 *
 * At each width:
 *  a. A comment posted in the sheet's composer is the hub's (the task's
 *     comments hold it, its history has a `commented` commit by you), the
 *     activity shows it, and it is still there after a reload.
 *  b. A field edited in the sheet is stored: the hub's read of the task
 *     returns the new value; a field added with Add field is too.
 *  c. The history shows who changed what: the activity has "You changed
 *     priority", as the hub's commit says (`update priority`, by you).
 *  d. A filter narrows the board: Label web leaves only the web tasks'
 *     cards, and the URL holds it (desk: the strip's Filter; phone: the
 *     head's ⋯, then the strip's glyph says one stands).
 *  e. Bulk select applies to every selected task: two cards ticked, Label
 *     picked in the bulk bar, and the hub's read of each carries the label;
 *     the bar stands within the width (one row on a desk, two at most on a
 *     phone, where its controls wrap).
 *  f. Find is the hub's search: a word only one task's description holds
 *     leaves only that task, kept in the URL (`q=`), and a link carrying
 *     the word opens on the hub's answer.
 *  g. Table rows take ticks: two rows ticked are the bulk bar's two.
 *  h. A new label typed in the bulk bar (`Harbour-desk`, spaces around it)
 *     lands on both rows' tasks as the sheet writes one, `harbour-desk`.
 *
 *   bun scripts/probe-kit/run.ts web task-tracker
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width at a time, each step as a hand takes it
import type { Page } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../../kit";

interface Task {
  comments: { author: { name: string }; text: string }[];
  extra: Record<string, string | string[]>;
  id: string;
  labels: string[];
}
interface History {
  events: { actor: { name: string }; kind: string; what: string }[];
}

const SEEDS = [
  {
    title: "Write the launch announcement",
    labels: ["copy", "launch"],
    type: "writer",
    fields: { priority: "high" },
  },
  {
    title: "Build the pricing page",
    labels: ["web"],
    type: "coder",
    fields: { priority: "high" },
  },
  {
    title: "Set up analytics events",
    labels: ["web", "data"],
    type: "coder",
    fields: { priority: "medium" },
    // A word no id, title, label or field holds: only the hub's search,
    // which reads the description, finds this task by it.
    description: "Send plan clicks to the harbourmaster dashboard.",
  },
  {
    title: "Record the demo video",
    labels: ["video"],
    type: "designer",
    fields: { priority: "low" },
  },
];

/** The hub's answer to one request, thrown as its words when it refuses. */
async function hub<T>(
  fleet: KitFleet,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return JSON.parse(text) as T;
}

const SHEET = ".task-sheet";

/** The sheet's activity, as it reads. */
const activityText = (page: Page) =>
  page.evaluate(
    () => document.querySelector(".task-sheet .activity")?.textContent ?? ""
  );

/** a, b, c: the sheet on `task`, at `view`. */
async function sheet(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  url: string,
  view: string,
  task: string
) {
  const one = `/api/projects/${url.split("/project/")[1]}/tasks/${task}`;
  await open(page, `${url}?task=${task}`, () =>
    Boolean(
      document.querySelector(".task-sheet .activity .change") &&
      document.querySelector(".task-sheet .activity textarea")
    )
  );
  await settle(page);

  // a. A comment, posted in the composer.
  const said = `Lead with the pricing change (${view}).`;
  // By its name: the field keeps a hidden twin it measures its rows by.
  const composer = page
    .locator(`${SHEET} .activity`)
    .getByRole("textbox", { name: "Comment on this task" });
  await composer.fill(said);
  await composer.press("Enter");
  await page.waitForFunction(
    (words) =>
      [...document.querySelectorAll(".task-sheet .activity .comment")].some(
        (each) => each.textContent?.includes(words)
      ),
    said
  );
  const stored = await hub<Task>(fleet, "GET", one);
  const history = await hub<History>(fleet, "GET", `${one}/history`);
  kit.check(
    `a. ${view}: the comment is the hub's, and a commented commit by you`,
    stored.comments.some(
      (each) => each.text === said && each.author.name === "you"
    ) &&
      history.events.some(
        (each) => each.kind === "commented" && each.actor.name === "you"
      ),
    JSON.stringify(stored.comments.map((each) => each.text))
  );

  // b. A field, edited where it stands, and one added.
  await page.click(`${SHEET} button[title="Edit priority"]`);
  const value = page.locator(`${SHEET} input[aria-label="priority"]`);
  await value.fill("urgent");
  await value.press("Enter");
  await page.waitForFunction(
    () =>
      document
        .querySelector('.task-sheet button[title="Edit priority"]')
        ?.textContent?.trim() === "urgent"
  );
  await page.getByRole("button", { name: "Add field" }).click();
  await page.fill(`${SHEET} input[aria-label="Field name"]`, "due");
  await page.fill(`${SHEET} input[aria-label="Field value"]`, "2026-10-20");
  await page.press(`${SHEET} input[aria-label="Field value"]`, "Enter");
  await page.waitForSelector(`${SHEET} button[title="Edit due"]`);
  const edited = await hub<Task>(fleet, "GET", one);
  kit.check(
    `b. ${view}: the edited and the added field are stored`,
    edited.extra.priority === "urgent" && edited.extra.due === "2026-10-20",
    JSON.stringify(edited.extra)
  );

  // c. Who changed what, as the hub's commit says it.
  await page.waitForFunction(() =>
    document
      .querySelector(".task-sheet .activity")
      ?.textContent?.includes("changed priority")
  );
  const lines = await page.evaluate(() =>
    [...document.querySelectorAll(".task-sheet .activity .change")].map(
      (each) => each.textContent?.replace(/\s+/g, " ").trim() ?? ""
    )
  );
  const commits = await hub<History>(fleet, "GET", `${one}/history`);
  kit.check(
    `c. ${view}: the history says who changed what`,
    lines.some((line) => line.startsWith("You changed priority")) &&
      commits.events.some(
        (each) => each.actor.name === "you" && each.what === "update priority"
      ),
    lines.join(" | ")
  );

  // a. After a reload, the comment still stands.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    Boolean(document.querySelector(".task-sheet .activity .change"))
  );
  await settle(page);
  const again = await activityText(page);
  kit.check(
    `a. ${view}: the comment survives a reload`,
    again.includes(said),
    again.slice(0, 200)
  );
  const fit = await page.evaluate(() => {
    const body = document.querySelector<HTMLElement>(".task-sheet .body");
    return body ? body.scrollWidth - body.clientWidth : -1;
  });
  kit.check(
    `${view}: the sheet does not scroll sideways`,
    fit <= 1,
    `${fit}px`
  );
  const columns = await page.evaluate(() => {
    const left = (selector: string) =>
      document.querySelector(selector)?.getBoundingClientRect().left ?? -1;
    return {
      fields: left(".task-sheet dl.grid dd"),
      relations: left(".task-sheet .edge-list"),
    };
  });
  kit.check(
    `${view}: the fields' values and the relations' stand on one line`,
    columns.fields > 0 && Math.abs(columns.fields - columns.relations) <= 0.5,
    JSON.stringify(columns)
  );
}

/** The cards the board shows, by task id. */
const cards = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".board [data-task]")]
      .map((card) => card.dataset.task ?? "")
      .sort()
  );

/** d: Label web narrows the board. */
async function filter(
  kit: Kit,
  page: Page,
  url: string,
  view: string,
  web: string[]
) {
  await open(page, url, ".board [data-task]");
  await settle(page);
  await openFilter(page, view);
  await page
    .locator('[data-slot="popover-content"] [data-slot="select-trigger"]', {
      hasText: "Any label",
    })
    .click();
  await page.locator('[data-slot="select-item"]', { hasText: "web" }).click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".board [data-task]").length === count,
    web.length
  );
  const shown = await cards(page);
  const where = new URL(page.url()).searchParams.get("label");
  const glyph =
    view === "desk"
      ? true
      : await page
          .locator('.strip .filter-trigger[aria-label="Filter, 1 set"]')
          .isVisible();
  kit.check(
    `d. ${view}: Label web leaves only the web tasks, kept in the URL`,
    shown.join(",") === [...web].sort().join(",") && where === "web" && glyph,
    `${shown.join(",")} · label=${where} · strip says one stands: ${glyph}`
  );
  await page.keyboard.press("Escape");
}

/** e: two cards ticked, one label for both. */
async function bulk(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  url: string,
  view: string,
  picks: string[],
  label: string
) {
  const [, project] = url.split("/project/");
  await open(page, url, ".board [data-task]");
  await settle(page);
  for (const id of picks) {
    await page.click(`li:has([data-task="${id}"]) > [data-slot="checkbox"]`);
  }
  await page.waitForSelector(".bulk");
  const bar = await page.evaluate(() => {
    const box = document.querySelector(".bulk")?.getBoundingClientRect();
    return box
      ? { width: box.width, height: box.height, right: box.right }
      : null;
  });
  await page.locator(".bulk").getByRole("button", { name: "Label" }).click();
  await page
    .locator('[data-slot="popover-content"] .known')
    .getByRole("button", { name: label, exact: true })
    .click();
  await page.waitForSelector(".bulk", { state: "detached" });
  const read = await Promise.all(
    picks.map((id) =>
      hub<Task>(fleet, "GET", `/api/projects/${project}/tasks/${id}`)
    )
  );
  kit.check(
    `e. ${view}: the label reaches every ticked task`,
    read.every((task) => task.labels.includes(label)),
    read.map((task) => `${task.id}: ${task.labels.join(",")}`).join(" · ")
  );
  // Its six controls are about 476px: a desk holds them on one row; a
  // phone's 366px wraps them to two (the bar's flex-wrap), never past the
  // width.
  const viewport = page.viewportSize();
  const rows = view === "desk" ? 1 : 2;
  kit.check(
    `e. ${view}: the bulk bar stands within the width, in ${rows} row${rows === 1 ? "" : "s"} at most`,
    bar !== null &&
      viewport !== null &&
      bar.right <= viewport.width &&
      bar.height <= rows * 40,
    JSON.stringify(bar)
  );
}

/** The phone opens Filter from the head's ⋯; the desk from the strip. */
async function openFilter(page: Page, view: string) {
  if (view === "desk") {
    await page.click(".strip .filter-trigger");
  } else {
    await page.click('button[aria-label^="More for"]');
    await page.getByRole("menuitem", { name: "Filter tasks…" }).click();
  }
}

/** f: a word only a description holds finds its task, typed and from a link. */
async function find(
  kit: Kit,
  page: Page,
  url: string,
  view: string,
  found: string
) {
  const word = "harbourmaster";
  await open(page, url, ".board [data-task]");
  await settle(page);
  await openFilter(page, view);
  await page
    .locator('[data-slot="popover-content"]')
    .getByRole("textbox", { name: "Find a task" })
    .fill(word);
  await page.waitForFunction(
    () => document.querySelectorAll(".board [data-task]").length === 1
  );
  const typed = await cards(page);
  const where = new URL(page.url()).searchParams.get("q");
  kit.check(
    `f. ${view}: a word only in a description finds its task, kept in the URL`,
    typed.join(",") === found && where === word,
    `${typed.join(",")} · q=${where}`
  );
  await page.keyboard.press("Escape");

  // A link that carries the words opens on the hub's answer: its first
  // drawn board already holds only what they found.
  await page.goto(`${url}?q=${word}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".board [data-task]");
  const opened = await cards(page);
  kit.check(
    `f. ${view}: a link with the words opens on what the hub found`,
    opened.join(",") === found,
    opened.join(",")
  );
}

/** g, h: two table rows ticked take a label typed new in the bulk bar. */
async function table(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  url: string,
  view: string,
  picks: string[]
) {
  const [, project] = url.split("/project/");
  const label = `harbour-${view}`;
  await open(page, `${url}?view=table`, ".ledger tr.row");
  await settle(page);
  for (const id of picks) {
    await page.click(`tr.row[data-task="${id}"] [data-slot="checkbox"]`);
  }
  await page.waitForSelector(".bulk");
  const ticked = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".ledger tr.row[data-picked]")]
      .map((row) => row.dataset.task ?? "")
      .sort()
  );
  kit.check(
    `g. ${view}: two table rows ticked are the bulk bar's`,
    ticked.join(",") === [...picks].sort().join(",") &&
      (await page.locator(".bulk .count").innerText()).startsWith("2"),
    ticked.join(",")
  );
  const laid = await page.evaluate((id) => {
    const ledger = document.querySelector<HTMLElement>(".ledger");
    const row = document.querySelector(`.ledger tr.row[data-task="${id}"]`);
    const tick = row?.querySelector('[data-slot="checkbox"]');
    const title = row?.querySelector(".title");
    const box = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const [r, k, t] = [box(row), box(tick), box(title)];
    return {
      overflow: ledger ? ledger.scrollWidth - ledger.clientWidth : -1,
      leads: Boolean(k && t && k.right <= t.left),
      inside: Boolean(r && k && k.left >= r.left && k.right <= r.right),
    };
  }, picks[0]);
  kit.check(
    `g. ${view}: a row's tick leads it, inside it, the ledger within its width`,
    laid.overflow <= 1 && laid.leads && laid.inside,
    JSON.stringify(laid)
  );
  await page.locator(".bulk").getByRole("button", { name: "Label" }).click();
  // Typed as a person types it: the bar writes it as the sheet does, lower case.
  await page
    // A field with a list of offers is a combobox to the engine.
    .locator('[data-slot="popover-content"]')
    .getByRole("combobox", { name: "Label to add" })
    .fill(` Harbour-${view} `);
  await page.keyboard.press("Enter");
  await page.waitForSelector(".bulk", { state: "detached" });
  const read = await Promise.all(
    picks.map((id) =>
      hub<Task>(fleet, "GET", `/api/projects/${project}/tasks/${id}`)
    )
  );
  kit.check(
    `h. ${view}: a new label typed in the bulk bar lands on both`,
    read.every((task) => task.labels.includes(label)),
    read.map((task) => `${task.id}: ${task.labels.join(",")}`).join(" · ")
  );
}

const spec: Spec = {
  name: "task-tracker",
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
    const { id: project } = await fleet.api<{ id: string }>("/api/projects", {
      name: "launch-site",
      machineId: MACHINE,
      cwd: fleet.repo,
      caw: false,
    });
    const ids: string[] = [];
    for (const seed of SEEDS) {
      const made = await hub<Task>(
        fleet,
        "POST",
        `/api/projects/${project}/tasks`,
        seed
      );
      ids.push(made.id);
    }
    const [announce, pricing, analytics, video] = ids;
    const base = await fleet.dashboard();
    const url = `${base}/project/${project}`;
    for (const [view, task, picks, label] of [
      ["desk", announce, [analytics, video], "launch"],
      ["phone", pricing, [announce, pricing], "video"],
    ] as const) {
      const page = await kit.page(view);
      page.setDefaultTimeout(60_000);
      await sheet(kit, fleet, page, url, view, task);
      await filter(kit, page, url, view, [pricing, analytics]);
      await find(kit, page, url, view, analytics);
      await bulk(kit, fleet, page, url, view, [...picks], label);
      await table(kit, fleet, page, url, view, [pricing, video]);
      await page.close();
    }
  },
};
export default spec;
