/**
 * Work that outlives its surface (DESIGN.md, The Work Outlives Its Surface
 * Rule), read from the engine on a scratch fleet (a real hub, one machine)
 * on three passes: Chromium and WebKit at the desk, and Chromium on a 390
 * phone, each on its own fixtures. The hub's refusals are its answers swapped in the page
 * (`page.route`), and a stop's landing is the hub's own `project.stop` frame
 * said on the page's socket (`routeWebSocket`). Per surface:
 *
 *  (a) machine updates: Install now refused (the machine not connected) is
 *      said in Caw's panel, where the update is parked, and under the
 *      machine's row in Configure › Updates, where it was asked; a reload
 *      says it in both again; Retry asks again; a refused setting (automatic
 *      updates, the check for new builds) is said under it, through a reload;
 *  (b) workflow launch: a reload keeps the form open with what was typed;
 *      a refusal is said in the form and, the form put away, under the
 *      workflow's row with Reopen, through a reload; Reopen brings the form
 *      back with the same words; put away mid-start, the start goes on with
 *      no navigation, and its run lands in the workflow's row;
 *  (c) a routine's Run now refused: said under its row in words, through a
 *      reload;
 *  (d) the forget tray: a reload mid-stop brings the tray back at the same
 *      step, a stop landed in the meantime gone from it; Escape parks it in
 *      one place, under the project's rail row (on a phone, whose rail is a
 *      sheet, under the project's head), live, one press away, with no navigation;
 *      Show brings it back at the same step where it was asked; a stop that failed is said in
 *      the tray and, parked, on the project's row;
 *  (d′) Caw turned off with what he started still running: the same
 *      tray in his settings, through a reload (his settings open again with
 *      it), parked under his switch while they stand and on the project's
 *      row once they close, back on Show, a failure in words in each;
 *  (e) pairing: a reload shows the same code again, and the hub was asked
 *      for one code only;
 *
 * and across every leg, no toast was ever drawn.
 *
 *   bun scripts/probe-kit/run.ts web work-outlives
 */
import type { Page, WebSocketRoute } from "playwright-core";
import { MACHINE } from "../../../scratch-fleet";
import {
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

/** One run of every leg: an engine at a size. */
interface Pass {
  engine: Engine;
  label: string;
  /** Under 640px: the launch form is a sheet, the rail a sheet drawn only while open. */
  phone: boolean;
  view: View;
}

const PASSES: Pass[] = [
  { label: "chromium desk", engine: "chromium", view: "desk", phone: false },
  { label: "webkit desk", engine: "webkit", view: "desk", phone: false },
  {
    label: "chromium phone 390",
    engine: "chromium",
    view: "phone",
    phone: true,
  },
];

/**
 * The passes this run takes: every one, or those whose label holds a word
 * `WORK_OUTLIVES_PASSES` names (`phone`, `webkit`), for a leg read again alone.
 */
const passes = (): Pass[] => {
  const only = process.env.WORK_OUTLIVES_PASSES?.split(",").filter(Boolean);
  return only?.length
    ? PASSES.filter((pass) => only.some((word) => pass.label.includes(word)))
    : PASSES;
};

/** The kit with every assertion named for its pass. */
const named = (kit: Kit, pass: Pass): Kit => ({
  ...kit,
  check: (assertion, ok, detail) =>
    kit.check(`${pass.label}: ${assertion}`, ok, detail),
});

/** Whether `ok` holds within `ms`, looked at every 100 ms. */
async function until(
  ok: () => boolean | Promise<boolean>,
  ms: number
): Promise<boolean> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each look follows the page's last state
    if (await ok()) {
      return true;
    }
    if (Date.now() >= deadline) {
      return false;
    }
    await Bun.sleep(100);
  }
}

const SHELL = '[data-slot="shell"]';
const REFUSED_LAUNCH = "The machine refused the directory probe-refused";
const REFUSED_RUN = "The routine's machine is away right now";
const STOP_FAILED = "The machine would not end the process";

