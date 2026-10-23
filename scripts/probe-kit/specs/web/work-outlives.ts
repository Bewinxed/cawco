/**
 * Work that outlives its surface (DESIGN.md, The Work Outlives Its Surface
 * Rule), read from the engine on a scratch fleet (a real hub, one machine)
 * on five passes, each on its own fixtures. The hub's refusals are its answers swapped in the page
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
 * and a failure is said where it happened, never a toast (the same rule):
 *  (f) a Configure delete the hub refuses is said under the row, with Try
 *      again; the row stays;
 *  (g) a Caw-drafted view's Keep the hub refuses is said under its bar,
 *      with Try again; it stays a draft;
 *  (h) the artifact menu: a list it can't read is said at the menu's top, a
 *      refused removal under its row, a refused show on the pane's own
 *      line, each with Try again;
 *  (i) a Stop the hub refuses is said over the session's composer in the
 *      error formula, with Try again, which stops the turn;
 *  (j) a harness that couldn't list a machine's stored sessions is said
 *      under Recent, with Try again, which lists them again;
 *  (k) a copy the browser refuses is said under the menu item, with Try
 *      again and the text under Show details;
 *  (l) Behind's failed line, with a hub sentence of 60+ words, wraps inside
 *      the pane at 390, 820 and 1440, and nothing overflows;
 *
 * on five passes (Chromium, WebKit and Firefox at the desk; Chromium and
 * WebKit on a 390 phone), and across every leg, no toast was ever drawn.
 *
 *   bun scripts/probe-kit/run.ts web work-outlives
 */
