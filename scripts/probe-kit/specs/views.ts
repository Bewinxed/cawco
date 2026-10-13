/**
 * A project's custom views are OpenUI Lang programs over CawCo's library,
 * reading the project only through the view tools (PRD §5.2), on a scratch
 * fleet (real hub, agent and sessiond; Claude Code against the mock model,
 * which answers as Caw) in the built dashboard. One run each:
 *
 * a. Ask Caw for a view on a project with tasks: his draft arrives as a tab,
 *    renders, and its Queries fill it with the project's data (each task's
 *    title, the count of tasks, a month calendar of them); a Query's default
 *    is never shown as its data (the frame stands as its skeleton until the
 *    tools answer); every request the view makes is a view tool on the
 *    dashboard's own origin.
 * b. A hand-written .oui naming a component the library does not have
 *    renders the rest and names the one it dropped.
 * c. A draft whose Query names a tool views do not have is refused at
 *    draft: no file, and Caw reads why.
 * d. Keep stores views/<name>.oui (the draft's file gone), and the view
 *    still renders after a reload.
 * e. The app's route renders that one view and nothing around it (on a
 *    phone, its month calendar as the month's list).
 *
 *   bun scripts/probe-kit/run.ts views
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const CAW = "You are Caw";
const VIEW_REQUEST = "Event view-request";
const DRAFT = "mcp__cawco__view_draft";
const TITLES = ["Probe alpha", "Probe beta", "Probe gamma"];
/** The figure tile over the tasks' count: the `stages` tool's total. */
const ALL_THREE = /All tasks\s*3/;

/** Caw's good draft (a): two Queries, figures, a table, the board and a month. */
const GOOD = `root = Column([title, figures, table, board, month])
tasks = Query("tasks", {}, {rows: []})
stages = Query("stages", {}, {stages: [], byKind: {you: 0, done: 0}, total: 0})
title = Text("Probe week", "title")
figures = Row([StatTile("All tasks", stages.total), StatTile("Waiting on you", stages.byKind.you, "attn")])
table = Table(tasks.rows, [{label: "Task", field: "title"}, {label: "Stage", field: "stage"}])
board = Board(@Each(stages.stages, "s", StageColumn(s, tasks.rows)), "By stage")
month = Calendar(tasks.rows, "dates.createdAt", "month")`;

/**
 * Every time the view frame's shown words change: whether its count tile
 * ever read 0 (a Query's default drawn as data), and whether its skeleton
 * stood while the tools had not answered.
 */
const RECORD = () => {
  const seen = { zero: false, skeleton: false };
  (window as unknown as { probeView: typeof seen }).probeView = seen;
  // biome-ignore lint/performance/useTopLevelRegex: this runs in the page as an init script, where the module's constants do not exist
  const zero = /All tasks\s*0\b/;
  new MutationObserver(() => {
    const frame = document.querySelector<HTMLElement>(".view-frame");
    if (!frame) {
      return;
    }
    seen.skeleton ||= frame.querySelector("[data-view-pending]") !== null;
    seen.zero ||= zero.test(frame.innerText);
  }).observe(document, { subtree: true, childList: true, characterData: true });
};

/** A draft reading a tool views do not have (c). */
const BAD_TOOL = `root = Column([people])
users = Query("list_users", {}, {rows: []})
people = Table(users.rows, [{label: "Name", field: "name"}])`;

/** Written by hand into the folder (b): Sparkline is not a component of the library. */
const HAND = `root = Column([title, spark, table])
tasks = Query("tasks", {}, {rows: []})
title = Text("Hand view", "title")
spark = Sparkline([1, 2, 3])
table = Table(tasks.rows, [{label: "Task", field: "title"}])`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const tool = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/** The calls Caw made, by the ask they answer, and what each call answered. */
const made = new Set<string>();
const answers: Record<string, string> = {};