/** Counts every toast the page ever draws, and every main-frame navigation after load. */
function countToasts(): void {
  const w = window as unknown as { __toasts: number };
  w.__toasts = 0;
  new MutationObserver((changes) => {
    for (const change of changes) {
      for (const node of change.addedNodes) {
        if (
          node instanceof Element &&
          (node.matches("[data-sonner-toast]") ||
            node.querySelector("[data-sonner-toast]"))
        ) {
          w.__toasts += 1;
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
}

/** Toasts drawn on every page load so far. */
const toasts = { count: 0 };
async function tallyToasts(page: Page): Promise<void> {
  toasts.count += await page
    .evaluate(() => (window as unknown as { __toasts: number }).__toasts)
    .catch(() => 0);
}

/** Reloads the page, counting the toasts the old load drew first. */
async function reload(page: Page): Promise<void> {
  await tallyToasts(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await settle(page, 400);
}

/** The dashboard's socket, through the spec: it can say a frame as the hub. */
async function socketOf(page: Page): Promise<(payload: object) => void> {
  let current: WebSocketRoute | null = null;
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => ws.send(message));
      ws.onClose(() => {
        if (current === ws) {
          current = null;
        }
      });
    }
  );
  return (payload) =>
    current?.send(
      JSON.stringify({ verb: "frames", machineId: "hub", payload })
    );
}

const textOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .textContent({ timeout: 2000 })
    .then((text) => text?.replace(/\s+/g, " ").trim() ?? "")
    .catch(() => "");

const shown = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .isVisible()
    .catch(() => false);

/**
 * A press as the pass's hand makes it: a click at the desk, a tap of a
 * finger on the phone at the element's centre once it is drawn (as
 * upstream-guard presses its menus). A phone's menu item drawn under a
 * finger is read on ten frames first, its centre each frame, and noted:
 * whether it holds still is the item's own fact, read, not assumed.
 */
async function pick(
  kit: Kit,
  page: Page,
  pass: Pass,
  target: ReturnType<Page["locator"]>
): Promise<void> {
  await target.waitFor({ state: "visible", timeout: 10_000 });
  if (!pass.phone) {
    await target.click();
    return;
  }
  await settle(page, 300);
  const tops = await target.evaluate(
    (el) =>
      new Promise<number[]>((done) => {
        const seen: number[] = [];
        const look = () => {
          seen.push(Math.round(el.getBoundingClientRect().top * 10) / 10);
          if (seen.length < 10) {
            requestAnimationFrame(look);
          } else {
            done(seen);
          }
        };
        requestAnimationFrame(look);
      })
  );
  if (new Set(tops).size > 1) {
    kit.note(
      `${pass.label}: a pressed item moved across ten frames: ${tops.join(", ")}`
    );
  }
  const box = await target.boundingBox();
  if (!box) {
    throw new Error("nothing drawn to press");
  }
  // A finger presses what is drawn on top at the point: anything else there takes the press.
  const over = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2
    );
    return top === el || el.contains(top)
      ? null
      : (top?.closest("[data-slot]")?.getAttribute("data-slot") ?? "") +
          " " +
          (top?.outerHTML.slice(0, 120) ?? "nothing");
  });
  if (over) {
    throw new Error(`a finger here presses what stands over it: ${over}`);
  }
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * The tray put away as the pass's hand does it: Escape from inside it at
 * the desk; on a phone, which has no Escape, a tap on its own Stop waiting.
 */
async function putAway(
  kit: Kit,
  page: Page,
  pass: Pass,
  tray: string
): Promise<void> {
  if (pass.phone) {
    await pick(kit, page, pass, page.locator(`${tray} [data-stop-cancel]`));
    return;
  }
  await page.locator(`${tray} [data-stop-cancel]`).focus();
  await page.keyboard.press("Escape");
}

/** What the page holds, said when a step finds nothing: the open menu, the trays, the stop jobs kept. */
function stateRead() {
  return {
    menu: !!document.querySelector(
      "[data-slot=dropdown-menu-content][data-state=open]"
    ),
    trays: [...document.querySelectorAll("[data-stop-tray]")].map(
      (tray) =>
        `${tray.getAttribute("data-stop-kind")}:${tray.getAttribute("data-phase")}`
    ),
    parked: document.querySelectorAll("[data-stop-parked]").length,
    switch: !!document.querySelector("[data-caw-lead-switch]"),
    focus: document.activeElement?.outerHTML.slice(0, 80) ?? null,
    drawers: [
      ...document.querySelectorAll(
        "[data-slot=drawer-content][data-state=open]"
      ),
    ].map(
      (drawer) =>
        drawer.getAttribute("aria-label") ??
        drawer.querySelector("[data-slot=drawer-title]")?.textContent ??
        drawer.textContent?.slice(0, 60)
    ),
    items: [
      ...document.querySelectorAll(
        "[data-slot=dropdown-menu-content][data-state=open] [role=menuitem]"
      ),
    ].map((item) => {
      const r = item.getBoundingClientRect();
      const top = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2
      );
      return `${item.textContent?.trim()}@${Math.round(r.top)} hit:${top === item || item.contains(top) ? "self" : top?.outerHTML.slice(0, 60)}`;
    }),
    jobs: sessionStorage.getItem("cawco:stop-work")?.slice(0, 400) ?? null,
  };
}