import type { Page, WebSocketRoute } from "playwright-core";
import { HOOK_TEMPLATES } from "../../../../packages/core/src/hooks";
import { commonWords } from "../../../../packages/core/src/words/common";
import { projectWords } from "../../../../packages/core/src/words/project";
import { shellWords } from "../../../../packages/core/src/words/shell";
import { updatesWords } from "../../../../packages/core/src/words/updates";
import { MACHINE, type Seen } from "../../../scratch-fleet";
import {
  type Engine,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";
import { shaped } from "../../words";

/** What the stand-in release server's refusal says: the spec's own words, which the hub hands on. */
const RELEASE_SILENT = "The release server did not answer";

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
  {
    label: "webkit phone 390",
    engine: "webkit",
    view: "phone",
    phone: true,
  },
  { label: "firefox desk", engine: "firefox", view: "desk", phone: false },
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
/** A prompt the mock answers slowly: a turn long enough to press Stop in. */
const SLOW = "probe-slow: take your time";
/** The mock's answer: slow for {@link SLOW}, at once for anything else. */
const respond = (seen: Seen) =>
  seen.last.includes("probe-slow")
    ? { everyMs: 1000, words: Array.from({ length: 90 }, () => "slowly") }
    : { everyMs: 0, words: ["ok."] };
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

/** The dashboard's socket as the spec holds it. */
interface Socket {
  /** Drops the socket under the page, as a hub restart does: it reconnects and reads again. */
  drop: () => Promise<void>;
  /** While set, a `listSessions` answer leaves this harness out with this error. */
  listFails: { harness: string; error: string } | null;
  /** While set, the page's interrupts are refused by the hub in these words. */
  refuseInterrupt: string | null;
  /** Says a frame to the page as the hub. */
  say: (payload: object) => void;
}

/** Parsed JSON, or null for a frame that is not (a part, bytes). */
function parsedFrame(message: string | Buffer): Record<string, unknown> | null {
  if (typeof message !== "string") {
    return null;
  }
  try {
    const value: unknown = JSON.parse(message);
    return typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Every object in `value`, depth first: a frame wherever the envelope puts it. */
function* objectsIn(value: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(value)) {
    for (const item of value) {
      yield* objectsIn(item);
    }
  } else if (typeof value === "object" && value !== null) {
    yield value as Record<string, unknown>;
    for (const item of Object.values(value)) {
      yield* objectsIn(item);
    }
  }
}

/**
 * A machine's `listSessions` answer with `fails` left out of it, as its
 * agent says a harness whose listing threw; null for any other frame.
 */
function leftOut(
  message: string | Buffer,
  fails: Socket["listFails"],
  listings: Set<string>
): string | null {
  const heard =
    fails && typeof message === "string" && message.includes("control_result")
      ? parsedFrame(message)
      : null;
  if (!(fails && heard)) {
    return null;
  }
  let changed = false;
  for (const frame of objectsIn(heard)) {
    if (
      frame.kind === "control_result" &&
      listings.has(String(frame.requestId))
    ) {
      frame.failed = [fails];
      changed = true;
    }
  }
  return changed ? JSON.stringify(heard) : null;
}

/**
 * The dashboard's socket, through the spec: it can say a frame as the hub,
 * refuse an interrupt as the hub does (a `failed` command ack), and leave a
 * harness out of a machine's `listSessions` answer as its agent does.
 */
async function socketOf(page: Page): Promise<Socket> {
  let current: WebSocketRoute | null = null;
  const listings = new Set<string>();
  const socket: Socket = {
    say: (payload) =>
      current?.send(
        JSON.stringify({ verb: "frames", machineId: "hub", payload })
      ),
    drop: async () => {
      await current?.close();
    },
    refuseInterrupt: null,
    listFails: null,
  };
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      current = ws;
      const server = ws.connectToServer();
      ws.onMessage((message) => {
        const sent = parsedFrame(message);
        if (
          socket.refuseInterrupt &&
          sent?.type === "command" &&
          sent.kind === "interrupt"
        ) {
          ws.send(
            JSON.stringify({
              type: "command.ack",
              commandId: sent.commandId,
              stage: "failed",
              reason: socket.refuseInterrupt,
            })
          );
          return;
        }
        const asked = sent?.payload as { method?: string } | undefined;
        if (sent?.verb === "control" && asked?.method === "listSessions") {
          listings.add(String(sent.requestId));
        }
        server.send(message);
      });
      server.onMessage((message) => {
        ws.send(leftOut(message, socket.listFails, listings) ?? message);
      });
      ws.onClose(() => {
        if (current === ws) {
          current = null;
        }
      });
    }
  );
  return socket;
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
      shaped(updatesWords.ready).test(
        await textOf(page, '[data-slot="update-card-card"]')
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
    async () =>
      shaped(updatesWords.notInstalled).test(await textOf(page, notice)),
    10_000
  );
  const words = await textOf(page, notice);
  kit.check(
    "updates: Install now refused is said in Caw's panel, in words, with Retry",
    refusedHere && shaped(updatesWords.notConnected).test(words),
    words
  );
  await reload(page);
  await panel();
  const after = await textOf(page, notice);
  kit.check(
    "updates: after a reload Caw's panel says the refusal again",
    shaped(updatesWords.notInstalled).test(after) &&
      shaped(updatesWords.notConnected).test(after),
    after
  );
  await page.goto(`${base}/config/updates`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  const row = await until(
    async () =>
      shaped(updatesWords.notConnected).test(
        await textOf(page, "[data-row-fault]")
      ),
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
          body: JSON.stringify({ error: RELEASE_SILENT }),
        })
      : route.fallback()
  );
  await page.locator("#auto-update").click();
  await page.getByRole("button", { name: commonWords.checkForUpdates }).click();
  const auto = '[data-setting-refusal="auto"]';
  const checked = '[data-setting-refusal="check"]';
  const told = await until(
    async () =>
      (await textOf(page, auto)).includes("locked") &&
      (await textOf(page, checked)).includes(RELEASE_SILENT),
    10_000
  );
  kit.check(
    "updates: a refused setting is said under it in words, with Try again",
    told &&
      (await textOf(page, auto)).includes(
        "Automatic updates were not turned on"
      ) &&
      (await textOf(page, checked)).includes(
        updatesWords.noNewBuilds(RELEASE_SILENT)
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
      (await textOf(page, checked)).includes(RELEASE_SILENT),
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
    .getByRole("button", { name: commonWords.moreFor(routine.name) })
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
    page.getByRole("button", { name: commonWords.moreFor(project.name) })
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
    page.getByRole("menuitem", { name: projectWords.forgetProject })
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
  await settle(page);
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
  // The rail draws its project rows once the hub has listed them: the parked
  // line comes with its row, then is read once its arrival has landed.
  await page.waitForSelector(where, { timeout: 10_000 }).catch(() => undefined);
  await settle(page);
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
    page.getByRole("button", { name: commonWords.moreFor(project.name) })
  );
  await pick(
    kit,
    page,
    pass,
    page.getByRole("menuitem", { name: projectWords.cawSettings })
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
  // Close pressed once the failure has landed: its line grows the tray,
  // which keeps itself in view as it grows (StopTray's `unfoldHere`), and a
  // press made while it grew left the tray standing in WebKit.
  await settle(page);
  await pick(kit, page, pass, page.locator(`${tray} [data-stop-cancel]`));
  await until(
    async () => (await textOf(page, parked)).includes(STOP_FAILED),
    10_000
  );
  const said = await textOf(page, parked);
  kit.check(
    "caw off: put away, the failure stands where it is parked in words, with Reopen",
    said.includes(STOP_FAILED) &&
      said.includes("Caw is off") &&
      said.includes("Reopen"),
    `${said} ${JSON.stringify(await page.evaluate(stateRead))}`
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
  await until(
    async () => (await textOf(page, parked)).includes(STOP_FAILED),
    10_000
  );
  const row = await textOf(page, parked);
  kit.check(
    "caw off: his settings closed, the failure stands on the project's row, one place, with Reopen",
    row.includes(STOP_FAILED) &&
      (await page.locator(parked).count()) === 1 &&
      (await shown(page, `${parked} button`)),
    JSON.stringify({ row, places: await page.locator(parked).count() })
  );
  // Reopened from the project's row (his settings closed), the tray stands
  // there; put away again, the failure parks there again, never nowhere.
  await pick(
    kit,
    page,
    pass,
    page.locator(parked).getByRole("button", { name: "Reopen" })
  );
  await until(
    async () =>
      (await page
        .locator(tray)
        .getAttribute("data-phase")
        .catch(() => null)) === "fail",
    5000
  );
  await settle(page);
  await pick(kit, page, pass, page.locator(`${tray} [data-stop-cancel]`));
  await until(
    async () => (await textOf(page, parked)).includes(STOP_FAILED),
    10_000
  );
  kit.check(
    "caw off: reopened from the project's row and put away again, the failure parks there again",
    (await textOf(page, parked)).includes(STOP_FAILED) &&
      (await page.locator(parked).count()) === 1,
    JSON.stringify({
      row: await textOf(page, parked),
      places: await page.locator(parked).count(),
      state: await page.evaluate(stateRead),
    })
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

/* ── (f)–(l): a failure said where it happened, never a toast ─────── */

const LONG_WHY =
  "The hub could not read this part of the conversation because the machine that keeps its transcript answered with a partial page, which the hub refuses to hand on, since a page with rows missing from its middle would be read as the whole of what was said, and a person reading it would act on a conversation that never happened the way it shows; the hub asks the machine again on its own schedule, and the rows already on screen stay where they are until the read lands whole";

/** What a refusal line says and offers: its words, and whether Try again stands in it. */
const faultOf = (page: Page, selector: string) =>
  page.evaluate(
    ({ sel, again, showDetails }) => {
      const line = document.querySelector(sel);
      return {
        text: line?.textContent?.replace(/\s+/g, " ").trim() ?? "",
        again: [...(line?.querySelectorAll("button") ?? [])].some((button) =>
          (button.textContent ?? "").includes(again)
        ),
        details: [...(line?.querySelectorAll("button") ?? [])].some((button) =>
          (button.textContent ?? "").includes(showDetails)
        ),
      };
    },
    // Try again's and Show details' words go in as the read's argument: it runs in the page.
    {
      sel: selector,
      again: commonWords.tryAgain,
      showDetails: shellWords.showDetails,
    }
  );

/** Toasts on screen now: none may be, after any refusal. */
const toastsNow = (page: Page) => page.locator("[data-sonner-toast]").count();

async function configDeleteLeg(
  kit: Kit,
  page: Page,
  base: string,
  n: number,
  pass: Pass
) {
  const id = `probe-hook-${n}`;
  const name = `Probe hook ${n}`;
  const { draft } = HOOK_TEMPLATES[0] as (typeof HOOK_TEMPLATES)[number];
  await page.goto(`${base}/config/hooks`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  const made = await page.evaluate(
    async ({ id: hook, body }) =>
      (
        await fetch(`/api/fleet/hooks/${encodeURIComponent(hook)}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status,
    {
      id,
      body: {
        name,
        enabled: draft.enabled,
        event: draft.event,
        matcher: draft.matcher ?? null,
        handler: draft.handler,
        script: draft.script ?? null,
        scope: null,
        projectId: null,
      },
    }
  );
  const refusal = "The hook's file is open in another editor";
  await page.route(`**/api/fleet/hooks/${id}`, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: refusal }),
        })
      : route.fallback()
  );
  await reload(page);
  await pick(
    kit,
    page,
    pass,
    page.getByRole("button", { name: commonWords.moreFor(name) })
  );
  await pick(
    kit,
    page,
    pass,
    page.getByRole("menuitem", { name: "Delete hook" })
  );
  const line = `[data-delete-refusal="${id}"]`;
  await until(async () => (await textOf(page, line)).includes(refusal), 10_000);
  const said = await faultOf(page, line);
  kit.check(
    "config delete: a refused delete is said under its row in words, with Try again, and the row stays",
    said.text.includes(refusal) &&
      said.text.includes(`${name} stays as it was`) &&
      said.again &&
      (await page
        .getByRole("button", { name: commonWords.moreFor(name) })
        .count()) === 1 &&
      (await toastsNow(page)) === 0,
    JSON.stringify({ made, said })
  );
  await reload(page);
  await until(async () => (await textOf(page, line)).includes(refusal), 15_000);
  const kept = await faultOf(page, line);
  kit.check(
    "config delete: a reload says the refusal under the row again, with Try again",
    kept.text.includes(refusal) && kept.again,
    JSON.stringify(kept)
  );
  await page.unroute(`**/api/fleet/hooks/${id}`);
  await page.locator(`${line} [data-again]`).click();
  const deleted = await until(
    async () =>
      (await page
        .getByRole("button", { name: commonWords.moreFor(name) })
        .count()) === 0,
    10_000
  );
  kit.check(
    "config delete: Try again deletes it, and the line goes with its row",
    deleted && (await page.locator(line).count()) === 0
  );
}

/**
 * On a phone, Caw's panel is a sheet at the page's foot, over what it
 * covers (CawFloat): put away by its own Close, as a person would.
 */
async function putCawAway(kit: Kit, page: Page, pass: Pass): Promise<void> {
  const close = page.locator(
    "[data-caw-float-sheet][data-state=open] [aria-label=Close]"
  );
  if (pass.phone && (await close.count()) > 0) {
    await pick(kit, page, pass, close.first());
    await settle(page, 500);
  }
}

async function viewKeepLeg(
  kit: Kit,
  page: Page,
  base: string,
  project: { id: string; name: string },
  pass: Pass
) {
  const view = "probe-digest";
  const views = `**/api/projects/${project.id}/views`;
  await page.route(views, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              draft: true,
              dropped: [],
              name: view,
              source: 'root = Stack([Text("Probe digest")])',
            },
          ]),
        })
      : route.fallback()
  );
  const refusal = "The project's views folder is not writable";
  const keepRoute = `**/api/projects/${project.id}/views/${view}/keep`;
  await page.route(keepRoute, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: refusal }),
    })
  );
  await page.goto(
    `${base}/project/${project.id}?view=${encodeURIComponent(`view:${view}`)}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await putCawAway(kit, page, pass);
  await pick(
    kit,
    page,
    pass,
    page.getByRole("button", { name: "Keep", exact: true })
  );
  const line = `[data-view-refusal="${view}"]`;
  await until(async () => (await textOf(page, line)).includes(refusal), 10_000);
  const said = await faultOf(page, line);
  kit.check(
    "view keep: a refused Keep is said under the draft's bar, with Try again; it stays a draft",
    said.text.includes("was not kept") &&
      said.text.includes(refusal) &&
      said.text.includes("It stays a draft") &&
      said.again &&
      (await page.getByRole("button", { name: "Keep", exact: true }).count()) >
        0 &&
      (await toastsNow(page)) === 0,
    JSON.stringify(said)
  );
  await reload(page);
  await putCawAway(kit, page, pass);
  await until(async () => (await textOf(page, line)).includes(refusal), 15_000);
  const kept = await faultOf(page, line);
  kit.check(
    "view keep: a reload says the refused Keep under the bar again",
    kept.text.includes(refusal) && kept.again,
    JSON.stringify(kept)
  );
  // Its words stand under the bar's words: one inset, read off the boxes.
  const inset = await page.evaluate((sel) => {
    const reason = document.querySelector(`${sel} [data-slot="reason"]`);
    const bar = document
      .querySelector(sel)
      ?.previousElementSibling?.querySelector("span");
    return reason && bar
      ? {
          reason: reason.getBoundingClientRect().left,
          bar: bar.getBoundingClientRect().left,
        }
      : null;
  }, line);
  kit.check(
    "view keep: the refusal's words start where the bar's words start",
    inset !== null && Math.abs(inset.reason - inset.bar) <= 1,
    JSON.stringify(inset)
  );
  await page.unroute(keepRoute);
  await page.unroute(views);
}

/** Seeds pages in a session's panel through the dashboard's origin; their ids, oldest first. */
const seedPages = (page: Page, instanceId: string, names: string[]) =>
  page.evaluate(
    async ({ id, all }) => {
      const made: string[] = [];
      for (const name of all) {
        // biome-ignore lint/performance/noAwaitInLoops: each page after the last, so the newest is shown
        const response = await fetch(
          `/api/instances/${encodeURIComponent(id)}/artifacts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kind: "page",
              name,
              does: "judge",
              ask: `Judge ${name}`,
              html: `<!doctype html><html><body><h1>${name}</h1></body></html>`,
            }),
          }
        );
        made.push(((await response.json()) as { id: string }).id);
      }
      return made;
    },
    { id: instanceId, all: names }
  );

const ARTIFACT_LIST = /\/api\/instances\/[^/]+\/artifacts$/;
/** The session's own tab in its pane's strip, whose menu holds Copy link. */
const SESSION_TAB = '[data-session-tabs] [data-slot="tab"]:visible';

async function artifactMenuLeg(
  kit: Kit,
  page: Page,
  base: string,
  instanceId: string,
  pass: Pass,
  n: number
) {
  await page.goto(`${base}/session/${instanceId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  const [older, newer] = await seedPages(page, instanceId, [
    `probe-older-${n}`,
    `probe-newer-${n}`,
  ]);
  const trigger = page.locator("[data-artifact-trigger]:visible").first();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });

  // The list unreadable: said at the menu's top, with Try again.
  await page.route(ARTIFACT_LIST, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "The artifact store is locked" }),
        })
      : route.fallback()
  );
  await pick(kit, page, pass, trigger);
  const listLine = "[data-artifact-list-refused]";
  await until(
    async () => (await textOf(page, listLine)).includes("locked"),
    10_000
  );
  const listSaid = await faultOf(page, listLine);
  await page.unroute(ARTIFACT_LIST);
  await page.locator(`${listLine} [data-again]`).click();
  const listed = await until(
    async () =>
      (await page.locator("[data-artifact-row]").count()) >= 2 &&
      (await page.locator(listLine).count()) === 0,
    10_000
  );
  kit.check(
    "artifact menu: an unreadable list is said at the menu's top with Try again, which reads it",
    listSaid.text.includes("were not read") && listSaid.again && listed,
    JSON.stringify({ listSaid, listed })
  );

  // A refused removal: under its row, the row stays.
  const one = `**/api/instances/${instanceId}/artifacts/${older}`;
  await page.route(one, (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "A decision page still embeds it" }),
        })
      : route.fallback()
  );
  // Pressed once the rows the list's read brought have landed: arriving,
  // a row is uncovered by its clip (reflow, motion/rows.svelte.ts), and a
  // press on a part still clipped lands on what is under it; forced, the
  // press went out mid-arrival and nothing was asked of the hub.
  await settle(page);
  let asked = 0;
  const onAsk = (request: { method: () => string; url: () => string }) => {
    if (request.method() === "DELETE" && request.url().endsWith(older)) {
      asked += 1;
    }
  };
  page.on("request", onAsk);
  await page.getByRole("button", { name: `Remove probe-older-${n}` }).click();
  const removeLine = `[data-artifact-remove-refused="${older}"]`;
  await until(
    async () => (await textOf(page, removeLine)).includes("embeds"),
    10_000
  );
  const removeSaid = await faultOf(page, removeLine);
  kit.check(
    "artifact menu: a refused removal is said under its row with Try again, the row standing",
    removeSaid.text.includes("wasn't removed") &&
      removeSaid.again &&
      (await page
        .locator(`[data-artifact-row][data-artifact="${older}"]`)
        .count()) === 1,
    JSON.stringify({ ...removeSaid, asked })
  );
  page.off("request", onAsk);
  await page.unroute(one);

  // A refused show: the menu closes, the pane's own line says it.
  const show = `**/api/instances/${instanceId}/artifacts/${older}/show`;
  await page.route(show, (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ error: "The panel is held by its delegate" }),
    })
  );
  await page
    .locator(`[data-artifact-row][data-artifact="${older}"]`)
    .first()
    .click();
  const paneLine = "[data-pane-failure]";
  await until(
    async () => (await textOf(page, paneLine)).includes("held by"),
    10_000
  );
  const showSaid = await faultOf(page, paneLine);
  kit.check(
    "artifact menu: a refused show is said on the pane's own line, with Try again",
    showSaid.text.includes(`probe-older-${n} was not shown`) &&
      showSaid.again &&
      (await toastsNow(page)) === 0,
    JSON.stringify({ showSaid, newer })
  );
  await reload(page);
  const showKept = await until(
    async () => (await textOf(page, paneLine)).includes("held by"),
    15_000
  );
  kit.check(
    "artifact menu: a reload says the refused show on the pane's line again",
    showKept && (await faultOf(page, paneLine)).again,
    await textOf(page, paneLine)
  );
  await page.unroute(show);
  await page.locator(`${paneLine} [data-again]`).click();
  const shownNow = await until(
    async () => (await page.locator(paneLine).count()) === 0,
    10_000
  );
  kit.check("artifact menu: Try again shows it, and the line goes", shownNow);
}

