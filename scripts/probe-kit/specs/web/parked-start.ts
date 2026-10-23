/**
 * The New Session form's work outlives the form (DESIGN.md, The Work
 * Outlives Its Surface Rule; spawn/parked.svelte.ts, StartingRows). A
 * scratch fleet (real hub, agent and sessiond against the mock model), the
 * built dashboard at 1440, one page throughout. For each surface, New
 * session (the rail's Start session) and Continue in new session (a
 * session row's menu):
 *  1. a prompt typed and a file attached, then a reload: the form is open
 *     again with the same words and the same attachment chip (and, for
 *     Continue, the same source chip);
 *  2. Start held on the hub's side (the spawn verb held on the socket, the
 *     continue POST held on its route), Esc mid-start: the form shrinks into
 *     a row of its own (a WAAPI flight on the form ending at opacity 0), the
 *     row says the start is running (`data-state`, its stage words, the
 *     Working glyph breathing on the `breath` keyframes), then what it came
 *     to once the hub answers (started, and the session on the hub);
 *  3. a press on the running row brings the form back on the same start:
 *     the same words, Start pending with the stage;
 *  4. a refusal forced (a harness the hub doesn't run; a 409 on continue)
 *     and Esc: its words stand on the row (RowFault) and, after Reopen, on
 *     the form's line; no toast anywhere;
 *  and for Continue, a reload while its job runs (the source busy with a
 *  slow turn): the form is back open on it, Start pending with the job's
 *  stage, and it leaves for the new session when the job starts it.
 * And on a phone at 390 (touch, real taps), New session as the bottom
 * sheet: a reload with the sheet open reopens it with the same words and
 * chip; the sheet's own Close mid-start runs the drawer's exit
 * (`getAnimations()` on the sheet) and parks the start as a row on the
 * phone's home page, running, breathing, no toast; a tap on the row
 * reopens the sheet at the same step; the sheet swiped down from its
 * grabber past vaul's threshold (raw touch input) does the same as its
 * Close: the drawer's exit, the running row, no toast, a tap back to the
 * same step; a 40-word prompt's row keeps its
 * press and both its lines inside it; a refusal's words stand on the row
 * (RowFault) and Reopen brings the sheet back with them.
 *
 * And the swipe and the hold again on WebKit at 390, the finger and the
 * resting cursor synthesized as PointerEvents in the page (Playwright's
 * WebKit drives no touch drag): WebKit's engine running the patch's logic,
 * not an iOS finger.
 *
 * And the Project popover on a fresh browser (no machine chosen) with a
 * second machine in the fleet: every project on every machine where it has
 * a checkout, one row each named "<machine> · <path>"; a pick sets both
 * chips (the picks read from the tab's kept form); a machine chosen first
 * narrows the list to its own.
 *
 *   bun scripts/probe-kit/run.ts web parked-start
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import { join } from "node:path";
import type { Page } from "playwright-core";
import { commonWords } from "../../../../packages/core/src/words/common";
import { spawnWords } from "../../../../packages/core/src/words/spawn";
import { transcriptWords } from "../../../../packages/core/src/words/transcript";
import { MACHINE, type Reply, type Seen } from "../../../scratch-fleet";
import {
  handOn,
  type Kit,
  open,
  readMotion,
  type Spec,
  settle,
} from "../../kit";

/** The form on a desk: the popover. */
const DESK_FORM = "[data-ns-popover]";
/** The form on a phone: the kit's bottom sheet. */
const PHONE_FORM = "[data-session-card][data-vaul-drawer]";
/** The form the legs under way read: the desk's popover, then the phone's sheet. */
let FORM = DESK_FORM;
const RAIL_START = 'button[aria-label="Start session"]';
const PROMPT = () => `${FORM} [aria-label="First prompt"]`;
const START = () => `${FORM} #session-start`;
const ROW = "[data-parked]";
const TOAST = "[data-sonner-toast]";
const SOCKET = /\/ws\/dashboard/;
const CONTINUE_POST = /\/api\/instances\/[^/]+\/continue$/;
const FILE = "park-note.txt";
const BAD_HARNESS = "probe-no-such-harness";
const REFUSAL = "PROBE refusal: the source is busy elsewhere";
/** A spawn's stage words, as its row and Start say them. */
const SPAWN_STAGE = /Starting…|Checking the folder…/;
/** Any running stage: its words end in an ellipsis. */
const STAGE = /…$/;
/** A session's page. */
const ON_SESSION = /\/session\//;
/** A computed 2D transform's six numbers. */
const MATRIX = /matrix\(([^)]+)\)/;
/** The source session's tab. */
const SOURCE_TAB = /Park source/;
/** The source's turn the continuation waits on (the mock answers it slowly). */
const SLOW = "PROBE-PARK slow turn";
/** The fleet's second machine, for the Project popover's every-machine list. */
const SECOND = "probe-park-b";

/** What the page's socket and the continue route do to a start, set per leg. */
interface Hold {
  /** The continue POST: held this long, then refused with {@link REFUSAL} when `refuse`. */
  post: { ms: number; refuse: boolean };
  /** The spawn verb: held this long, then sent naming a harness the hub doesn't run when `refuse`. */
  spawn: { ms: number; refuse: boolean };
}

async function holding(page: Page): Promise<Hold> {
  const hold: Hold = {
    spawn: { ms: 0, refuse: false },
    post: { ms: 0, refuse: false },
  };
  await page.routeWebSocket(SOCKET, (ws) => {
    const hub = ws.connectToServer();
    ws.onMessage((frame) => {
      if (typeof frame !== "string" || !frame.includes('"verb":"spawn"')) {
        hub.send(frame);
        return;
      }
      const message = JSON.parse(frame) as {
        payload?: { harness?: string; options?: unknown };
      };
      // A fleet start (the source's) carries no `resume`; the form's do not
      // either, so the hold is the leg's, set only while it presses Start.
      if (hold.spawn.refuse && message.payload) {
        message.payload.harness = BAD_HARNESS;
      }
      const out = JSON.stringify(message);
      setTimeout(() => hub.send(out), hold.spawn.ms);
    });
  });
  await page.route(CONTINUE_POST, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const { ms, refuse } = hold.post;
    await new Promise((done) => setTimeout(done, ms));
    if (refuse) {
      await route.fulfill({
        status: 409,
        contentType: "text/plain",
        body: REFUSAL,
      });
      return;
    }
    await route.continue();
  });
  return hold;
}

/** The parked rows as drawn, read from the engine. */
const readRows = (page: Page) =>
  page.evaluate(
    ({ row, toast }) =>
      [...document.querySelectorAll<HTMLElement>(row)]
        .filter(
          (one) =>
            one.getClientRects().length > 0 &&
            getComputedStyle(one).visibility !== "hidden"
        )
        .map((one) => {
          const glyph = one.querySelector<SVGElement>("svg.breathe");
          return {
            id: one.dataset.parked ?? "",
            state: one.dataset.state ?? "",
            title:
              one.querySelector('[data-slot="title"]')?.textContent?.trim() ??
              "",
            doing:
              one.querySelector('[data-slot="doing"]')?.textContent?.trim() ??
              "",
            breath: glyph ? getComputedStyle(glyph).animationName : "",
            fault:
              one.querySelector("[data-parked-fault]")?.textContent?.trim() ??
              "",
            toasts: document.querySelectorAll(toast).length,
          };
        }),
    { row: ROW, toast: TOAST }
  );

