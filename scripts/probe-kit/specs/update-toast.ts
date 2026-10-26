/**
 * A new build reaches an open page as a toast, never as a reload under the
 * person (owner: "update toast, update now, update when idle? default to
 * idle"; "hook it into the idle timer that is already there"). The page's
 * idle is the tab in the background, or the person away by the presence
 * model's own clock: the hub's rollup against the away clock, told as its
 * `person` frame (updates/update-toast.svelte.ts).
 *
 * On a scratch fleet the new build is announced in the page's own network:
 * the dashboard's server names another build as the one it runs
 * (`/_app/running-version.json`, served-build.svelte.ts) from the moment the
 * probe flips it until the page's next navigation, and the page's hub
 * socket is closed, so it reconnects and asks, as it does when the hub
 * restarts into an update. The wire stays the page's own: that reload is
 * forced, and stale-reload proves it.
 *
 * Each leg on Chromium and WebKit (Playwright's build, not the owner's
 * iPhone Safari), at the desk and on a 390 phone, every page with no console
 * error:
 *
 * a. The toast says a new build is ready, with Update now and Update when
 *    idle, sized inside the viewport with both acts on one row; no reload
 *    follows. A second announcement changes that toast in place: one toast.
 *    Update now reloads at once, and the reloaded page shows no toast.
 * b. Update when idle puts the toast away and nothing reloads; the tab going
 *    to the background reloads it.
 * c. No choice: the tab going to the background reloads it.
 * d. Update when idle, then no input for the away clock (set to its least
 *    through the person's setting, `POST /api/person/away-clock`): the hub
 *    says the person is away and the page reloads.
 * e. No choice, then no input for the away clock: the same.
 *
 * And the build's release notes reach the person whichever way it lands
 * (owner: "idk where the update / release notes has disappeared to"). The
 * landing is the machine's own word (`binaryUpdate.landed`, with its notes),
 * put on the hub as an agent puts it (`PUT
 * /api/binary-updates/machines/:id/state`); only the notice's ✕ (or Clear
 * all, or its act) acknowledges it, never a reload or a page viewed:
 *
 * f. A build lands while a page is open: the toast stands and Caw's panel
 *    holds "CawCo updated to …" with its notes open. Update now reloads, and
 *    the reloaded page's panel still holds them; so does the page the idle
 *    reload (the tab to the background) brings back.
 * g. A build lands while no page is open: a page opened after it holds the
 *    notes in Caw's panel, a reload keeps them, and Configure › Updates
 *    viewed keeps them. Their ✕ takes them away, and a reload does not bring
 *    them back.
 * h. An install started from Configure › Updates finishes: "running on N
 *    machines" goes by itself, and the panel then holds the landing's notes.
 */

import type { Page, WebSocketRoute } from "playwright-core";
import {
  AWAY_AFTER_DEFAULT_MS,
  AWAY_AFTER_MIN_MS,
  type PersonView,
} from "../../../packages/core/src/notifications";
import { updatesWords } from "../../../packages/core/src/words/updates";
import { MACHINE, until } from "../../scratch-fleet";
import { caw } from "../caw-head";
import {
  type Engine,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  type Spec,
  type View,
} from "../kit";

const TOAST = '[data-sonner-toast]:not([data-removed="true"])';
const READY = '[data-slot="toast-layer"]';
/** What a reload takes once it is due: the drafts' write and the load's start. */
const SLACK_MS = 5000;
/** How long a page is watched for a reload that must not come. */
const QUIET_MS = 4000;
/** The hub's presence sweep (hub notifications.ts `SWEEP_MS`): the away clock is read on it. */
const SWEEP_MS = 10_000;
/** How long the hub's frame takes to reach the page, at most. */
const FRAME_LANDS_MS = 2000;
/** Each announcement names a build of its own (reload.svelte.ts `RELOADED_FOR`). */
const nextBuild = (n: number) => `probe-toast-${n}`;