async function interruptLeg(
  kit: Kit,
  page: Page,
  base: string,
  instanceId: string,
  socket: Socket,
  send: (id: string, text: string) => Promise<string>,
  pass: Pass
) {
  await page.goto(`${base}/session/${instanceId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await send(instanceId, SLOW);
  const stop = page
    .locator('button[aria-label="Stop the agent"]:visible')
    .first();
  await stop.waitFor({ state: "visible", timeout: 60_000 });
  await until(() => stop.isEnabled(), 30_000);
  const refusal = "The machine did not take the stop in time";
  socket.refuseInterrupt = refusal;
  await pick(kit, page, pass, stop);
  const line = '[data-slot="send-error"]';
  await until(async () => (await textOf(page, line)).includes(refusal), 10_000);
  const said = await textOf(page, line);
  const again = page.locator(`${line} [data-fault-again]`);
  kit.check(
    "interrupt: a refused Stop is said over the composer in the error formula, with Try again",
    said.includes(`The turn was not stopped: ${refusal}. It goes on.`) &&
      (await again.count()) === 1 &&
      (await toastsNow(page)) === 0,
    said
  );
  await reload(page);
  const kept = await until(
    async () => (await textOf(page, line)).includes(refusal),
    15_000
  );
  kit.check(
    "interrupt: a reload says the refused Stop over the composer again, with Try again",
    kept && (await again.count()) === 1,
    await textOf(page, line)
  );
  socket.refuseInterrupt = null;
  await pick(kit, page, pass, again);
  const gone = await until(
    async () => (await page.locator(line).count()) === 0,
    15_000
  );
  kit.check("interrupt: Try again stops the turn and the line goes", gone);
}

async function catalogueLeg(
  kit: Kit,
  page: Page,
  base: string,
  socket: Socket
) {
  const error = "the session index is being rebuilt";
  socket.listFails = { harness: "opencode", error };
  await page.goto(`${base}/session`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  const line = `[data-catalog-left-out="${MACHINE}"]`;
  await until(async () => (await textOf(page, line)).includes(error), 30_000);
  const said = await faultOf(page, line);
  kit.check(
    "catalogue: a harness that couldn't list is said under Recent in the machine's words, with Try again",
    said.text.includes("couldn't list its stored sessions") &&
      said.text.includes(error) &&
      said.again &&
      (await toastsNow(page)) === 0,
    JSON.stringify(said)
  );
  socket.listFails = null;
  await page.locator(`${line} [data-again]`).first().click();
  const gone = await until(
    async () => (await page.locator(line).count()) === 0,
    15_000
  );
  kit.check(
    "catalogue: Try again lists the machine again and the line goes",
    gone
  );
}

/**
 * The session tab's menu opened as the pass's hand opens it: a right click
 * at the desk; a finger's long press on a phone, which the page hears as a
 * `contextmenu` at the press. Asked once more if the menu is not up.
 */
async function openTabMenu(
  page: Page,
  pass: Pass,
  item: ReturnType<Page["locator"]>
): Promise<void> {
  const tab = page.locator(SESSION_TAB).first();
  await tab.waitFor({ state: "visible", timeout: 30_000 });
  await settle(page, 300);
  for (let tries = 0; tries < 2; tries += 1) {
    if (pass.phone) {
      // biome-ignore lint/performance/noAwaitInLoops: once more only if the menu is not up
      const box = await tab.boundingBox();
      await tab.dispatchEvent("contextmenu", {
        bubbles: true,
        clientX: (box?.x ?? 0) + (box?.width ?? 0) / 2,
        clientY: (box?.y ?? 0) + (box?.height ?? 0) / 2,
      });
    } else {
      await tab.click({ button: "right" });
    }
    if (await until(() => item.isVisible(), 5000)) {
      return;
    }
  }
  await item.waitFor({ state: "visible", timeout: 5000 });
}

async function copyLeg(
  kit: Kit,
  page: Page,
  base: string,
  instanceId: string,
  pass: Pass
) {
  await page.goto(`${base}/session/${instanceId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  await page.evaluate(() => {
    const refuse = () =>
      Promise.reject(
        new DOMException("Write permission denied.", "NotAllowedError")
      );
    if (navigator.clipboard) {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: refuse,
      });
    }
  });
  const item = page
    .getByRole("menuitem", { name: commonWords.copyLink })
    .first();
  await openTabMenu(page, pass, item);
  await item.click();
  const line = "[data-copy-refused]";
  await until(
    async () => (await textOf(page, line)).includes("didn't allow"),
    10_000
  );
  const said = await faultOf(page, line);
  kit.check(
    "copy: a copy the browser refused is said under the item, the menu open, with Try again and the text under Show details",
    said.text.includes("The browser didn't allow copying the link") &&
      said.again &&
      said.details &&
      (await item.isVisible()) &&
      (await toastsNow(page)) === 0,
    JSON.stringify(said)
  );
  await page.keyboard.press("Escape");
  // Its menu opened again after a reload says it again under the item.
  await reload(page);
  await openTabMenu(page, pass, item);
  const kept = await faultOf(page, line);
  kit.check(
    "copy: after a reload, the menu opened again says the refused copy under the item",
    kept.text.includes("The browser didn't allow copying the link") &&
      kept.again,
    JSON.stringify(kept)
  );
  await page.keyboard.press("Escape");
}