/* ── (a) machine updates ──────────────────────────────────────────── */

/** The machine reports a build to install, as its updater would. */
function updateAvailable(hub: string): Promise<Response> {
  return fetch(`${hub}/api/binary-updates/machines/${MACHINE}/state`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      phase: "available",
      installedVersion: "0.0.1",
      availableVersion: "9.9.9-probe",
      channel: "stable",
    }),
  });
}

async function updatesLeg(kit: Kit, page: Page, base: string, hub: string) {
  const put = await updateAvailable(hub);
  // The machine not connected, as the hub answers it.
  await page.route(`**/api/agents/${MACHINE}/update`, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "machine not connected" }),
    })
  );
  await open(page, `${base}/session`, SHELL, 90_000);
  const panel = async () => {
    const caw = page.locator("[data-needs-caw]:visible").first();
    if ((await caw.getAttribute("aria-expanded")) !== "true") {
      await caw.click();
    }
    await settle(page, 600);
  };
  await panel();
  const ready = await until(
    async () =>
      (await textOf(page, '[data-slot="update-card-card"]')).includes(
        "is ready"
      ),
    10_000
  );
  kit.check(
    "updates: the build waiting for a person is a notice in Caw's panel",
    ready,
    `PUT ${put.status}; ${await textOf(page, '[data-slot="update-card-card"]')}`
  );
  await page
    .locator('[data-slot="update-card-card"] [data-slot="actions"] button')
    .last()
    .click();
  const notice = '[data-slot="update-card-card"]';
  const refusedHere = await until(
    async () => (await textOf(page, notice)).includes("was not installed"),
    10_000
  );
  const words = await textOf(page, notice);
  kit.check(
    "updates: Install now refused is said in Caw's panel, in words, with Retry",
    refusedHere && words.includes("is not connected, so nothing was installed"),
    words
  );
  await reload(page);
  await panel();
  const after = await textOf(page, notice);
  kit.check(
    "updates: after a reload Caw's panel says the refusal again",
    after.includes("was not installed") && after.includes("is not connected"),
    after
  );
  await page.goto(`${base}/config/updates`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  const row = await until(
    async () =>
      (await textOf(page, "[data-row-fault]")).includes("is not connected"),
    10_000
  );
  kit.check(
    "updates: Configure › Updates says the same refusal under the machine's row",
    row,
    await textOf(page, "[data-row-fault]")
  );
  await page.unroute(`**/api/agents/${MACHINE}/update`);

  // A setting the hub refuses is said under it, never a toast, through a reload.
  await page.route("**/api/binary-updates/settings", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "The update policy file is locked" }),
        })
      : route.fallback()
  );
  await page.route("**/api/binary-updates/channels", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "The release server did not answer" }),
        })
      : route.fallback()
  );
  await page.locator("#auto-update").click();
  await page.getByRole("button", { name: "Check for updates" }).click();
  const auto = '[data-setting-refusal="auto"]';
  const checked = '[data-setting-refusal="check"]';
  const told = await until(
    async () =>
      (await textOf(page, auto)).includes("locked") &&
      (await textOf(page, checked)).includes("did not answer"),
    10_000
  );
  kit.check(
    "updates: a refused setting is said under it in words, with Try again",
    told &&
      (await textOf(page, auto)).includes(
        "Automatic updates were not turned on"
      ) &&
      (await textOf(page, checked)).includes(
        "No new builds could be looked for"
      ),
    JSON.stringify({
      auto: await textOf(page, auto),
      check: await textOf(page, checked),
    })
  );
  await reload(page);
  kit.check(
    "updates: a reload keeps each setting's refusal under it",
    (await textOf(page, auto)).includes("locked") &&
      (await textOf(page, checked)).includes("did not answer"),
    JSON.stringify({
      auto: await textOf(page, auto),
      check: await textOf(page, checked),
    })
  );
  await page.unroute("**/api/binary-updates/settings");
  await page.unroute("**/api/binary-updates/channels");
}