/** The form as drawn: its prompt's words, its attachment chips, Start, its line. */
const readForm = (page: Page) =>
  page.evaluate((popover) => {
    const card = document.querySelector<HTMLElement>(popover);
    const start = card?.querySelector<HTMLButtonElement>("#session-start");
    return {
      open: Boolean(card && card.getClientRects().length > 0),
      prompt:
        card
          ?.querySelector('[aria-label="First prompt"]')
          ?.textContent?.trim() ?? "",
      chips: [...(card?.querySelectorAll('[data-slot="att-name"]') ?? [])].map(
        (one) => one.textContent?.trim() ?? ""
      ),
      source:
        card
          ?.querySelector(
            '[data-lead="continue-source"], [data-chip-key="continue-source"]'
          )
          ?.textContent?.trim() ?? null,
      head: card?.querySelector("h2")?.textContent?.trim() ?? "",
      busy: start?.getAttribute("aria-busy") === "true",
      startWords: start?.textContent?.trim() ?? "",
      reading:
        card?.querySelector('[data-slot="reading"]')?.textContent?.trim() ?? "",
      toasts: document.querySelectorAll("[data-sonner-toast]").length,
    };
  }, FORM);

/** Waits for the one parked row to stand in `state`. */
async function rowIn(page: Page, state: string, timeout = 60_000) {
  await page.waitForFunction(
    ({ row, want }) =>
      [...document.querySelectorAll<HTMLElement>(row)].some(
        (one) =>
          one.dataset.state === want &&
          one.getClientRects().length > 0 &&
          getComputedStyle(one).visibility !== "hidden"
      ),
    { row: ROW, want: state },
    { timeout }
  );
}

/**
 * Esc on a start in flight: the form's flight into its row is on the
 * engine (a WAAPI animation on the form ending at opacity 0 with a scale),
 * and the form leaves.
 */
async function escapeIntoRow(kit: Kit, page: Page, label: string) {
  // Its end read where it ends: held at fraction 1.
  const flight = await readMotion(
    page,
    () => page.keyboard.press("Escape"),
    FORM,
    {
      fractions: [1],
      read: () =>
        page.evaluate((popover) => {
          const card = document.querySelector<HTMLElement>(popover);
          const style = card ? getComputedStyle(card) : null;
          return {
            opacity: style?.opacity ?? "",
            transform: style?.transform ?? "",
          };
        }, FORM),
    }
  );
  /** Whether a computed transform scales (a matrix whose x scale is not 1). */
  const scales = (transform: string) => {
    const x = Number(transform.match(MATRIX)?.[1].split(",")[0]);
    return Number.isFinite(x) && Math.abs(x - 1) > 0.01;
  };
  const flew =
    flight.runs.length > 0 &&
    flight.at.some(
      ({ value }) => value.opacity === "0" && scales(value.transform)
    );
  kit.check(
    `${label}: Esc mid-start closes the form into its row (a flight on the form to the row's box, fading out; read by ${flight.by})`,
    flew,
    JSON.stringify(flight)
  );
  await page.waitForSelector(FORM, { state: "detached", timeout: 15_000 });
}

/** Types `words` into the open form's prompt and attaches the probe's file. */
async function fill(page: Page, words: string) {
  await page.locator(PROMPT()).click();
  await page.keyboard.type(words);
  await page
    .locator(`${FORM} input[type="file"]`)
    .first()
    .setInputFiles({
      name: FILE,
      mimeType: "text/plain",
      buffer: Buffer.from("A note that rides the first prompt.\n"),
    });
  await page.waitForFunction(
    ({ popover, file }) =>
      [...document.querySelectorAll(`${popover} [data-slot="att-name"]`)].some(
        (one) => one.textContent?.includes(file)
      ),
    { popover: FORM, file: FILE },
    { timeout: 30_000 }
  );
  // The draft store's write rests 250ms (keep-draft).
  await page.waitForTimeout(800);
}

/** A permission mode picked, when the form waits for one. */
async function pickMode(page: Page) {
  const chip = page.locator(`${FORM} [aria-label^="Permission mode"]`).first();
  if ((await chip.textContent())?.trim() !== spawnWords.unchosenMode) {
    return;
  }
  await chip.click();
  const choice = page
    .locator('[data-perm="acceptEdits"]')
    .filter({ visible: true })
    .first();
  await choice.waitFor({ state: "visible", timeout: 10_000 });
  await choice.click();
}

/** Start pressed, and the form pending on it. */
async function pressStart(page: Page) {
  await page.waitForFunction(
    (start) =>
      document.querySelector<HTMLButtonElement>(start)?.disabled === false,
    START(),
    { timeout: 60_000 }
  );
  await (FORM === PHONE_FORM
    ? page.locator(START()).tap()
    : page.locator(START()).click());
  await page.waitForFunction(
    (start) =>
      document.querySelector(start)?.getAttribute("aria-busy") === "true",
    START(),
    { timeout: 10_000 }
  );
}