/** `view_draft` once for `key`, loaded with ToolSearch first while it is deferred. */
const draftOnce = (
  request: Seen,
  key: string,
  input: { name: string; source: string }
): Reply => {
  if (made.has(key)) {
    answers[key] ??= request.last.slice(0, 1200);
    return text("done");
  }
  if (request.toolNames.includes(DRAFT)) {
    made.add(key);
    return tool(DRAFT, input);
  }
  return request.toolNames.includes("ToolSearch")
    ? tool("ToolSearch", { query: `select:${DRAFT}`, max_results: 1 })
    : text(`${DRAFT} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (!request.all.includes(CAW)) {
    return text("ok");
  }
  const event = request.all.slice(request.all.lastIndexOf(VIEW_REQUEST));
  if (event.includes("PROBE-VIEW-GOOD")) {
    return draftOnce(request, "good", { name: "probe-week", source: GOOD });
  }
  if (event.includes("PROBE-VIEW-BADTOOL")) {
    return draftOnce(request, "bad", { name: "probe-bad", source: BAD_TOOL });
  }
  return text("ok");
};

interface Listed {
  draft: boolean;
  dropped: string[];
  name: string;
}

/** The view's own words, once each title and `extra` are on the page inside `scope`. */
const viewWords = async (page: Page, scope: string, extra: string[] = []) => {
  const wanted = [...TITLES, ...extra];
  await page.waitForFunction(
    ({ inside, words }) => {
      const drawn = (document.querySelector(inside) as HTMLElement | null)
        ?.innerText;
      return drawn !== undefined && words.every((one) => drawn.includes(one));
    },
    { inside: scope, words: wanted },
    { timeout: 60_000 }
  );
  return page.evaluate(
    (inside) =>
      (document.querySelector(inside) as HTMLElement | null)?.innerText ?? "",
    scope
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const home = fleet.env.HOME as string;
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo views > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: home })
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Views",
    machineId: MACHINE,
    cwd: src,
    caw: false,
  });
  for (const title of TITLES) {
    // biome-ignore lint/performance/noAwaitInLoops: each task is its own commit, in order
    await fleet.api(`/api/projects/${project.id}/tasks`, { title });
  }
  const at = `/api/projects/${project.id}`;
  const listed = () => fleet.api<Listed[]>(`${at}/views`);
  const folderFile = (path: string) =>
    fetch(
      `${fleet.base}${at}/folder/file?path=${encodeURIComponent(path)}`
    ).then((response) => response.status);

  const base = await fleet.dashboard();
  const page = await kit.page("desk", { init: [RECORD] });
  const tab = (name: string) =>
    page.locator(`a[href$="view=view%3A${name}"]`).first();

  // ── a. Ask Caw for a view: the draft renders, its Queries fill it ──────
  await open(page, `${base}/project/${project.id}`, "text=Probe alpha");
  await page.getByRole("button", { name: "Ask Caw for a view" }).click();
  const field = page.getByRole("textbox", { name: "Ask Caw for a view" });
  await field.fill("PROBE-VIEW-GOOD: a week of the tasks");
  await field.press("Enter");
  await until(
    "Caw's draft listed",
    listed,
    (views) => views.some((view) => view.name === "probe-week" && view.draft),
    240_000
  );
  await tab("probe-week").waitFor({ timeout: 60_000 });
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await tab("probe-week").click();
  const drawn = await viewWords(page, ".view-frame", ["All tasks"]);
  const rows = await page.locator(".view-frame tbody tr").count();
  const monthChips = await page
    .locator(".view-frame .ec-month-view .ec-event")
    .count();
  const recorded = await page.evaluate(
    () =>
      (window as unknown as { probeView: { zero: boolean; skeleton: boolean } })
        .probeView
  );
  kit.check(
    "a: the month calendar places every task, and no Query's default is drawn as data",
    monthChips === TITLES.length && recorded.skeleton && !recorded.zero,
    `${monthChips} chips in the month grid; skeleton seen ${recorded.skeleton}; a count of 0 seen ${recorded.zero}`
  );
  const { origin } = new URL(base);
  const viewCalls = requests.filter((url) => url.includes("/view-tools/"));
  const elsewhere = requests.filter(
    (url) => !(url.startsWith(origin) || url.startsWith("data:"))
  );
  kit.check(
    "a: Caw's draft arrives as a tab, renders, and its Queries fill it from the hub",
    TITLES.every((title) => drawn.includes(title)) &&
      ALL_THREE.test(drawn) &&
      rows === TITLES.length &&
      // Every column is a stage of the project's, empty ones included.
      !drawn.includes("not in stages.md") &&
      (await page.getByText("Caw drafted the").count()) > 0,
    `${rows} table rows; “${drawn.replace(/\s+/g, " ").slice(0, 240)}”`
  );
  kit.check(
    "a: every request the view makes is a view tool, on the dashboard's own origin",
    viewCalls.length >= 2 &&
      viewCalls.every((url) => url.startsWith(`${origin}${at}/view-tools/`)) &&
      elsewhere.length === 0,
    `${viewCalls.map((url) => url.slice(url.indexOf("/view-tools/"))).join(", ")}; elsewhere: ${elsewhere.join(", ") || "none"}`
  );

  // ── c. a Query to a tool views do not have is refused at draft ─────────
  const asked = await fetch(`${fleet.base}${at}/view-requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "PROBE-VIEW-BADTOOL: the people" }),
  });
  const badAnswer = await until(
    "Caw's refused draft answered",
    () => answers.bad,
    Boolean,
    240_000
  );
  const afterBad = await listed();
  kit.check(
    "c: a Query naming a tool views do not have is refused at draft, and Caw reads why",
    asked.ok &&
      !afterBad.some((view) => view.name === "probe-bad") &&
      (await folderFile("views/drafts/probe-bad.oui")) === 404 &&
      badAnswer.includes("names a tool views do not have"),
    `views ${afterBad.map((view) => view.name).join(", ")}; Caw read “${badAnswer.slice(0, 200)}”`
  );

  // ── b. a hand-written view drops what the library lacks, by name ───────
  const written = await fetch(`${fleet.base}${at}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "views/probe-hand.oui", content: HAND }),
  });
  await open(
    page,
    `${base}/project/${project.id}?view=view:probe-hand`,
    "[data-view-dropped]"
  );
  const handWords = await viewWords(page, ".view-frame", ["Hand view"]);
  const dropNote =
    (await page.locator("[data-view-dropped]").textContent())?.trim() ?? "";
  const hand = (await listed()).find((view) => view.name === "probe-hand");
  kit.check(
    "b: a hand-written view renders the rest and names the component it dropped",
    written.ok &&
      handWords.includes("Hand view") &&
      dropNote.includes("Sparkline") &&
      JSON.stringify(hand?.dropped) === '["Sparkline"]',
    `“${dropNote}”; listed dropped ${JSON.stringify(hand?.dropped)}`
  );

  // ── d. Keep stores views/<name>.oui, and it survives a reload ─────────
  await open(
    page,
    `${base}/project/${project.id}?view=view:probe-week`,
    ".view-frame"
  );
  await page.getByRole("button", { name: "Keep" }).click();
  await until(
    "the view kept",
    listed,
    (views) => views.some((view) => view.name === "probe-week" && !view.draft),
    30_000
  );
  const kept = await folderFile("views/probe-week.oui");
  const draftGone = await folderFile("views/drafts/probe-week.oui");
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = await viewWords(page, ".view-frame", ["All tasks"]);
  kit.check(
    "d: Keep stores views/probe-week.oui, the draft goes, and the view survives a reload",
    kept === 200 &&
      draftGone === 404 &&
      TITLES.every((title) => reloaded.includes(title)) &&
      (await page.getByText("Caw drafted the").count()) === 0,
    `views/probe-week.oui ${kept}, drafts/probe-week.oui ${draftGone}`
  );

  // ── e. the app's route: that one view, chromeless ──────────────────────
  const phone = await kit.page("phone");
  await open(
    phone,
    `${base}/project/${project.id}/view/probe-week`,
    "[data-view-alone] .view-frame"
  );
  const alone = await viewWords(phone, "[data-view-alone]", ["All tasks"]);
  const frame = await phone.evaluate(() => {
    const main = document.querySelector("[data-view-alone]");
    const box = main?.getBoundingClientRect();
    return {
      shell: document.querySelector(".shell") !== null,
      rail: document.querySelector("aside.rail") !== null,
      top: document.querySelector("header.top") !== null,
      x: box?.x ?? -1,
      width: box?.width ?? 0,
      viewport: window.innerWidth,
      monthList: document.querySelectorAll(
        "[data-view-alone] .ec-list .ec-event"
      ).length,
    };
  });
  kit.check(
    "e: the app's route renders the one view, with no shell, rail or bar, its month as a list",
    TITLES.every((title) => alone.includes(title)) &&
      !frame.shell &&
      !frame.rail &&
      !frame.top &&
      frame.x === 0 &&
      frame.width === frame.viewport &&
      frame.monthList === TITLES.length,
    JSON.stringify(frame)
  );
};

export default { name: "views", run } satisfies Spec;