/* ── (b) workflow launch ──────────────────────────────────────────── */

async function launchLeg(
  kit: Kit,
  page: Page,
  base: string,
  workflow: { id: string; name: string },
  repo: string,
  pass: Pass
) {
  await page.goto(`${base}/workflows`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`[data-run-workflow="${workflow.id}"]`, {
    timeout: 60_000,
  });
  await settle(page, 400);
  // A popover at the desk, the house sheet on a phone.
  const form = pass.phone
    ? "[data-slot=drawer-content][data-state=open]"
    : "[data-slot=popover-content][data-state=open]";
  await page.locator(`[data-run-workflow="${workflow.id}"]`).click();
  await page.waitForSelector(form);
  await page.locator(form).getByLabel("Machine").selectOption(MACHINE);
  await page
    .locator(form)
    .getByRole("textbox", { name: "Directory", exact: true })
    .fill("probe-refused");
  await settle(page, 300);
  await reload(page);
  // The form comes back once its workflow's row is read again.
  const reopened = await until(() => shown(page, form), 10_000);
  const typed = reopened
    ? await page
        .locator(form)
        .getByRole("textbox", { name: "Directory", exact: true })
        .inputValue()
    : "";
  kit.check(
    "launch: a reload keeps the form open, with what was typed",
    reopened && typed === "probe-refused",
    JSON.stringify({
      reopened,
      typed,
      kept: await page.evaluate(() =>
        sessionStorage.getItem("cawco:workflow-launches")
      ),
    })
  );

  // A refusal: said in the form, then where the launch is parked.
  const runs = `**/api/workflows/${workflow.id}/runs`;
  await page.route(runs, (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: REFUSED_LAUNCH }),
        })
      : route.fallback()
  );
  await page.locator(form).getByRole("button", { name: "Start run" }).click();
  const inForm = await until(
    async () =>
      (await textOf(page, '[data-slot="launch-refusal"]')).includes(
        REFUSED_LAUNCH
      ),
    10_000
  );
  kit.check("launch: a refusal is said in the form", inForm);
  const before = page.url();
  await page.keyboard.press("Escape");
  await page
    .locator(form)
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  const parked = `[data-launch-parked="${workflow.id}"]`;
  const parkedWords = await textOf(page, parked);
  kit.check(
    "launch: put away, the refusal stands under the workflow's row, with Reopen, and nothing navigated",
    !(await shown(page, form)) &&
      parkedWords.includes(REFUSED_LAUNCH) &&
      parkedWords.includes("Reopen") &&
      page.url() === before,
    JSON.stringify({ parkedWords, before, now: page.url() })
  );
  await reload(page);
  const kept = await textOf(page, parked);
  kit.check(
    "launch: a reload keeps the refusal under the row",
    kept.includes(REFUSED_LAUNCH),
    kept
  );
  await page.locator(parked).getByRole("button", { name: "Reopen" }).click();
  await page.waitForSelector(form);
  const back = await textOf(page, '[data-slot="launch-refusal"]');
  const backTyped = await page
    .locator(form)
    .getByRole("textbox", { name: "Directory", exact: true })
    .inputValue();
  kit.check(
    "launch: Reopen brings the form back where it was: the refusal and what was typed",
    back.includes(REFUSED_LAUNCH) && backTyped === "probe-refused",
    JSON.stringify({ back, backTyped })
  );

  // Put away mid-start: the start goes on, nothing navigates, the run lands in the row.
  await page.unroute(runs);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(runs, async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    await held;
    return route.continue();
  });
  await page
    .locator(form)
    .getByRole("textbox", { name: "Directory", exact: true })
    .fill(repo);
  await page.locator(form).getByRole("button", { name: "Start run" }).click();
  await settle(page, 200);
  const at = page.url();
  await page.keyboard.press("Escape");
  await page
    .locator(form)
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => undefined);
  const step = await page
    .locator(parked)
    .getAttribute("data-step")
    .catch(() => null);
  kit.check(
    "launch: put away mid-start, it is parked under the row as starting",
    step === "starting",
    String(step)
  );
  release();
  const landed = await until(
    async () =>
      !(await shown(page, parked)) &&
      (
        await textOf(
          page,
          `[data-slot="workflow-row"]:has([data-run-workflow="${workflow.id}"]) [data-slot="count"]`
        )
      ).startsWith("1"),
    20_000
  );
  kit.check(
    "launch: the start went on with no navigation, and its run is in the workflow's row",
    landed && page.url() === at,
    JSON.stringify({ at, now: page.url() })
  );
  await page.unroute(runs);
}