async function newSessionLegs(
  kit: Kit,
  page: Page,
  hold: Hold,
  instances: () => string[],
  spawnLink: string
) {
  const openNew = () => openSpawnLink(page, spawnLink);
  const label = commonWords.newSession;
  // 1. Typed, attached, reloaded: the same form.
  await openNew();
  const words = "PROBE-PARK first prompt kept";
  await fill(page, words);
  await pickMode(page);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (prompt) => (document.querySelector(prompt)?.textContent ?? "").length > 0,
    PROMPT(),
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const reloaded = await readForm(page);
  kit.check(
    `${label}: a reload opens the form again with the same words and the same attachment chip`,
    reloaded.open &&
      reloaded.prompt === words &&
      reloaded.chips.some((chip) => chip.includes(FILE)),
    JSON.stringify(reloaded)
  );

  // 2. Esc mid-start: the row, live, then started.
  const before = new Set(instances());
  hold.spawn = { ms: 6000, refuse: false };
  await pressStart(page);
  await escapeIntoRow(kit, page, label);
  await rowIn(page, "running", 10_000);
  await settle(page, 200);
  const [live] = await readRows(page);
  kit.check(
    `${label}: the parked row says the start runs: data-state running, its stage, the Working glyph on the breath keyframes`,
    live?.state === "running" &&
      SPAWN_STAGE.test(live.doing) &&
      live.breath.includes("breath") &&
      live.title === words,
    JSON.stringify(live)
  );

  // 3. A press on the running row: the form back on the same start.
  await page.locator(`${ROW} [data-parked-row]`).first().click();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const back = await readForm(page);
  const hidden = await readRows(page);
  kit.check(
    `${label}: a press on the row brings the form back at the same step: the same words and chip, Start pending with its stage, the row standing aside`,
    back.open &&
      back.prompt === words &&
      back.chips.some((chip) => chip.includes(FILE)) &&
      back.busy &&
      SPAWN_STAGE.test(back.startWords) &&
      hidden.length === 0,
    JSON.stringify({ back, rows: hidden })
  );
  await escapeIntoRow(kit, page, `${label} (again)`);
  await rowIn(page, "started", 60_000);
  const [done] = await readRows(page);
  const made = instances().filter((id) => !before.has(id));
  kit.check(
    `${label}: once the hub answers, the row says it started, and the session is on the hub; no toast`,
    done?.state === "started" &&
      done.doing.includes("Started on") &&
      made.length === 1 &&
      done.toasts === 0,
    JSON.stringify({ done, made })
  );
  // Its outcome opens the session it started, and the row goes.
  await page.locator(`${ROW} [data-parked-row]`).first().click();
  await page.waitForURL(ON_SESSION, { timeout: 15_000 });
  await page.waitForFunction(
    (row) =>
      [...document.querySelectorAll<HTMLElement>(row)].every(
        (one) => one.dataset.shown !== undefined
      ),
    ROW,
    { timeout: 10_000 }
  );
  kit.check(
    `${label}: a press on the started row opens its session, and the row goes`,
    page.url().includes(made[0] ?? "\u0000") ||
      (await page.evaluate(() => location.pathname.startsWith("/session/"))),
    page.url()
  );

  // 4. A refusal: its words on the row and, reopened, in the form; no toast.
  await openNew();
  await page.locator(PROMPT()).click();
  await page.keyboard.type("PROBE-PARK refused");
  await pickMode(page);
  hold.spawn = { ms: 2500, refuse: true };
  await pressStart(page);
  await escapeIntoRow(kit, page, `${label} (refused)`);
  await rowIn(page, "failed", 30_000);
  hold.spawn = { ms: 0, refuse: false };
  const [refused] = await readRows(page);
  kit.check(
    `${label}: the hub's refusal stands on the row in its words (RowFault), no toast`,
    refused?.state === "failed" &&
      refused.fault.includes(BAD_HARNESS) &&
      refused.toasts === 0,
    JSON.stringify(refused)
  );
  await page
    .locator(`${ROW} [data-parked-fault] button`, { hasText: "Reopen" })
    .first()
    .click();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const reopened = await readForm(page);
  kit.check(
    `${label}: Reopen opens the form on it, the refusal's words on its line, the prompt as it was, no toast`,
    reopened.reading.includes(BAD_HARNESS) &&
      reopened.prompt === "PROBE-PARK refused" &&
      !reopened.busy &&
      reopened.toasts === 0,
    JSON.stringify(reopened)
  );
  // Cancel is the form's own end: the start and its row go.
  await page
    .locator(`${FORM} [data-ns-footer] button`, { hasText: "Cancel" })
    .click();
  await page.waitForSelector(FORM, { state: "detached", timeout: 15_000 });
  kit.check(
    `${label}: Cancel drops the failed start: no row stands`,
    (await readRows(page)).length === 0
  );
}

/** Opens Continue in new session on the source from its open tab's menu. */
async function openContinue(page: Page, sourceUrl: string) {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
  const tab = page
    .getByRole("tab", { name: SOURCE_TAB })
    .filter({ visible: true })
    .first();
  await tab.waitFor({ state: "visible", timeout: 60_000 });
  await tab.click({ button: "right" });
  const item = page
    .getByRole("menuitem", { name: transcriptWords.continueInNew })
    .first();
  await item.waitFor({ state: "visible", timeout: 10_000 });
  await item.click();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
}

async function continueLegs(
  kit: Kit,
  page: Page,
  hold: Hold,
  fleet: { send: (id: string, text: string) => Promise<string> },
  source: string,
  instances: () => string[],
  sourceUrl: string
) {
  const label = "Continue";
  // 1. Typed, attached, reloaded: the same continuation form.
  await openContinue(page, sourceUrl);
  const words = "PROBE-PARK next step kept";
  await fill(page, words);
  await pickMode(page);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (prompt) =>
      (document.querySelector(prompt)?.textContent ?? "").includes("PROBE"),
    PROMPT(),
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const reloaded = await readForm(page);
  kit.check(
    `${label}: a reload opens the continuation form again, on the same source, with the same words and chip`,
    reloaded.open &&
      reloaded.head === spawnWords.continueSession &&
      reloaded.prompt.includes(words) &&
      reloaded.chips.some((chip) => chip.includes(FILE)),
    JSON.stringify(reloaded)
  );

  // 2. Esc mid-start: the row live while the hub's answer is held, then started.
  const before = new Set(instances());
  hold.post = { ms: 4000, refuse: false };
  await pressStart(page);
  await escapeIntoRow(kit, page, label);
  await rowIn(page, "running", 10_000);
  await settle(page, 200);
  const [live] = await readRows(page);
  kit.check(
    `${label}: the parked row says the continuation runs, in its stage, the Working glyph breathing`,
    live?.state === "running" &&
      STAGE.test(live.doing) &&
      live.breath.includes("breath"),
    JSON.stringify(live)
  );
  // 3. Back into the form on it.
  await page.locator(`${ROW} [data-parked-row]`).first().click();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const back = await readForm(page);
  kit.check(
    `${label}: a press on the row brings the form back on the running continuation: its words, Start pending with its stage`,
    back.open &&
      back.head === spawnWords.continueSession &&
      back.prompt.includes(words) &&
      back.busy &&
      STAGE.test(back.startWords),
    JSON.stringify(back)
  );
  await escapeIntoRow(kit, page, `${label} (again)`);
  await rowIn(page, "started", 90_000);
  const [done] = await readRows(page);
  kit.check(
    `${label}: the row says it started once the hub's job has, and a session is new on the hub; no toast`,
    done?.state === "started" &&
      instances().some((id) => !before.has(id)) &&
      done.toasts === 0,
    JSON.stringify(done)
  );
  await page.locator(`${ROW} [data-parked-dismiss]`).first().click();
  await page.waitForFunction(
    (row) =>
      [...document.querySelectorAll<HTMLElement>(row)].every(
        (one) => one.dataset.shown !== undefined
      ),
    ROW,
    { timeout: 10_000 }
  );
  hold.post = { ms: 0, refuse: false };

  // A reload while the job runs: the form back on it, then the session.
  await fleet.send(source, SLOW);
  await page.waitForTimeout(1500);
  await openContinue(page, sourceUrl);
  await page.locator(PROMPT()).click();
  await page.keyboard.type("PROBE-PARK across a reload");
  await pickMode(page);
  await pressStart(page);
  await page.waitForFunction(
    () =>
      (sessionStorage.getItem("cawco:parked-starts") ?? "").includes('"job"'),
    undefined,
    { timeout: 30_000 }
  );
  const beforeReload = new Set(instances());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
  await settle(page, 300);
  const held = await readForm(page);
  kit.check(
    `${label}: a reload while its job runs opens the form again on it, Start pending with the job's stage`,
    held.open && held.busy && STAGE.test(held.startWords),
    JSON.stringify(held)
  );
  await page
    .waitForURL(
      (url) => {
        const id = url.pathname.split("/session/")[1] ?? "";
        return id !== "" && !beforeReload.has(id) && id !== source;
      },
      { timeout: 120_000 }
    )
    .then(
      () =>
        kit.check(
          `${label}: when the job starts the session, the form leaves for it`,
          true
        ),
      () =>
        kit.check(
          `${label}: when the job starts the session, the form leaves for it`,
          false,
          page.url()
        )
    );

  // 4. A refusal: on the row and in the form.
  await openContinue(page, sourceUrl);
  await page.locator(PROMPT()).click();
  await page.keyboard.type("PROBE-PARK refused continue");
  await pickMode(page);
  hold.post = { ms: 2500, refuse: true };
  await pressStart(page);
  await escapeIntoRow(kit, page, `${label} (refused)`);
  await rowIn(page, "failed", 30_000);
  hold.post = { ms: 0, refuse: false };
  const [refused] = await readRows(page);
  kit.check(
    `${label}: the hub's refusal stands on the row in its words, no toast`,
    refused?.state === "failed" &&
      refused.fault.includes(REFUSAL) &&
      refused.toasts === 0,
    JSON.stringify(refused)
  );
  await page
    .locator(`${ROW} [data-parked-fault] button`, { hasText: "Reopen" })
    .first()
    .click();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const reopened = await readForm(page);
  kit.check(
    `${label}: Reopen opens the continuation form on it, the refusal's words on its line, no toast`,
    reopened.head === spawnWords.continueSession &&
      reopened.reading.includes(REFUSAL) &&
      reopened.prompt.includes("PROBE-PARK refused continue") &&
      reopened.toasts === 0,
    JSON.stringify(reopened)
  );
}