/** Behind's line at each width: inside the pane, wrapping, nothing past its box. */
async function behindLeg(
  kit: Kit,
  page: Page,
  base: string,
  instanceId: string,
  socket: Socket,
  send: (id: string, text: string) => Promise<string>
) {
  // A turn of its own, so the view holds rows whichever legs ran before.
  await send(instanceId, "Say ok.");
  await page.goto(`${base}/session/${instanceId}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(SHELL, { timeout: 60_000 });
  // Rows held: a read refused over them leaves the view behind, not empty.
  await page.waitForSelector('[data-slot="pane"] [role=log] [data-row]', {
    timeout: 60_000,
  });
  await page.route("**/api/instances/*/transcript*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: LONG_WHY }),
    })
  );
  // The socket drops: the catch-up read on reconnecting is refused.
  await socket.drop();
  const line = '[data-slot="behind"]';
  const saidLong = await until(
    async () => (await textOf(page, line)).includes("schedule"),
    30_000
  );
  const words = (await textOf(page, line)).split(" ").length;
  for (const width of [390, 820, 1440]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width after another
    await page.setViewportSize({ width, height: 844 });
    await settle(page, 400);
    const box = await page.evaluate((sel) => {
      const behind = document.querySelector<HTMLElement>(sel);
      const pane = behind?.closest<HTMLElement>('[data-slot="pane"]');
      const p = behind?.querySelector("p");
      if (!(behind && pane && p)) {
        return null;
      }
      const b = behind.getBoundingClientRect();
      const r = pane.getBoundingClientRect();
      const lineHeight = Number.parseFloat(getComputedStyle(p).lineHeight);
      return {
        inside:
          b.left >= r.left - 0.5 &&
          b.right <= r.right + 0.5 &&
          b.top >= r.top - 0.5 &&
          b.bottom <= r.bottom + 0.5,
        lines: Math.round(p.getBoundingClientRect().height / lineHeight),
        behindOverflow: behind.scrollWidth - behind.clientWidth,
        pOverflow: p.scrollWidth - p.clientWidth,
        pageOverflow:
          (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth,
        rects: {
          behind: [b.left, b.right, b.top, b.bottom].map(Math.round),
          pane: [r.left, r.right, r.top, r.bottom].map(Math.round),
        },
      };
    }, line);
    kit.check(
      `behind at ${width}: a ${words}-word failed line wraps inside the pane and nothing overflows`,
      saidLong &&
        words >= 60 &&
        box?.inside === true &&
        box.lines > 1 &&
        box.behindOverflow <= 0 &&
        box.pOverflow <= 0 &&
        box.pageOverflow <= 0,
      JSON.stringify({
        box,
        said: await textOf(page, line),
        pane: await textOf(page, '[data-slot="pane"] [role=alert]'),
      })
    );
  }
  await page.unroute("**/api/instances/*/transcript*");
}

const spec: Spec = {
  name: "work-outlives",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("hub");
    await fleet.hubUp();
    const base = await fleet.dashboard();
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
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
      const chat = await fleet.spawn("claude", `Probe chat ${n}`, fleet.repo);
      return { project, cawProject, workflow, routine, chat };
    };

    for (const [n, pass] of passes().entries()) {
      const k = named(kit, pass);
      const { project, cawProject, workflow, routine, chat } =
        // biome-ignore lint/performance/noAwaitInLoops: one pass after another, each on its own fixtures
        await fixtures(n);
      const page = await kit.page(pass.view, { engine: pass.engine });
      await page.context().addInitScript(countToasts);
      const socket = await socketOf(page);
      const { say } = socket;
      const legs: [string, () => Promise<void>][] = [
        ["updates", () => updatesLeg(k, page, base, fleet.base)],
        ["launch", () => launchLeg(k, page, base, workflow, fleet.repo, pass)],
        ["routine", () => routineLeg(k, page, base, project.id, routine)],
        ["forget", () => forgetLeg(k, page, base, project, say, pass)],
        [
          "caw off",
          () => cawOffLeg(k, page, base, fleet.base, cawProject, say, pass),
        ],
        ["config delete", () => configDeleteLeg(k, page, base, n, pass)],
        ["view keep", () => viewKeepLeg(k, page, base, project, pass)],
        [
          "interrupt",
          () => interruptLeg(k, page, base, chat, socket, fleet.send, pass),
        ],
        ["artifact menu", () => artifactMenuLeg(k, page, base, chat, pass, n)],
        ["catalogue", () => catalogueLeg(k, page, base, socket)],
        ["copy", () => copyLeg(k, page, base, chat, pass)],
        ["behind", () => behindLeg(k, page, base, chat, socket, fleet.send)],
      ];
      // What the page threw, said with a leg that did not run to its end.
      const thrown: string[] = [];
      page.on("pageerror", (error) => thrown.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          thrown.push(message.text());
        }
      });
      const only = process.env.WORK_OUTLIVES_LEGS?.split(",").filter(Boolean);
      for (const [name, leg] of legs) {
        if (only?.length && !only.includes(name)) {
          continue;
        }
        thrown.length = 0;
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one leg after another, on one page
          await leg();
        } catch (error) {
          k.check(
            `${name}: ran to its end`,
            false,
            `${String(error)} ${JSON.stringify({ url: page.url(), thrown: thrown.slice(-8) })}`
          );
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