/* ── (c) a routine's Run now ──────────────────────────────────────── */

async function routineLeg(
  kit: Kit,
  page: Page,
  base: string,
  project: string,
  routine: { id: string; name: string }
) {
  await page.route(`**/api/routines/${routine.id}/run`, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: REFUSED_RUN }),
    })
  );
  await page.goto(`${base}/project/${project}?view=routines`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(`[data-routine="${routine.id}"]`, {
    timeout: 60_000,
  });
  await settle(page, 400);
  await page
    .locator(`[data-routine="${routine.id}"]`)
    .getByRole("button", { name: `More for ${routine.name}` })
    .click();
  await page.getByRole("menuitem", { name: "Run now" }).click();
  const fault = `[data-routine="${routine.id}"] [data-routine-refusal]`;
  const said = await until(
    async () => (await textOf(page, fault)).includes(REFUSED_RUN),
    10_000
  );
  kit.check(
    "routine: Run now refused is said under its row in words",
    said && (await textOf(page, fault)).includes(`${routine.name} did not run`),
    await textOf(page, fault)
  );
  await reload(page);
  kit.check(
    "routine: a reload keeps the refusal under its row",
    (await textOf(page, fault)).includes(REFUSED_RUN),
    await textOf(page, fault)
  );
  await page.unroute(`**/api/routines/${routine.id}/run`);
}

/* ── (d) the forget tray ──────────────────────────────────────────── */

const session = (id: string) => ({
  id,
  cwd: "/probe",
  machineId: MACHINE,
  offline: false,
  parentId: null,
  title: `Probe ${id}`,
});