/** The form opened on the fleet's machine and folder, as "Spawn here" opens it. */
async function openSpawnLink(page: Page, spawnLink: string) {
  await page.goto(spawnLink, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(() => !location.search.includes("spawn="), null, {
    timeout: 15_000,
  });
}

/**
 * The drawer's exit `action` starts: a run of some length on the sheet
 * itself (`drawer-content`, the kit's DrawerContent) that plays to its
 * end, read as the kit reads motion (kit.ts `readMotion`).
 */
async function sheetExit(page: Page, action: () => Promise<unknown>) {
  const read = await readMotion(page, action, PHONE_FORM);
  return {
    by: read.by,
    runs: read.runs,
    ran: read.runs.some(
      (run) => run.target === "div[drawer-content]" && run.ended
    ),
  };
}

/**
 * The sheet closed by its own Close mid-start: the drawer's exit runs on the
 * sheet (an animation on it, read from the engine), and the sheet leaves.
 */
async function closeSheet(kit: Kit, page: Page, label: string) {
  const exit = await sheetExit(page, () =>
    page
      .locator(`${PHONE_FORM} button[aria-label="Close"]`)
      .filter({ visible: true })
      .first()
      .tap()
  );
  kit.check(
    `${label}: the sheet's Close mid-start runs the drawer's exit on the sheet (read by ${exit.by})`,
    exit.ran,
    JSON.stringify(exit.runs)
  );
  await page.waitForSelector(PHONE_FORM, {
    state: "detached",
    timeout: 15_000,
  });
}

/**
 * The sheet swiped away mid-start, as a finger does it: a touch on its
 * grabber drawn down past vaul's close threshold, a move a frame, then let
 * go (raw touch input, as decision-pick drags). The drawer's exit runs on
 * the sheet (read from the engine), and the sheet leaves.
 *
 * A cursor rests on the sheet's path meanwhile and moves once mid-swipe, as
 * an iPad's trackpad or a touch laptop's does: the sheet slides under it
 * (Chromium's mouse `pointerout` as it does), and its move lands on the
 * sheet. Neither is the finger's, and neither moves or ends the drag
 * (patches/vaul-svelte, the pressing pointer's drag).
 */
async function swipeSheet(kit: Kit, page: Page, label: string) {
  const grab = await page.evaluate((sheet) => {
    const card = document.querySelector<HTMLElement>(sheet);
    const grabber = card?.querySelector('[data-slot="drawer-grabber"]');
    if (!(card && grabber)) {
      return null;
    }
    const at = grabber.getBoundingClientRect();
    return {
      x: at.left + at.width / 2,
      y: at.top + at.height / 2,
      height: card.getBoundingClientRect().height,
    };
  }, PHONE_FORM);
  kit.check(`${label}: the sheet has its grabber to swipe`, grab !== null);
  if (!grab) {
    return;
  }
  const hand = await handOn(page);
  kit.note(`${label}: the finger's pointer capture: ${hand.capture}`);
  // Every frame from the touch's start, read in the page itself: whether
  // the sheet is drawn, its state, its running animations and transform,
  // the body's lock; and each pointer event, as vaul hears them.
  await page.evaluate((sheet) => {
    const log: unknown[] = [];
    (window as unknown as { swipeLog: unknown[] }).swipeLog = log;
    const started = performance.now();
    const now = () => Math.round(performance.now() - started);
    const name = (node: EventTarget | null): string | null => {
      if (!(node instanceof Element)) {
        return null;
      }
      const slot = node.getAttribute("data-slot");
      return `${node.tagName.toLowerCase()}${slot ? `[${slot}]` : ""}`;
    };
    // Where a pointer event came from: its target and the one it went to,
    // whether that is in the sheet, whether it holds the pointer, and where
    // the sheet stood.
    const told = (pointer: PointerEvent) => {
      const card = document.querySelector<HTMLElement>(sheet);
      const { target } = pointer;
      return {
        kind: pointer.pointerType,
        target: name(target),
        to: name(pointer.relatedTarget),
        onSheet: target instanceof Node && (card?.contains(target) ?? false),
        captured:
          target instanceof Element &&
          target.hasPointerCapture(pointer.pointerId),
        y: pointer.clientY,
        sheet: card ? getComputedStyle(card).transform : null,
      };
    };
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "pointerout",
      "gotpointercapture",
      "lostpointercapture",
      "touchend",
      "touchcancel",
    ]) {
      window.addEventListener(
        type,
        (event) => {
          // The finger's own moves are the drag; only another pointer's
          // move is told.
          const pointer = event instanceof PointerEvent ? event : null;
          if (type === "pointermove" && pointer?.pointerType === "touch") {
            return;
          }
          log.push({
            at: now(),
            event: type,
            ...(pointer ? told(pointer) : {}),
          });
        },
        { capture: true }
      );
    }
    let gone = 0;
    const read = () => {
      const card = document.querySelector<HTMLElement>(sheet);
      log.push({
        at: now(),
        drawn: card !== null,
        state: card?.dataset.state ?? null,
        transform: card ? getComputedStyle(card).transform : null,
        body: document.body.style.pointerEvents || null,
        drawer: document.body.dataset.drawer ?? null,
      });
      gone = card ? 0 : gone + 1;
      if (gone < 10 && performance.now() - started < 4000) {
        requestAnimationFrame(read);
      }
    };
    requestAnimationFrame(read);
  }, PHONE_FORM);
  const steps = 16;
  const distance = grab.height * 0.6;
  const cursor = { x: grab.x, y: grab.y + 150 };
  await hand.cursor(cursor.x, cursor.y);
  await hand.down(grab.x, grab.y);
  for (let step = 1; step <= steps; step += 1) {
    await hand.move(grab.x, grab.y + (distance * step) / steps);
    // The finger slips off the 6px grabber as it first moves, where the
    // engine's own touch says so (huntabyte/vaul-svelte#123).
    if (step === 1) {
      await hand.leave?.();
    }
    // Halfway, the cursor moves onto the sheet's body where it stands now,
    // well below the finger. Three quarters in, it leaves the sheet for the
    // screen's top, over the overlay: a mouse `pointerout` from the sheet
    // every engine sends (a cursor resting while the sheet slides under it
    // is said only when the engine next updates its hover, which Chromium
    // did mid-swipe on one run and only after the touch ended on another).
    if (step === steps / 2) {
      await hand.cursor(cursor.x + 24, grab.y + distance / 2 + 150);
    }
    if (step === (steps * 3) / 4) {
      await hand.cursor(cursor.x + 24, 8);
    }
    await page.waitForTimeout(16);
    // Where the sheet stands after each step, read here: an engine whose
    // frames come seldom (headless WebKit) still has every step read.
    await page.evaluate((sheet) => {
      const card = document.querySelector<HTMLElement>(sheet);
      (window as unknown as { swipeLog: unknown[] }).swipeLog.push({
        event: "probe: step",
        state: card?.dataset.state ?? null,
        transform: card ? getComputedStyle(card).transform : null,
      });
    }, PHONE_FORM);
  }
  await page.evaluate(() => {
    (window as unknown as { swipeLog: unknown[] }).swipeLog.push({
      event: "probe: release",
    });
  });
  // The exit the finger's lift starts, read as the kit reads motion.
  const exit = await sheetExit(page, () => hand.up());
  await page.waitForSelector(PHONE_FORM, {
    state: "detached",
    timeout: 15_000,
  });
  await page.waitForTimeout(400);
  const log = (await page.evaluate(
    () => (window as unknown as { swipeLog: unknown[] }).swipeLog
  )) as {
    drawn?: boolean;
    event?: string;
    kind?: string;
    onSheet?: boolean;
    sheet?: string | null;
    state?: string | null;
    transform?: string | null;
  }[];
  // The exit leaves from where the finger left the sheet: its first closed
  // frame stands no higher than its last dragged one (no jump back up).
  const lift = (frame: { transform?: string | null } | undefined): number => {
    const parts = frame?.transform?.match(MATRIX)?.[1].split(",");
    return parts ? Number(parts[5]) : 0;
  };
  const lastOpen = log.filter((frame) => frame.state === "open").at(-1);
  const firstClosed = log.find((frame) => frame.state === "closed");
  kit.check(
    `${label}: the swiped sheet's exit leaves from where it was dragged to, not from the top (translateY ${lift(lastOpen)} → ${lift(firstClosed)})`,
    lift(lastOpen) > 0 && lift(firstClosed) >= lift(lastOpen) - 1
  );
  // The sheet follows the finger until it lifts: the resting cursor's
  // `pointerout` as the sheet slides under it, and its move over the sheet,
  // neither move nor end the finger's drag (patches/vaul-svelte).
  const released = log.findIndex((frame) => frame.event === "probe: release");
  const held = log.slice(0, released);
  const cursorOuts = held.filter(
    (frame) => frame.event === "pointerout" && frame.kind === "mouse"
  ).length;
  const cursorMoves = held.filter(
    (frame) =>
      frame.event === "pointermove" &&
      frame.kind === "mouse" &&
      frame.onSheet === true &&
      lift(frame.sheet === undefined ? undefined : { transform: frame.sheet }) >
        0
  ).length;
  const fingerOuts = held.filter(
    (frame) => frame.event === "pointerout" && frame.kind === "touch"
  ).length;
  const heldAt = held
    .filter((frame) => frame.state !== undefined)
    .map((frame) => lift(frame));
  const lastHeld = held.filter((frame) => frame.state !== undefined).at(-1);
  kit.check(
    `${label}: the sheet follows the finger until it lifts, the finger's ${fingerOuts} touch pointerout(s) and a resting cursor's ${cursorOuts} pointerout(s) and ${cursorMoves} move(s) on the dragged sheet ending and moving nothing: no closed frame before the release, never a step back, and it stood at the finger's travel when it lifted (translateY ${lift(lastHeld)} of ${Math.round(distance)}px)`,
    released > 0 &&
      (fingerOuts > 0 || hand.leave === undefined) &&
      cursorOuts > 0 &&
      cursorMoves > 0 &&
      held.every((frame) => frame.state !== "closed") &&
      heldAt.every((y, at) => at === 0 || y >= heldAt[at - 1] - 1) &&
      lift(lastHeld) >= distance * 0.95,
    JSON.stringify(heldAt)
  );
  kit.check(
    `${label}: swiped down past its threshold mid-start, the sheet runs the drawer's exit (read by ${exit.by})`,
    exit.ran,
    JSON.stringify({
      exit: exit.runs,
      log: log.filter(
        (frame, at) =>
          frame.event !== undefined ||
          at === 0 ||
          JSON.stringify({ ...frame, at: 0 }) !==
            JSON.stringify({ ...log[at - 1], at: 0 })
      ),
    })
  );
  await hand.done();
}

