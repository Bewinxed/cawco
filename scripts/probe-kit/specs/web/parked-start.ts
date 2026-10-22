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
 *
 *   bun scripts/probe-kit/run.ts web parked-start
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one step at a time, as a person takes them
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen } from "../../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../../kit";

const POPOVER = "[data-ns-popover]";
const RAIL_START = 'button[aria-label="Start session"]';
const PROMPT = `${POPOVER} [aria-label="First prompt"]`;
const START = `${POPOVER} #session-start`;
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
/** The source session's tab. */
const SOURCE_TAB = /Park source/;
/** The source's turn the continuation waits on (the mock answers it slowly). */
const SLOW = "PROBE-PARK slow turn";

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
  }, POPOVER);

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
  await page.keyboard.press("Escape");
  const flew = await page
    .waitForFunction(
      (popover) => {
        const card = document.querySelector<HTMLElement>(popover);
        return (
          card?.getAnimations().some((run) => {
            const frames =
              (run.effect as KeyframeEffect | null)?.getKeyframes() ?? [];
            const last = frames.at(-1);
            return (
              last !== undefined &&
              String(last.opacity) === "0" &&
              String(last.transform).includes("scale(")
            );
          }) ?? false
        );
      },
      POPOVER,
      { timeout: 2000, polling: 16 }
    )
    .then(
      () => true,
      () => false
    );
  kit.check(
    `${label}: Esc mid-start closes the form into its row (a flight on the form to the row's box, fading out)`,
    flew
  );
  await page.waitForSelector(POPOVER, { state: "detached", timeout: 15_000 });
}

/** Types `words` into the open form's prompt and attaches the probe's file. */
async function fill(page: Page, words: string) {
  await page.locator(PROMPT).click();
  await page.keyboard.type(words);
  await page
    .locator(`${POPOVER} input[type="file"]`)
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
    { popover: POPOVER, file: FILE },
    { timeout: 30_000 }
  );
  // The draft store's write rests 250ms (keep-draft).
  await page.waitForTimeout(800);
}

/** A permission mode picked, when the form waits for one. */
async function pickMode(page: Page) {
  const chip = page
    .locator(`${POPOVER} [aria-label^="Permission mode"]`)
    .first();
  if ((await chip.textContent())?.trim() !== "Choose a mode") {
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
    START,
    { timeout: 60_000 }
  );
  await page.locator(START).click();
  await page.waitForFunction(
    (start) =>
      document.querySelector(start)?.getAttribute("aria-busy") === "true",
    START,
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
  /** The form opened on the fleet's machine and folder, as "Spawn here" opens it. */
  const openNew = async () => {
    await page.goto(spawnLink, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(POPOVER, { state: "visible", timeout: 60_000 });
    await page.waitForFunction(
      () => !location.search.includes("spawn="),
      null,
      {
        timeout: 15_000,
      }
    );
  };
  const label = "New session";
  // 1. Typed, attached, reloaded: the same form.
  await openNew();
  const words = "PROBE-PARK first prompt kept";
  await fill(page, words);
  await pickMode(page);
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (prompt) => (document.querySelector(prompt)?.textContent ?? "").length > 0,
    PROMPT,
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
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
  await page.locator(PROMPT).click();
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
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
    .locator(`${POPOVER} [data-ns-footer] button`, { hasText: "Cancel" })
    .click();
  await page.waitForSelector(POPOVER, { state: "detached", timeout: 15_000 });
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
    .getByRole("menuitem", { name: "Continue in new session…" })
    .first();
  await item.waitFor({ state: "visible", timeout: 10_000 });
  await item.click();
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    (prompt) =>
      (document.querySelector(prompt)?.textContent ?? "").includes("PROBE"),
    PROMPT,
    { timeout: 30_000 }
  );
  await settle(page, 400);
  const reloaded = await readForm(page);
  kit.check(
    `${label}: a reload opens the continuation form again, on the same source, with the same words and chip`,
    reloaded.open &&
      reloaded.head === "Continue session" &&
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const back = await readForm(page);
  kit.check(
    `${label}: a press on the row brings the form back on the running continuation: its words, Start pending with its stage`,
    back.open &&
      back.head === "Continue session" &&
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
  await page.locator(PROMPT).click();
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 60_000 });
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
  await page.locator(PROMPT).click();
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
  await page.waitForSelector(POPOVER, { state: "visible", timeout: 15_000 });
  await settle(page, 300);
  const reopened = await readForm(page);
  kit.check(
    `${label}: Reopen opens the continuation form on it, the refusal's words on its line, no toast`,
    reopened.head === "Continue session" &&
      reopened.reading.includes(REFUSAL) &&
      reopened.prompt.includes("PROBE-PARK refused continue") &&
      reopened.toasts === 0,
    JSON.stringify(reopened)
  );
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
    await newSessionLegs(
      kit,
      page,
      hold,
      instances,
      `${base}/session?spawn=${encodeURIComponent(MACHINE)}&cwd=${encodeURIComponent(fleet.workdir)}`
    );
    await continueLegs(
      kit,
      page,
      hold,
      fleet,
      source,
      instances,
      `${base}/session/${source}`
    );
  },
};

export default spec;