async function forgetLeg(
  kit: Kit,
  page: Page,
  base: string,
  project: { id: string; name: string },
  say: (payload: object) => void,
  pass: Pass
) {
  let running = [session("stop-a"), session("stop-b")];
  await page.route(`**/api/projects/${project.id}/running`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: running }),
    })
  );
  await page.route(`**/api/projects/${project.id}/stop`, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
  );
  await page.goto(`${base}/project/${project.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await settle(page, 600);
  await pick(
    kit,
    page,
    pass,
    page.getByRole("button", { name: `More for ${project.name}` })
  );
  // Every item of the open menu is the topmost thing at its own centre:
  // pressable, whatever else stands (on a phone, Caw's panel over an empty
  // board's foot stands at the page's sheet layer, under the floating surfaces).
  await settle(page, 400);
  const opened = await page.evaluate(stateRead);
  kit.check(
    "the project's ⋯ menu stands over every other float: each item pressable where it is drawn",
    opened.menu &&
      opened.items.length > 0 &&
      opened.items.every((item) => item.endsWith("hit:self")),
    JSON.stringify({ drawers: opened.drawers, items: opened.items })
  );
  await pick(
    kit,
    page,
    pass,
    page.getByRole("menuitem", { name: "Forget project…" })
  );
  const tray = `[data-stop-tray="${project.id}"]`;
  await page
    .waitForSelector(`${tray}[data-phase="list"]`, { timeout: 10_000 })
    .catch(async (error: unknown) => {
      throw new Error(
        `${String(error)} ${JSON.stringify(await page.evaluate(stateRead))}`
      );
    });
  await page.locator(`${tray} [data-stop-confirm]`).click();
  await settle(page, 500);
  await page.locator(`${tray} [data-stop-confirm]`).click();
  await page.waitForSelector(`${tray}[data-phase="stopping"]`, {
    timeout: 5000,
  });
  const stopFrame = (id: string, outcome: string, error?: string) =>
    say({
      kind: "project.stop",
      projectId: project.id,
      instanceId: id,
      outcome,
      ...(error ? { error } : {}),
    });

  // A reload mid-stop: stop-a lands meanwhile, so the hub lists stop-b alone.
  stopFrame("stop-a", "stopped");
  running = [session("stop-b")];
  await settle(page, 300);
  await reload(page);
  const backAt = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "stopping",
    10_000
  );
  const rows = await page
    .locator(`${tray} [data-row]`)
    .evaluateAll((all) => all.map((row) => row.getAttribute("data-row")));
  kit.check(
    "forget: a reload brings the tray back at the same step, the stop landed meanwhile gone from it",
    backAt && rows.includes("stop-b") && !rows.includes("stop-a"),
    JSON.stringify({ backAt, rows })
  );

  // Escape: parked in one place, live, no navigation: the project's rail row
  // at the desk; on a phone, whose rail is a sheet drawn only while open,
  // under the project's head, one press from the page.
  const at = page.url();
  await putAway(kit, page, pass, tray);
  await settle(page, 500);
  const parked = `[data-stop-parked="${project.id}"]`;
  const where = pass.phone
    ? `[data-slot="project-forget"] ${parked}`
    : `[data-slot="sidebar-forget"] ${parked}`;
  const places = await page.locator(parked).count();
  const live = await textOf(page, where);
  kit.check(
    `forget: put away, the stops park in one place (${pass.phone ? "under the project's head" : "the project's rail row"}), live, one press away, and nothing navigated`,
    !(await shown(page, tray)) &&
      places === 1 &&
      (await shown(page, `${where} button`)) &&
      live.includes("stopped 1 of 2") &&
      page.url() === at,
    JSON.stringify({
      places,
      live,
      at,
      now: page.url(),
      state: await page.evaluate(stateRead),
    })
  );

  // One press back: the tray at the same step, where it was asked.
  await page.locator(where).getByRole("button", { name: "Show" }).click();
  const reshown = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "stopping",
    5000
  );
  const inRail = await page
    .locator(`[data-slot="sidebar-forget"] ${tray}`)
    .count();
  kit.check(
    "forget: Show brings the tray back at the same step, under the head where it was asked",
    reshown && inRail === 0,
    JSON.stringify({ reshown, inRail })
  );

  // A failure: said in the tray, and parked, on the project's row.
  stopFrame("stop-b", "failed", STOP_FAILED);
  const failed = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "fail",
    5000
  );
  kit.check(
    "forget: a stop that failed is said in the tray in words",
    failed && (await textOf(page, tray)).includes(STOP_FAILED),
    await textOf(page, tray)
  );
  await page.locator(`${tray} [data-stop-cancel]`).click();
  await settle(page, 500);
  const said = await textOf(page, where);
  kit.check(
    "forget: put away, the failure stands where it is parked in words, with Reopen",
    said.includes(STOP_FAILED) &&
      said.includes("kept") &&
      said.includes("Reopen") &&
      (await page.locator(parked).count()) === 1,
    said
  );
  await reload(page);
  const kept = await textOf(page, where);
  kit.check(
    "forget: a reload keeps the failure where it is parked",
    kept.includes(STOP_FAILED),
    kept
  );
}

/* ── (d′) Caw turned off with what he started still running ──────── */

const started = (id: string) => ({
  ...session(id),
  kind: "delegate",
  taskId: null,
});

async function cawOffLeg(
  kit: Kit,
  page: Page,
  base: string,
  hub: string,
  project: { id: string; name: string },
  say: (payload: object) => void,
  pass: Pass
) {
  const on = await fetch(`${hub}/api/projects/${project.id}/caw`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ on: true }),
  });
  let running = [started("caw-a"), started("caw-b")];
  // His view as the hub reads it, with what he started still running.
  await page.route(`**/api/projects/${project.id}/caw`, async (route) => {
    const answer = await route.fetch();
    const view = (await answer.json()) as object;
    await route.fulfill({
      response: answer,
      json: { ...view, running },
    });
  });
  await page.route(`**/api/projects/${project.id}/running`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: running }),
    })
  );
  await page.goto(`${base}/project/${project.id}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await settle(page, 600);
  await pick(
    kit,
    page,
    pass,
    page.getByRole("button", { name: `More for ${project.name}` })
  );
  await pick(
    kit,
    page,
    pass,
    page.getByRole("menuitem", { name: "Caw settings…" })
  );
  await page
    .locator("[data-caw-lead-switch]")
    .waitFor({ timeout: 10_000 })
    .catch(async (error: unknown) => {
      throw new Error(
        `${String(error)} ${JSON.stringify(await page.evaluate(stateRead))}`
      );
    });
  await pick(kit, page, pass, page.locator("[data-caw-lead-switch]"));
  const tray = `[data-stop-tray="${project.id}"][data-stop-kind="caw-off"]`;
  try {
    await page.waitForSelector(`${tray}[data-phase="list"]`, {
      timeout: 10_000,
    });
  } catch (error) {
    // What the switch and the page say, for a tray that never came.
    let checked: string | null = null;
    try {
      checked = await page
        .locator("[data-caw-lead-switch]")
        .getAttribute("aria-checked", { timeout: 2000 });
    } catch {
      checked = null;
    }
    throw new Error(
      `${String(error)} ${JSON.stringify({
        state: await page.evaluate(stateRead),
        checked,
        refused: await textOf(page, '[data-slot="refused"]'),
      })}`,
      { cause: error }
    );
  }
  await pick(kit, page, pass, page.locator(`${tray} [data-stop-confirm]`));
  await settle(page, 500);
  await pick(kit, page, pass, page.locator(`${tray} [data-stop-confirm]`));
  await page.waitForSelector(`${tray}[data-phase="stopping"]`, {
    timeout: 5000,
  });
  const stopFrame = (id: string, outcome: string, error?: string) =>
    say({
      kind: "project.stop",
      projectId: project.id,
      instanceId: id,
      outcome,
      ...(error ? { error } : {}),
    });
  stopFrame("caw-a", "stopped");
  running = [started("caw-b")];
  await settle(page, 300);
  await reload(page);
  const backAt = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "stopping",
    10_000
  );
  const rows = await page
    .locator(`${tray} [data-row]`)
    .evaluateAll((all) => all.map((one) => one.getAttribute("data-row")));
  kit.check(
    "caw off: a reload brings his settings and the tray back at the same step, the stop landed meanwhile gone from it",
    on.ok && backAt && rows.includes("caw-b") && !rows.includes("caw-a"),
    JSON.stringify({ on: on.status, backAt, rows })
  );
  const at = page.url();
  await putAway(kit, page, pass, tray);
  await settle(page, 500);
  const parked = `[data-stop-parked="${project.id}"][data-stop-kind="caw-off"]`;
  const live = await textOf(page, parked);
  kit.check(
    "caw off: put away, the stops are said in one place (under his switch while his settings stand, else on the project's row), live, and nothing navigated",
    !(await shown(page, tray)) &&
      (await page.locator(parked).count()) === 1 &&
      live.includes("Caw is off") &&
      live.includes("Stopped 1 of 2") &&
      page.url() === at,
    JSON.stringify({
      live,
      at,
      now: page.url(),
      state: await page.evaluate(stateRead),
    })
  );
  await pick(
    kit,
    page,
    pass,
    page.locator(parked).getByRole("button", { name: "Show" })
  );
  const reshown = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "stopping",
    5000
  );
  kit.check("caw off: Show brings the tray back at the same step", reshown);
  stopFrame("caw-b", "failed", STOP_FAILED);
  const failed = await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "fail",
    5000
  );
  kit.check(
    "caw off: a stop that failed is said in the tray in words",
    failed && (await textOf(page, tray)).includes(STOP_FAILED),
    await textOf(page, tray)
  );
  await pick(kit, page, pass, page.locator(`${tray} [data-stop-cancel]`));
  await settle(page, 500);
  const said = await textOf(page, parked);
  kit.check(
    "caw off: put away, the failure stands where it is parked in words, with Reopen",
    said.includes(STOP_FAILED) &&
      said.includes("Caw is off") &&
      said.includes("Reopen"),
    said
  );
  // His settings closed (Escape at the desk; a phone's sheet by its own
  // Close): the failure stands on the project's row, one press away.
  if (pass.phone) {
    await pick(
      kit,
      page,
      pass,
      page.locator(
        "[data-slot=drawer-content][data-state=open]:not([data-caw-float-sheet]) [aria-label=Close]"
      )
    );
  } else {
    await page.keyboard.press("Escape");
  }
  await settle(page, 600);
  const row = await textOf(page, parked);
  kit.check(
    "caw off: his settings closed, the failure stands on the project's row, one place, with Reopen",
    row.includes(STOP_FAILED) &&
      (await page.locator(parked).count()) === 1 &&
      (await shown(page, `${parked} button`)),
    JSON.stringify({ row, places: await page.locator(parked).count() })
  );
}