/**
 * A finger holding the sheet partway down while the visible area changes
 * under it (the window shrinks, as the keyboard steps the visible area): the
 * sheet stays where the finger holds it, its transform untouched, and its
 * --visible-height follows the new area (ui/drawer hold-style). A slow drag
 * from the grabber, held; the events the sheet hears are logged, so a
 * `pointerout` that ends the drag early is named.
 */
async function holdThroughResize(kit: Kit, page: Page, label: string) {
  // vaul takes no drag in the half second after a sheet opens
  // (use-drawer-root `shouldDrag`, "Allow scrolling when animating").
  await page.waitForTimeout(700);
  // Held by its 6px grabber, touch alone: the cursor the probe's presses
  // left stands above the sheet, at the screen's top, so nothing but the
  // finger is over it (the swipe leg is the one with a cursor on the sheet).
  const grab = await page.evaluate((sheet) => {
    const grabber = document
      .querySelector(sheet)
      ?.querySelector('[data-slot="drawer-grabber"]');
    if (!grabber) {
      return null;
    }
    const at = grabber.getBoundingClientRect();
    return { x: at.left + at.width / 2, y: at.top + at.height / 2 };
  }, PHONE_FORM);
  if (!grab) {
    kit.check(`${label}: the sheet has its grabber to hold`, false);
    return;
  }
  const hand = await handOn(page);
  await hand.cursor(grab.x, 1);
  await page.evaluate(() => {
    const heard: string[] = [];
    (window as unknown as { heard: string[] }).heard = heard;
    for (const type of [
      "pointerout",
      "lostpointercapture",
      "pointercancel",
      "pointerup",
    ]) {
      window.addEventListener(
        type,
        (event) =>
          heard.push(
            event instanceof PointerEvent
              ? `${type}:${event.pointerType}`
              : type
          ),
        { capture: true }
      );
    }
  });
  /** The sheet's translateY, its --visible-height, and its state. */
  const read = () =>
    page.evaluate((sheet) => {
      const card = document.querySelector<HTMLElement>(sheet);
      const matrix = card ? getComputedStyle(card).transform : "none";
      const parts = matrix.startsWith("matrix(")
        ? matrix.slice(7, -1).split(",")
        : [];
      return {
        y: parts.length === 6 ? Number(parts[5]) : 0,
        visibleHeight: card?.style.getPropertyValue("--visible-height") ?? "",
        state: card?.dataset.state ?? null,
        heard: [...(window as unknown as { heard: string[] }).heard],
        // What the engine says its viewports are (visible-viewport measures
        // the lesser of the visual viewport and the layout's height).
        viewport: {
          inner: window.innerHeight,
          visual: window.visualViewport?.height ?? null,
          layout: document.documentElement.clientHeight,
        },
      };
    }, PHONE_FORM);
  await hand.down(grab.x, grab.y);
  for (let step = 1; step <= 12; step += 1) {
    await hand.move(grab.x, grab.y + step * 8);
    if (step === 1) {
      await hand.leave?.();
    }
    await page.waitForTimeout(40);
  }
  await settle(page, 100);
  const before = await read();
  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForTimeout(300);
  const after = await read();
  kit.check(
    `${label}: held partway down, the sheet keeps its transform while the visible area changes under it, and its --visible-height follows (translateY ${before.y} → ${after.y}; --visible-height ${before.visibleHeight} → ${after.visibleHeight})`,
    before.state === "open" &&
      after.state === "open" &&
      before.y > 40 &&
      Math.abs(after.y - before.y) <= 1 &&
      before.visibleHeight !== after.visibleHeight &&
      after.visibleHeight === "700px",
    JSON.stringify({ before, after })
  );
  kit.note(
    `${label}: the events the sheet heard while the finger held it: ${JSON.stringify(after.heard)}`
  );
  await hand.up();
  await hand.done();
  await page.setViewportSize({ width: 390, height: 844 });
  await settle(page, 400);
}