interface Update {
  builds: number;
  /** The page's console errors and uncaught errors. */
  errors: string[];
  /** Each main-frame navigation's time, ms since the epoch. */
  loads: number[];
  on: boolean;
  socket: { page: WebSocketRoute; server: WebSocketRoute } | null;
}

/** The probe's announcement, wired into `page` before it opens. */
const wire = async (page: Page): Promise<Update> => {
  const update: Update = {
    builds: 0,
    on: false,
    socket: null,
    loads: [],
    errors: [],
  };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      update.loads.push(Date.now());
      update.on = false;
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      update.errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => update.errors.push(error.message));
  await page.route("**/_app/running-version.json", (route) =>
    update.on
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ version: nextBuild(update.builds) }),
        })
      : route.continue()
  );
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      update.socket = { page: ws, server };
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => ws.send(message));
    }
  );
  return update;
};

/** A new build is announced: served from now, the socket dropped so the page asks. */
const announce = async (update: Update): Promise<void> => {
  update.builds += 1;
  update.on = true;
  const { socket } = update;
  update.socket = null;
  await socket?.server.close();
  await socket?.page.close({ code: 1012, reason: "The probe's new build." });
};

/** The page's next load after `loads` of them, within `ms`; its time, or null. */
const reloaded = (update: Update, loads: number, ms: number) =>
  until(
    "the page's reload",
    () => update.loads[loads],
    (time) => time !== undefined,
    ms
  ).catch(() => null);

/** The tab going to the background, as a switch to another tab does it. */
const toBackground = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });

/** What the toast shows: its words, its acts, and its boxes against the viewport's. */
const readToast = (page: Page) =>
  page.evaluate((selector) => {
    const toasts = [...document.querySelectorAll<HTMLElement>(selector)];
    const [toast] = toasts;
    if (!toast) {
      return { count: 0 };
    }
    const box = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return r
        ? {
            top: Math.round(r.top),
            bottom: Math.round(r.bottom),
            left: Math.round(r.left),
            right: Math.round(r.right),
          }
        : null;
    };
    const buttons = [...toast.querySelectorAll("button[data-button]")];
    return {
      count: toasts.length,
      title: toast.querySelector("[data-title]")?.textContent?.trim(),
      description: toast
        .querySelector("[data-description]")
        ?.textContent?.trim(),
      buttons: buttons.map((b) => b.textContent?.trim()),
      toast: box(toast),
      content: box(toast.querySelector("[data-content]")),
      buttonBoxes: buttons.map(box),
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, TOAST);

/**
 * The toast inside the viewport, its words above its two acts, which stand
 * side by side on one row inside its trailing edge.
 */
const standsWhole = (read: Awaited<ReturnType<typeof readToast>>): boolean => {
  const { toast: t, viewport, content } = read;
  const [idle, now] = read.buttonBoxes ?? [];
  if (!(t && viewport && content && idle && now)) {
    return false;
  }
  const inView =
    t.left >= 0 &&
    t.right <= viewport.width &&
    t.top >= 0 &&
    t.bottom <= viewport.height;
  const oneRow =
    idle.top === now.top &&
    idle.right <= now.left &&
    idle.left >= t.left &&
    now.right <= t.right;
  return inView && oneRow && content.bottom <= idle.top;
};

/** Landings put so far: each leg's are its own. */
let landings = 0;

/** The update row of Caw's panel (home/UpdateCard). */
const UPDATE_ROW = '[data-slot="update-card-card"]';
/** How long the panel's update row is waited for. */
const ROW_MS = 10_000;

/** A landing's build and notes: each one its own, so a reading names which. */
const landingOf = (n: number) => ({
  version: `0.1.99-nightly.${9000 + n}+probe`,
  shown: `nightly ${9000 + n}`,
  bullet: `Probe landing ${n} is in the notes`,
  notes: `### New\n- Probe landing ${n} is in the notes\n- A second new line\n\n### Fixed\n- One fixed line`,
});

/**
 * The fleet's machine reports `state` as its agent reports it (`PUT
 * /api/binary-updates/machines/:id/state`). A source agent's beats carry no
 * update state, so this one stands until the next.
 */
const report = async (
  fleet: KitFleet,
  state: Record<string, unknown>
): Promise<void> => {
  const response = await fetch(
    `${fleet.base}/api/binary-updates/machines/${MACHINE}/state`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "nightly",
        hostsHub: true,
        updatedAt: Date.now(),
        ...state,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(
      `the state was not put: ${response.status} ${await response.text()}`
    );
  }
};

/**
 * A build landed on the fleet's machine, as its agent says it: the state's
 * `landed` with the build's notes (core binary-updates.ts `BinaryUpdateLanding`).
 */
const land = (fleet: KitFleet, n: number): Promise<void> => {
  const { version, notes } = landingOf(n);
  return report(fleet, {
    phase: "installed",
    installedVersion: version,
    availableVersion: version,
    notes,
    landed: { at: Date.now(), outcome: "installed", version, notes },
  });
};

/**
 * What Caw's panel says of the update: the row's title, and its notes as
 * they stand once open (Show changes pressed when they stand folded). The
 * panel is opened by his head and closed again by Escape; opening it
 * acknowledges nothing.
 */
const readNotes = async (page: Page) => {
  await caw(page).click();
  const row = page.locator(UPDATE_ROW).first();
  const up = await row
    .waitFor({ state: "visible", timeout: ROW_MS })
    .then(() => true)
    .catch(() => false);
  if (!up) {
    await page.keyboard.press("Escape");
    return { title: null, open: false, notes: "" };
  }
  const toggle = row.locator('[data-toggle][aria-expanded="false"]');
  if ((await toggle.count()) > 0) {
    await toggle.click();
  }
  const fold = row.locator('[data-slot="fold"]');
  await fold
    .and(page.locator("[data-open]"))
    .waitFor({ timeout: ROW_MS })
    .catch(() => undefined);
  const read = {
    title: (await row.locator('[data-slot="title"]').textContent())?.trim(),
    open: (await fold.getAttribute("data-open").catch(() => null)) !== null,
    notes: (await fold.innerText().catch(() => "")).trim(),
  };
  await page.keyboard.press("Escape");
  return read;
};

/** The panel holds landing `n`'s notice, its title naming the build, its notes open with its own bullet. */
const holdsNotes = (
  read: Awaited<ReturnType<typeof readNotes>>,
  n: number
): boolean =>
  read.title?.endsWith(` ${landingOf(n).shown}`) === true &&
  read.open &&
  read.notes.includes(landingOf(n).bullet);

/** What legs f and g are given of their leg: its fleet, its checks and its fresh pages. */
interface Leg {
  base: string;
  check: (what: string, ok: boolean, detail: unknown) => void;
  fleet: KitFleet;
  fresh: () => Promise<{ page: Page; update: Update; loaded: number }>;
  noErrors: (what: string, update: Update) => void;
  toastUp: (page: Page) => Promise<boolean>;
}

/**
 * f. A build lands while a page is open: the toast, the notes in Caw's
 * panel, Update now, then the idle reload.
 */
const landsOpen = async ({
  check,
  fleet,
  fresh,
  noErrors,
  toastUp,
}: Leg): Promise<void> => {
  const { page, update, loaded } = await fresh();
  landings += 1;
  const n = landings;
  await land(fleet, n);
  await announce(update);
  const shown = await toastUp(page);
  const before = await readNotes(page);
  check(
    "f: a build landed with the page open: the toast stands, and Caw's panel holds the update with its notes open",
    shown && holdsNotes(before, n),
    { shown, before }
  );
  await page.getByRole("button", { name: updatesWords.updateNow }).click();
  const at = await reloaded(update, loaded, SLACK_MS);
  await page.waitForSelector(READY, { timeout: 60_000 });
  const after = await readNotes(page);
  check(
    "f: Update now reloads, and the reloaded page's panel still holds the notes",
    at !== null && holdsNotes(after, n),
    { reloaded: at !== null, after }
  );
  const reloads = update.loads.length;
  await announce(update);
  await toastUp(page);
  await toBackground(page);
  const idleAt = await reloaded(update, reloads, SLACK_MS);
  await page.waitForSelector(READY, { timeout: 60_000 });
  const idle = await readNotes(page);
  check(
    "f: the idle reload (the tab to the background) brings back a page whose panel still holds the notes",
    idleAt !== null && holdsNotes(idle, n),
    { reloaded: idleAt !== null, idle }
  );
  noErrors("f", update);
  await page.close();
};

/**
 * g. A build lands while no page is open: a page opened, reloaded,
 * Configure › Updates viewed, then the notice's ✕.
 */
const landsClosed = async ({
  base,
  check,
  fleet,
  fresh,
  noErrors,
}: Leg): Promise<void> => {
  landings += 1;
  const n = landings;
  await land(fleet, n);
  const { page, update } = await fresh();
  const opened = await readNotes(page);
  check(
    "g: a page opened after the build landed holds the update in Caw's panel with its notes open",
    holdsNotes(opened, n),
    opened
  );
  await page.reload();
  await page.waitForSelector(READY, { timeout: 60_000 });
  const again = await readNotes(page);
  check(
    "g: a reload keeps the notes in Caw's panel",
    holdsNotes(again, n),
    again
  );
  await open(page, `${base}/config/updates`, READY);
  // The page stands once its auto-update switch does (SwitchField `id`).
  await page.locator("#auto-update").waitFor({ timeout: ROW_MS });
  await page.waitForTimeout(QUIET_MS);
  await open(page, `${base}/`, READY);
  const viewed = await readNotes(page);
  check(
    "g: Configure › Updates viewed keeps the notes in Caw's panel",
    holdsNotes(viewed, n),
    viewed
  );
  await caw(page).click();
  // No row to dismiss is no ✕ taking it away: a failed check, not a throw.
  // The ✕ of the row that holds the update (NoticeRow's `x`).
  const dismissed = await page
    .locator("article", { has: page.locator(UPDATE_ROW) })
    .locator('[data-slot="x"]')
    .first()
    .click({ timeout: ROW_MS })
    .then(() => true)
    .catch(() => false);
  const gone =
    dismissed &&
    (await page
      .locator(UPDATE_ROW)
      .waitFor({ state: "detached", timeout: ROW_MS })
      .then(() => true)
      .catch(() => false));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(QUIET_MS);
  await page.reload();
  await page.waitForSelector(READY, { timeout: 60_000 });
  const after = await readNotes(page);
  check(
    "g: the notice's ✕ takes the notes away, and a reload does not bring them back",
    gone && after.title === null,
    { gone, after }
  );
  noErrors("g", update);
  await page.close();
};

/** How long "running on N machines" stands before it goes by itself (update-notice.svelte.ts `DONE_MS`). */
const DONE_MS = 6000;

/**
 * h. An install started from Configure › Updates finishes: the machine's row
 * offers the build (`available`), its Install now is pressed (the hub's
 * answer stood in by the page's own route, so no source agent is asked to
 * install), the machine installs it and reports the landing. "Running on N
 * machines" says it and goes by itself, and the panel then holds the
 * landing's notes.
 */
const installedHere = async ({
  base,
  check,
  fleet,
  fresh,
  noErrors,
}: Leg): Promise<void> => {
  landings += 1;
  const n = landings;
  const { version, notes } = landingOf(n);
  const before = `0.1.99-nightly.${8000 + n}+probe`;
  await report(fleet, {
    phase: "available",
    installedVersion: before,
    availableVersion: version,
    notes,
  });
  const { page, update } = await fresh();
  let asked = 0;
  await page.route("**/api/agents/*/update", (route) => {
    asked += 1;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await open(page, `${base}/config/updates`, READY);
  // The machine row's one act while it offers a build: its Install now (UpdateCell, the kit's outline).
  await page
    .locator('table [data-slot="button"][data-variant="outline"]')
    .first()
    .click({ timeout: ROW_MS });
  await until(
    "the install asked of the hub",
    () => asked,
    (count) => count > 0,
    ROW_MS
  );
  await report(fleet, {
    phase: "installing",
    installedVersion: before,
    availableVersion: version,
    notes,
  });
  await page.waitForTimeout(QUIET_MS);
  await land(fleet, n);
  await page.waitForTimeout(DONE_MS + QUIET_MS);
  const after = await readNotes(page);
  check(
    "h: an install started from Configure › Updates finishes, and once \"running on N machines\" has gone Caw's panel holds the landing's notes",
    asked > 0 && holdsNotes(after, n),
    { asked, after }
  );
  noErrors("h", update);
  await page.close();
};

const leg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  engine: Engine,
  view: View
) => {
  const name = `${engine} ${view}`;
  const check = (what: string, ok: boolean, detail: unknown) =>
    kit.check(`${name}: ${what}`, ok, JSON.stringify(detail));
  const person = () => fleet.api<PersonView>("/api/person");
  /** A fresh page, a key pressed in it, and the hub saying the person is here. */
  const fresh = async () => {
    const page = await kit.page(view, { engine });
    const update = await wire(page);
    await open(page, `${base}/`, READY);
    const keyAt = Date.now();
    await page.keyboard.press("Shift");
    await until(
      "the person here",
      () => person(),
      (seen) => seen.state === "here",
      SWEEP_MS * 2
    );
    // The hub's \`person\` frame saying so reaches the page before the probe's
    // announcement drops its socket (the page reads the person again on the
    // reconnect, but the toast may come first).
    await page.waitForTimeout(FRAME_LANDS_MS);
    // The opening itself may be more than one navigation request.
    return { page, update, loaded: update.loads.length, keyAt };
  };
  const toastUp = (page: Page) =>
    page
      .locator(TOAST)
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
  const noErrors = (what: string, update: Update) =>
    check(
      `${what}: no console error`,
      update.errors.length === 0,
      update.errors
    );

  // a. The toast, a second build, Update now.
  {
    const { page, update, loaded } = await fresh();
    await announce(update);
    const shown = await toastUp(page);
    await page.waitForTimeout(QUIET_MS);
    const first = await readToast(page);
    const want = {
      title: updatesWords.pageReady,
      description: updatesWords.pageUpdatesItself(
        Math.round(AWAY_AFTER_DEFAULT_MS / 60_000)
      ),
      buttons: [updatesWords.updateWhenIdle, updatesWords.updateNow],
    };
    check(
      "a: the toast says a new build is ready, with Update when idle and Update now",
      shown &&
        first.count === 1 &&
        first.title === want.title &&
        first.description === want.description &&
        JSON.stringify(first.buttons) === JSON.stringify(want.buttons),
      { first, want }
    );
    check(
      "a: no reload follows it",
      update.loads.length === loaded,
      update.loads
    );
    check(
      "a: it stands inside the viewport, its words above its two acts, side by side at its trailing edge",
      standsWhole(first),
      first
    );
    await announce(update);
    await page.waitForTimeout(QUIET_MS);
    const second = await readToast(page);
    check(
      "a: a second build changes the same toast: one toast, no reload",
      second.count === 1 &&
        second.title === want.title &&
        update.loads.length === loaded,
      { second, loads: update.loads.length - loaded }
    );
    const pressed = Date.now();
    await page.getByRole("button", { name: updatesWords.updateNow }).click();
    const at = await reloaded(update, loaded, SLACK_MS);
    check("a: Update now reloads at once", at !== null && at - pressed < 3000, {
      afterMs: at === null ? null : at - pressed,
    });
    await page.waitForSelector(READY, { timeout: 60_000 });
    await page.waitForTimeout(QUIET_MS);
    check(
      "a: the reloaded page shows no toast",
      (await readToast(page)).count === 0,
      await readToast(page)
    );
    noErrors("a", update);
    await page.close();
  }

  // b. Update when idle, then the background.
  {
    const { page, update, loaded } = await fresh();
    await announce(update);
    await toastUp(page);
    await page
      .getByRole("button", { name: updatesWords.updateWhenIdle })
      .click();
    await page.waitForTimeout(QUIET_MS);
    const after = await readToast(page);
    check(
      "b: Update when idle puts the toast away, and nothing reloads",
      after.count === 0 && update.loads.length === loaded,
      { after, loads: update.loads.length - loaded }
    );
    const hidden = Date.now();
    await toBackground(page);
    const at = await reloaded(update, loaded, SLACK_MS);
    check(
      "b: the tab going to the background reloads it",
      at !== null && at - hidden < SLACK_MS,
      { afterMs: at === null ? null : at - hidden }
    );
    noErrors("b", update);
    await page.close();
  }

  // c. No choice, then the background.
  {
    const { page, update, loaded } = await fresh();
    await announce(update);
    await toastUp(page);
    await page.waitForTimeout(QUIET_MS);
    const hidden = Date.now();
    await toBackground(page);
    const quiet = update.loads.length === loaded;
    const at = await reloaded(update, loaded, SLACK_MS);
    check(
      "c: with no choice, nothing reloads while the tab is in front and the person here, and the tab going to the background reloads it",
      quiet && at !== null && at - hidden < SLACK_MS,
      { afterMs: at === null ? null : at - hidden }
    );
    noErrors("c", update);
    await page.close();
  }

  const given: Leg = { base, check, fleet, fresh, noErrors, toastUp };
  await landsOpen(given);
  await landsClosed(given);
  await installedHere(given);

  // d and e. No input for the away clock, after Update when idle or no choice.
  await fleet.api("/api/person/away-clock", { awayAfterMs: AWAY_AFTER_MIN_MS });
  for (const [label, choose] of [
    ["d: after Update when idle", true],
    ["e: with no choice", false],
  ] as const) {
    const { page, update, loaded, keyAt: lastInput } = await fresh();
    await announce(update);
    await toastUp(page);
    const words = await readToast(page);
    if (choose) {
      // A press is input: the away clock starts again from it.
      await page
        .getByRole("button", { name: updatesWords.updateWhenIdle })
        .click();
    }
    const clicked = Date.now();
    const at = await reloaded(
      update,
      loaded,
      AWAY_AFTER_MIN_MS + SWEEP_MS + 30_000
    );
    // The hub hears an input at once, or on the page's next presence beat
    // (30 s): its away clock runs from the key, or from the press that came
    // after it, whichever it heard last.
    const afterKey = at === null ? null : at - lastInput;
    const afterPress = at === null || !choose ? null : at - clicked;
    check(
      `${label}, nothing reloads before the away clock (${AWAY_AFTER_MIN_MS / 1000} s) has run without input, and the page reloads once the hub's sweep says the person is away`,
      afterKey !== null &&
        afterKey >= AWAY_AFTER_MIN_MS - 1000 &&
        (afterPress ?? afterKey) < AWAY_AFTER_MIN_MS + SWEEP_MS + SLACK_MS,
      { afterKey, afterPress }
    );
    check(
      `${label}: the toast said the away clock's minutes`,
      words.description ===
        updatesWords.pageUpdatesItself(AWAY_AFTER_MIN_MS / 60_000),
      words
    );
    noErrors(label.slice(0, 1), update);
    await page.close();
  }
  await fleet.api("/api/person/away-clock", {
    awayAfterMs: AWAY_AFTER_DEFAULT_MS,
  });
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  const base = await fleet.dashboard();
  const legs: [Engine, View][] = [
    ["chromium", "desk"],
    ["chromium", "phone"],
    ["webkit", "desk"],
    ["webkit", "phone"],
  ];
  for (const [engine, view] of legs) {
    await leg(kit, fleet, base, engine, view);
  }
};

const spec: Spec = {
  group: "Release checks",
  name: "update-toast",
  run,
};
export default spec;