/* ── (e) pairing ──────────────────────────────────────────────────── */

async function pairingLeg(kit: Kit, page: Page, base: string, hub: string) {
  const turned = await fetch(`${hub}/api/auth/pairing`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ required: true, kind: "browser" }),
  });
  let asked = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/pair"
    ) {
      asked += 1;
    }
  });
  await page.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
  const code = '[data-slot="pairing"] [data-slot="code"]';
  await page.waitForSelector(code, { timeout: 60_000 });
  const first = await textOf(page, code);
  await tallyToasts(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(code, { timeout: 60_000 });
  await settle(page, 1000);
  const again = await textOf(page, code);
  kit.check(
    "pairing: a reload shows the same code again, and the hub was asked for one code",
    first !== "" && again === first && asked === 1,
    JSON.stringify({ turned: turned.status, first, again, asked })
  );
}

const spec: Spec = {
  name: "work-outlives",
  run: async (kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 0, words: ["ok."] }));
    fleet.launch("hub");
    await fleet.hubUp();
    const base = await fleet.dashboard();
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    const program =
      'import { z } from "zod";\n\nexport const inputs = z.object({});\n\nexport default async function () {\n  return {};\n}\n';
    /** Each pass its own project, Caw's project, workflow and routine, so no pass reads another's. */
    const fixtures = async (n: number) => {
      const project = await fleet.api<{ id: string; name: string }>(
        "/api/projects",
        { name: `Probe ${n}` }
      );
      const cawProject = await fleet.api<{ id: string; name: string }>(
        "/api/projects",
        { name: `Probe Caw ${n}` }
      );
      const workflow = await fleet.api<{ id: string; name: string }>(
        "/api/workflows",
        { name: `Probe launch ${n}`, program }
      );
      const routine = { id: `routine-probe-${n}`, name: `Probe digest ${n}` };
      const now = Date.now();
      fleet.write(
        "INSERT INTO routines (id, project_id, name, cron, time_zone, target, prompt, lands, enabled, created_by, keep, expires_at, next_slot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 1, 'session', 0, ?, ?, ?)",
        routine.id,
        project.id,
        routine.name,
        "0 9 * * 1",
        "UTC",
        "delegate",
        "Write the digest.",
        now + 7 * 86_400_000,
        now + 365 * 86_400_000,
        now
      );
      return { project, cawProject, workflow, routine };
    };

    for (const [n, pass] of passes().entries()) {
      const k = named(kit, pass);
      // biome-ignore lint/performance/noAwaitInLoops: one pass after another, each on its own fixtures
      const { project, cawProject, workflow, routine } = await fixtures(n);
      const page = await kit.page(pass.view, { engine: pass.engine });
      await page.context().addInitScript(countToasts);
      const say = await socketOf(page);
      const legs: [string, () => Promise<void>][] = [
        ["updates", () => updatesLeg(k, page, base, fleet.base)],
        ["launch", () => launchLeg(k, page, base, workflow, fleet.repo, pass)],
        ["routine", () => routineLeg(k, page, base, project.id, routine)],
        ["forget", () => forgetLeg(k, page, base, project, say, pass)],
        [
          "caw off",
          () => cawOffLeg(k, page, base, fleet.base, cawProject, say, pass),
        ],
      ];
      for (const [name, leg] of legs) {
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one leg after another, on one page
          await leg();
        } catch (error) {
          k.check(`${name}: ran to its end`, false, String(error));
        }
      }
      await tallyToasts(page);
    }

    // Pairing last: once the hub requires paired devices, every page is a stranger.
    for (const pass of passes()) {
      const k = named(kit, pass);
      // biome-ignore lint/performance/noAwaitInLoops: one stranger after another
      const stranger = await kit.page(pass.view, { engine: pass.engine });
      await stranger.context().addInitScript(countToasts);
      try {
        await pairingLeg(k, stranger, base, fleet.base);
      } catch (error) {
        k.check("pairing: ran to its end", false, String(error));
      }
      await tallyToasts(stranger);
    }
    kit.check(
      "no toast was drawn in any leg of any pass",
      toasts.count === 0,
      `${toasts.count} toast(s)`
    );
  },
};

export default spec;