/** Whether the visible parked rows stand on the phone's home page. */
const onHomePage = (page: Page) =>
  page.evaluate((row) => {
    const shown = [...document.querySelectorAll<HTMLElement>(row)].filter(
      (one) => one.getClientRects().length > 0
    );
    return (
      shown.length > 0 &&
      shown.every((one) => one.closest('[data-home-variant="page"]') !== null)
    );
  }, ROW);

/** A visible parked row's boxes at 390: the row, its press, its two lines. */
const readFit = (page: Page) =>
  page.evaluate((row) => {
    const li = [...document.querySelectorAll<HTMLElement>(row)].find(
      (one) => one.getClientRects().length > 0
    );
    const measure = (el: Element | null | undefined) => {
      if (!el) {
        return null;
      }
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        left: box.left,
        right: box.right,
        overflowX: style.overflowX,
        textOverflow: style.textOverflow,
      };
    };
    return {
      viewport: innerWidth,
      li: measure(li),
      press: measure(li?.querySelector("[data-parked-row]")),
      title: measure(li?.querySelector('[data-slot="title"]')),
      doing: measure(li?.querySelector('[data-slot="doing"]')),
      titleText:
        li?.querySelector('[data-slot="title"]')?.textContent?.trim() ?? "",
    };
  }, ROW);

/** Taps the one visible parked row's own press. */
const tapRow = (page: Page) =>
  page
    .locator(`${ROW} [data-parked-row]`)
    .filter({ visible: true })
    .first()
    .tap();

async function phoneLegs(
  kit: Kit,
  page: Page,
  hold: Hold,
  instances: () => string[],
  spawnLink: string
) {
  FORM = PHONE_FORM;
  const label = "Phone 390";
  // 3. A reload with the sheet open: the same words and chip.
  await openSpawnLink(page, spawnLink);
  const words = "PROBE-PARK phone prompt kept";
  await fill(page, words);
  await pickMode(page);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(FORM, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (prompt) => (document.querySelector(prompt)?.textContent ?? "").length > 0,
    PROMPT(),
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const reloaded = await readForm(page);
  kit.check(
    `${label}: a reload with the sheet open reopens the sheet with the same words and the same attachment chip`,
    reloaded.open &&
      reloaded.prompt === words &&
      reloaded.chips.some((chip) => chip.includes(FILE)),
    JSON.stringify(reloaded)
  );

  // 1. The sheet closed mid-start: the start parks as a row on the home page.
  const before = new Set(instances());
  hold.spawn = { ms: 6000, refuse: false };
  await pressStart(page);
  await closeSheet(kit, page, label);
  await rowIn(page, "running", 10_000);
  await settle(page, 200);
  const [live] = await readRows(page);
  kit.check(
    `${label}: the parked row stands on the phone's home page, running, its stage, the Working glyph on the breath keyframes, no toast`,
    (await onHomePage(page)) &&
      live?.state === "running" &&
      SPAWN_STAGE.test(live.doing) &&
      live.breath.includes("breath") &&
      live.title === words &&
      live.toasts === 0,
    JSON.stringify(live)
  );

  // 2. A tap on the row: the sheet back at the same step.
  await tapRow(page);
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const back = await readForm(page);
  kit.check(
    `${label}: a tap on the row reopens the sheet at the same step: the same words and chip, Start pending with its stage`,
    back.open &&
      back.prompt === words &&
      back.chips.some((chip) => chip.includes(FILE)) &&
      back.busy &&
      SPAWN_STAGE.test(back.startWords),
    JSON.stringify(back)
  );
  await closeSheet(kit, page, `${label} (again)`);
  await rowIn(page, "started", 60_000);
  const [done] = await readRows(page);
  kit.check(
    `${label}: the row says it started once the hub answers, the session on the hub, no toast`,
    done?.state === "started" &&
      done.doing.includes("Started on") &&
      instances().some((id) => !before.has(id)) &&
      done.toasts === 0,
    JSON.stringify(done)
  );
  await page
    .locator(`${ROW} [data-parked-dismiss]`)
    .filter({ visible: true })
    .first()
    .tap();

  // The sheet swiped down mid-start: it parks the start as its Close does.
  await openSpawnLink(page, spawnLink);
  const swipedWords = "PROBE-PARK phone swiped away";
  await page.locator(PROMPT()).click();
  await page.keyboard.type(swipedWords);
  await pickMode(page);
  const beforeSwipe = new Set(instances());
  hold.spawn = { ms: 8000, refuse: false };
  await pressStart(page);
  await swipeSheet(kit, page, `${label} (swipe)`);
  await rowIn(page, "running", 10_000);
  await settle(page, 200);
  const [swipedRow] = await readRows(page);
  kit.check(
    `${label} (swipe): the start parks as a running row on the phone's home page, its stage, the Working glyph on the breath keyframes, no toast`,
    (await onHomePage(page)) &&
      swipedRow?.state === "running" &&
      SPAWN_STAGE.test(swipedRow.doing) &&
      swipedRow.breath.includes("breath") &&
      swipedRow.title === swipedWords &&
      swipedRow.toasts === 0,
    JSON.stringify(swipedRow)
  );
  await tapRow(page);
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const swipedBack = await readForm(page);
  kit.check(
    `${label} (swipe): a tap on the row brings the sheet back at the same step: the same words, Start pending with its stage, no toast`,
    swipedBack.open &&
      swipedBack.prompt === swipedWords &&
      swipedBack.busy &&
      SPAWN_STAGE.test(swipedBack.startWords) &&
      swipedBack.toasts === 0,
    JSON.stringify(swipedBack)
  );
  await closeSheet(kit, page, `${label} (swipe, then Close)`);
  await rowIn(page, "started", 60_000);
  kit.check(
    `${label} (swipe): the swiped start goes on to start its session on the hub`,
    instances().some((id) => !beforeSwipe.has(id))
  );
  await page
    .locator(`${ROW} [data-parked-dismiss]`)
    .filter({ visible: true })
    .first()
    .tap();

  // The visible area changing under a finger holding the sheet.
  await openSpawnLink(page, spawnLink);
  await holdThroughResize(kit, page, `${label} (held through a resize)`);
  await page
    .locator(`${PHONE_FORM} button[aria-label="Close"]`)
    .filter({ visible: true })
    .first()
    .tap();
  await page.waitForSelector(PHONE_FORM, {
    state: "detached",
    timeout: 15_000,
  });

  // 5. Overflow at 390: a 40-word prompt as the title.
  await openSpawnLink(page, spawnLink);
  const long = Array.from(
    { length: 40 },
    (_, at) => `word${at + 1}-PROBE-PARK`
  ).join(" ");
  await page.locator(PROMPT()).click();
  await page.keyboard.type(long);
  await pickMode(page);
  hold.spawn = { ms: 6000, refuse: false };
  await pressStart(page);
  await closeSheet(kit, page, `${label} (40 words)`);
  await rowIn(page, "running", 10_000);
  await settle(page, 300);
  const fit = await readFit(page);
  type Fit = NonNullable<typeof fit.li>;
  const row = fit.li;
  /** A box that keeps to the row: no wider than its own box, inside the row's. */
  const fits = (box: Fit | null) =>
    box !== null &&
    row !== null &&
    box.scrollWidth <= box.clientWidth &&
    box.left >= row.left - 0.5 &&
    box.right <= row.right + 0.5;
  /**
   * A line of text that keeps to the row: its box inside the row's, and
   * what runs past it clipped behind an ellipsis, drawn nowhere. (A line cut
   * by `text-overflow: ellipsis` reports its whole text in `scrollWidth`.)
   */
  const clipped = (box: Fit | null) =>
    box !== null &&
    row !== null &&
    box.left >= row.left - 0.5 &&
    box.right <= row.right + 0.5 &&
    (box.scrollWidth <= box.clientWidth ||
      ((box.overflowX === "clip" || box.overflowX === "hidden") &&
        box.textOverflow === "ellipsis"));
  kit.check(
    `${label}: with a 40-word prompt as its title, the row and its press keep scrollWidth <= clientWidth inside the viewport, and both lines stay inside the row, what runs past clipped behind an ellipsis`,
    fits(row) &&
      (row?.right ?? Number.POSITIVE_INFINITY) <= fit.viewport &&
      fits(fit.press) &&
      clipped(fit.title) &&
      clipped(fit.doing) &&
      fit.titleText.startsWith("word1-PROBE-PARK"),
    JSON.stringify(fit)
  );
  await rowIn(page, "started", 60_000);
  await page
    .locator(`${ROW} [data-parked-dismiss]`)
    .filter({ visible: true })
    .first()
    .tap();

  // 4. A refusal: the hub's words on the phone's row, and Reopen.
  await openSpawnLink(page, spawnLink);
  await page.locator(PROMPT()).click();
  await page.keyboard.type("PROBE-PARK phone refused");
  await pickMode(page);
  hold.spawn = { ms: 2500, refuse: true };
  await pressStart(page);
  await closeSheet(kit, page, `${label} (refused)`);
  await rowIn(page, "failed", 30_000);
  hold.spawn = { ms: 0, refuse: false };
  const [refused] = await readRows(page);
  kit.check(
    `${label}: the hub's refusal stands on the phone's row in its words (RowFault), no toast`,
    (await onHomePage(page)) &&
      refused?.state === "failed" &&
      refused.fault.includes(BAD_HARNESS) &&
      refused.toasts === 0,
    JSON.stringify(refused)
  );
  await page
    .locator(`${ROW} [data-parked-fault] button`, { hasText: "Reopen" })
    .filter({ visible: true })
    .first()
    .tap();
  await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const reopened = await readForm(page);
  kit.check(
    `${label}: Reopen reopens the sheet on it, the refusal's words on its line, the prompt as it was, no toast`,
    reopened.reading.includes(BAD_HARNESS) &&
      reopened.prompt === "PROBE-PARK phone refused" &&
      !reopened.busy &&
      reopened.toasts === 0,
    JSON.stringify(reopened)
  );
  await page
    .locator(`${FORM} [data-ns-footer] button`, { hasText: "Cancel" })
    .tap();
  await page.waitForSelector(FORM, { state: "detached", timeout: 15_000 });
}

/** A project the spec made, on the machine it was made on. */
interface Made {
  dir: string;
  id: string;
  machineId: string;
  name: string;
}

/** The Project popover's rows as drawn: project, machine, name, meta line. */
const projectRows = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#session-project-popover [data-project-id]"
      ),
    ]
      .filter((one) => one.getClientRects().length > 0)
      .map((one) => ({
        project: one.dataset.projectId ?? "",
        machine: one.dataset.machineId ?? "",
        name:
          one.querySelector('[data-slot="name"]')?.textContent?.trim() ?? "",
        meta:
          one.querySelector('[data-slot="meta"]')?.textContent?.trim() ?? "",
      }))
  );

/** The form's picks as the tab keeps them (`cawco:new-session-form`). */
const keptPicks = (page: Page) =>
  page.evaluate(() => {
    const kept = JSON.parse(
      sessionStorage.getItem("cawco:new-session-form") ?? "null"
    ) as { picks?: { machineIds: string[]; projectId?: string } } | null;
    return kept?.picks ?? null;
  });

/** A chip's label, by the popover it controls. */
const chipLabel = (page: Page, popover: string) =>
  page.evaluate(
    ({ form, controls }) =>
      document
        .querySelector(
          `${form} [aria-controls="${controls}"] [data-slot="chip-label"]`
        )
        ?.textContent?.trim() ?? null,
    { form: FORM, controls: popover }
  );

/**
 * The Project popover with no machine chosen (the owner's pick): every
 * project on every machine the hub knows where it has a checkout, one row
 * each, its meta line naming the machine; a pick picks both; a machine
 * chosen first narrows it to that machine's. A fresh browser, so nothing
 * is remembered and nothing chosen without a press.
 */
async function projectLegs(
  kit: Kit,
  page: Page,
  base: string,
  alpha: Made,
  beta: Made
) {
  FORM = DESK_FORM;
  const label = "Project, no machine";
  const openForm = async () => {
    await page.locator(RAIL_START).filter({ visible: true }).first().click();
    await page.waitForSelector(FORM, { state: "visible", timeout: 15_000 });
    await settle(page, 300);
  };
  const openProjects = async () => {
    await page
      .locator(`${FORM} [aria-controls="session-project-popover"]`)
      .click();
    await page.waitForSelector("#session-project-popover [data-project-id]", {
      state: "visible",
      timeout: 15_000,
    });
    await settle(page, 300);
  };
  await open(page, `${base}/session`, RAIL_START, 120_000);
  await settle(page, 400);
  await openForm();
  kit.check(
    `${label}: a fresh browser's form opens on no machine`,
    ((await keptPicks(page))?.machineIds.length ?? 0) === 0,
    JSON.stringify(await keptPicks(page))
  );
  await openProjects();
  const every = await projectRows(page);
  const rowOf = (made: Made) =>
    every.find(
      (one) => one.project === made.id && one.machine === made.machineId
    );
  const named = (made: Made) => {
    const row = rowOf(made);
    const [machine, path] = row?.meta.split(" · ") ?? [];
    return row?.name === made.name && Boolean(machine) && path === made.dir;
  };
  kit.check(
    `${label}: the popover lists every project on every machine where it has a checkout, each row's meta line "<machine> · <path>"`,
    named(alpha) && named(beta),
    JSON.stringify(every)
  );
  await page
    .locator(
      `#session-project-popover [data-project-id="${beta.id}"][data-machine-id="${beta.machineId}"]`
    )
    .click();
  await page.waitForTimeout(400);
  const picked = await keptPicks(page);
  const projectChip = await chipLabel(page, "session-project-popover");
  const machinesChip = await chipLabel(page, "session-machines-popover");
  kit.check(
    `${label}: picking a row picks its project and its machine: both chips read them`,
    picked?.projectId === beta.id &&
      picked.machineIds.length === 1 &&
      picked.machineIds[0] === beta.machineId &&
      projectChip === beta.name &&
      machinesChip === rowOf(beta)?.meta.split(" · ")[0],
    JSON.stringify({ picked, projectChip, machinesChip })
  );
  // Cancel drops the picks: the next form is a new one, on no machine.
  await page
    .locator(`${FORM} [data-ns-footer] button`, { hasText: "Cancel" })
    .click();
  await page.waitForSelector(FORM, { state: "detached", timeout: 15_000 });

  await openForm();
  await page
    .locator(`${FORM} [aria-controls="session-machines-popover"]`)
    .click();
  const machineRow = page.locator(
    `#session-machines-popover [data-machine-id="${alpha.machineId}"]`
  );
  await machineRow.waitFor({ state: "visible", timeout: 15_000 });
  await machineRow.click();
  await settle(page, 300);
  await openProjects();
  const narrowed = await projectRows(page);
  kit.check(
    `${label}: a machine chosen first narrows the list to its own projects, the meta line its path alone`,
    narrowed.length > 0 &&
      narrowed.every((one) => one.machine === alpha.machineId) &&
      narrowed.some(
        (one) => one.project === alpha.id && one.meta === alpha.dir
      ) &&
      !narrowed.some((one) => one.project === beta.id),
    JSON.stringify(narrowed)
  );
}

/**
 * The swipe and the hold on WebKit's engine, at 390, with the synthesized
 * finger and cursor (kit.ts `handOn`): the sheet swiped down mid-start
 * follows the finger until it lifts, parks the start as its running row,
 * and a sheet held partway keeps its place while the visible area changes.
 */
async function webkitLegs(
  kit: Kit,
  page: Page,
  hold: Hold,
  instances: () => string[],
  spawnLink: string
) {
  FORM = PHONE_FORM;
  const label = "WebKit phone 390";
  await openSpawnLink(page, spawnLink);
  const words = "PROBE-PARK webkit swiped away";
  await page.locator(PROMPT()).click();
  await page.keyboard.type(words);
  await pickMode(page);
  const before = new Set(instances());
  hold.spawn = { ms: 8000, refuse: false };
  await pressStart(page);
  await swipeSheet(kit, page, `${label} (swipe)`);
  await rowIn(page, "running", 10_000);
  await settle(page, 200);
  const [row] = await readRows(page);
  kit.check(
    `${label} (swipe): the start parks as a running row, its stage, no toast`,
    row?.state === "running" &&
      row.title === words &&
      SPAWN_STAGE.test(row.doing) &&
      row.toasts === 0,
    JSON.stringify(row)
  );
  await rowIn(page, "started", 60_000);
  kit.check(
    `${label} (swipe): the swiped start goes on to start its session on the hub`,
    instances().some((id) => !before.has(id))
  );
  await page
    .locator(`${ROW} [data-parked-dismiss]`)
    .filter({ visible: true })
    .first()
    .click();

  await openSpawnLink(page, spawnLink);
  await holdThroughResize(kit, page, `${label} (held through a resize)`);
  await page
    .locator(`${PHONE_FORM} button[aria-label="Close"]`)
    .filter({ visible: true })
    .first()
    .click();
  await page.waitForSelector(PHONE_FORM, {
    state: "detached",
    timeout: 15_000,
  });
}

const respond = (seen: Seen): Reply =>
  seen.last.includes(SLOW)
    ? { everyMs: 250, words: Array.from({ length: 40 }, () => "slowly") }
    : { everyMs: 20, words: ["Ready."] };

const spec: Spec = {
  name: "parked-start",
  async run(kit) {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    const source = await fleet.spawn("claude", "Park source");
    // A source with a transcript: the hub sizes a continuation from it.
    await fleet.send(source, "PROBE-PARK first turn");
    const seen = fleet.seen.length;
    const deadline = Date.now() + 60_000;
    while (fleet.seen.length === seen && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, 250));
    }
    await new Promise((done) => setTimeout(done, 3000));
    const instances = () =>
      fleet
        .query<{ id: string }>("SELECT id FROM instances")
        .map((one) => one.id);
    const page = await kit.page("desk", { theme: "light" });
    const hold = await holding(page);
    // A browser that remembers no start of its own, once: a reload keeps
    // what the legs leave behind.
    await page.addInitScript(() => {
      if (!sessionStorage.getItem("probe-park-seeded")) {
        sessionStorage.setItem("probe-park-seeded", "1");
        localStorage.removeItem("cawco-spawn-prefs");
      }
    });
    await open(page, `${base}/session`, RAIL_START, 120_000);
    await settle(page, 400);
    const spawnLink = `${base}/session?spawn=${encodeURIComponent(MACHINE)}&cwd=${encodeURIComponent(fleet.workdir)}`;
    await newSessionLegs(kit, page, hold, instances, spawnLink);
    await continueLegs(
      kit,
      page,
      hold,
      fleet,
      source,
      instances,
      `${base}/session/${source}`
    );
    // The phone: the same form as the bottom sheet, its rows on the home page.
    const phone = await kit.page("phone", { theme: "light" });
    const phoneHold = await holding(phone);
    await open(phone, `${base}/session`, "body", 120_000);
    await settle(phone, 400);
    await phoneLegs(kit, phone, phoneHold, instances, spawnLink);
    // The swipe and the hold on WebKit's engine, its finger synthesized.
    const safari = await kit.page("phone", {
      theme: "light",
      engine: "webkit",
    });
    const safariHold = await holding(safari);
    await open(safari, `${base}/session`, "body", 120_000);
    await settle(safari, 400);
    await webkitLegs(kit, safari, safariHold, instances, spawnLink);
    // The Project popover with no machine chosen, two machines in the fleet.
    await fleet.launchMachine(SECOND);
    const made = async (name: string, machineId: string): Promise<Made> => {
      const dir = join(fleet.sandbox, name.toLowerCase().replace(/\s+/g, "-"));
      await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
      const project = await fleet.api<{ id: string }>("/api/projects", {
        name,
        machineId,
        cwd: dir,
        caw: false,
      });
      return { dir, id: project.id, machineId, name };
    };
    const alpha = await made("Park alpha", MACHINE);
    const beta = await made("Park beta", SECOND);
    await projectLegs(
      kit,
      await kit.page("desk", { theme: "light" }),
      base,
      alpha,
      beta
    );
  },
};

export default spec;
