/**
 * After an update an open page never sits stale (owner, nightly 5408: the
 * band "CawCo updated — this page has stopped updating. It reloads once
 * you're not using it." stood for hours while the transcript he read stopped
 * updating). A reload at any moment is safe, because what a person has in
 * progress comes back after it, so the page reloads at the first moment it
 * interrupts no keystroke or press, and the band's Reload goes at once
 * (reload.svelte.ts `busy`, `reloadNow`; HubBand).
 *
 * On a scratch fleet, the update is simulated in the page's own network: its
 * hub socket's board snapshot says a wire one newer than the page's
 * (`protocol`, client.svelte.ts `olderThanHub`), and the dashboard's server
 * names another build as the one it runs (`/_app/running-version.json`,
 * served-build.svelte.ts), both from the moment the probe flips them, until
 * the page's next navigation. The socket is closed on the flip, so the page
 * reconnects and reads the newer snapshot, as it does when the hub restarts
 * into the update.
 *
 * Each leg on Chromium at the desk, WebKit at the desk and WebKit on a phone
 * (Playwright's WebKit build, not the owner's iPhone Safari):
 *
 * a. With a composer draft and the preview panel open, and nothing pressed
 *    or typed for {@link IDLE_MS}, the page reloads within a few seconds of
 *    the change, and comes back with the draft's words and the panel open.
 * b. While typing (a key every 3 s), it holds and the band says it waits on
 *    typing; it reloads within {@link IDLE_MS} (plus a look) after the last
 *    key, the draft with every key.
 * c. The band's Reload reloads at once and the draft comes back.
 */

import type { Page, WebSocketRoute } from "playwright-core";
import { shellWords } from "../../../packages/core/src/words/shell";
import { until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  type View,
} from "../kit";

/** reload.svelte.ts `IDLE_MS`: the input the reload waits out. */
const IDLE_MS = 30_000;
/** What a reload takes beyond the hold: a reconnect's first delay, one look (`POLL_MS`), the draft's write. */
const SLACK_MS = 5000;
const PANE = ':is([data-slot="preview-pane"], [data-side-card="preview"])';
const BAND = "[data-hub-band-said]";
/**
 * The build each landing names, one of its own each time: the page reloads
 * once per change (reload.svelte.ts `RELOADED_FOR`), and this probe's reload
 * hands back the build it had, where a real one loads the next.
 */
const nextBuild = (landing: number) => `probe-next-${landing}`;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kept</title></head><body><h1>Kept</h1></body></html>`;

/** The page's view of the update: off, or on until the page navigates. */
interface Update {
  /** How many times the update has landed. */
  landings: number;
  /** Each main-frame navigation's time, ms since the epoch. */
  loads: number[];
  on: boolean;
  socket: { page: WebSocketRoute; server: WebSocketRoute } | null;
}

/** The probe's update, wired into `page` before it opens. */
const updateIn = async (page: Page): Promise<Update> => {
  const update: Update = { landings: 0, on: false, socket: null, loads: [] };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      update.loads.push(Date.now());
      update.on = false;
    }
  });
  await page.route("**/_app/running-version.json", (route) =>
    update.on
      ? route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ version: nextBuild(update.landings) }),
        })
      : route.continue()
  );
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      update.socket = { page: ws, server };
      ws.onMessage((message) => server.send(message));
      server.onMessage((message) => {
        if (!(update.on && typeof message === "string")) {
          ws.send(message);
          return;
        }
        const envelope = JSON.parse(message) as {
          payload?: { kind?: string; protocol?: number };
        };
        if (
          envelope.payload?.kind === "instances" &&
          typeof envelope.payload.protocol === "number"
        ) {
          envelope.payload.protocol += 1;
          ws.send(JSON.stringify(envelope));
          return;
        }
        ws.send(message);
      });
    }
  );
  return update;
};

/** The update lands: a newer wire and build from now, the socket dropped so the page reads them. */
const land = async (update: Update): Promise<number> => {
  update.landings += 1;
  update.on = true;
  const at = Date.now();
  const { socket } = update;
  update.socket = null;
  await socket?.server.close();
  await socket?.page.close({ code: 1012, reason: "The probe's update." });
  return at;
};

const composerText = (page: Page) =>
  page
    .locator(COMPOSER)
    .first()
    .evaluate((field) => (field.textContent ?? "").trim());

const bandSays = (page: Page) =>
  page.locator(BAND).evaluate((node) => (node.textContent ?? "").trim());

const panelHeading = (page: Page) =>
  page
    .frameLocator(`${PANE} iframe[title="Preview"]`)
    .locator("h1")
    .textContent({ timeout: 1000 })
    .catch(() => null);

/** Waits for the page's next load after `loads` of them, then for the composer; that load's time, or null. */
const reloaded = async (
  page: Page,
  update: Update,
  loads: number,
  within: number
): Promise<number | null> => {
  const at = await until(
    "the page's reload",
    () => update.loads[loads],
    (time) => time !== undefined,
    within
  ).catch(() => null);
  if (at === null) {
    return null;
  }
  await page.waitForSelector(COMPOSER, { timeout: 60_000 });
  await settle(page, 600);
  return at;
};

/** The composer of the session's pane, the keyboard in it, holding `words` typed. */
const typeDraft = async (page: Page, words: string) => {
  const field = page.locator(COMPOSER).first();
  await field.click();
  // The caret after what the field holds: a press lands it where it fell.
  await field.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const selection = getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.type(words, { delay: 20 });
};

const leg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  engine: Engine,
  view: View,
  index: number
) => {
  const name = `${engine} ${view}`;
  const check = (what: string, ok: boolean, detail: string) =>
    kit.check(`${name}: ${what}`, ok, detail);
  const session = await fleet.spawn("claude", `Stale ${index}`, fleet.repo);
  const page = await kit.page(view, { engine });
  const update = await updateIn(page);
  await open(page, `${base}/session/${session}`, COMPOSER);

  // a. A draft, the panel, then nothing for IDLE_MS; the update lands.
  const draftA = `Kept across the reload ${index}`;
  await typeDraft(page, draftA);
  await fleet.api(`/api/instances/${session}/artifacts`, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: `kept-${index}`,
    html: PAGE,
  });
  await until(
    "the panel showing the page",
    () => panelHeading(page),
    (heading) => heading === "Kept",
    30_000
  ).catch(() => null);
  await page.waitForTimeout(IDLE_MS + 1000);
  const before = update.loads.length;
  const landedA = await land(update);
  const atA = await reloaded(page, update, before, IDLE_MS);
  const backA = {
    afterMs: atA === null ? null : atA - landedA,
    draft: await composerText(page),
    panes: await page.locator(PANE).count(),
    heading: await panelHeading(page),
  };
  check(
    `a: an idle page with a draft and the panel open reloads within ${SLACK_MS / 1000} s of the update`,
    backA.afterMs !== null && backA.afterMs < SLACK_MS,
    JSON.stringify(backA)
  );
  check(
    "a: it comes back with the draft's words and the panel open",
    backA.draft === draftA && backA.panes === 1 && backA.heading === "Kept",
    JSON.stringify(backA)
  );

  // The composer is reached under the phone's sheet once it is closed.
  if (view === "phone" && (await page.locator(PANE).count()) > 0) {
    await page.locator(`${PANE} [data-slot="close"]`).first().click();
    await until(
      "the sheet gone",
      () => page.locator(PANE).count(),
      (count) => count === 0,
      10_000
    ).catch(() => null);
    await settle(page);
  }

  // b. Typing holds it; the last key starts IDLE_MS.
  await typeDraft(page, " b");
  const loadsB = update.loads.length;
  await land(update);
  let lastKey = Date.now();
  const heldWhile: string[] = [];
  for (let key = 0; key < 4; key += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: a key every 3 s, as a person types
    await page.waitForTimeout(3000);
    await page.keyboard.type(String(key));
    lastKey = Date.now();
    heldWhile.push(await bandSays(page));
  }
  const typingWords = `${shellWords.staleLead} ${shellWords.staleTyping(IDLE_MS / 1000)}`;
  check(
    "b: while typing it holds, and the band says it waits on typing",
    update.loads.length === loadsB &&
      heldWhile.slice(1).every((said) => said === typingWords),
    JSON.stringify({ loads: update.loads.length - loadsB, heldWhile })
  );
  const atB = await reloaded(page, update, loadsB, IDLE_MS + 2 * SLACK_MS);
  const afterKey = atB === null ? null : atB - lastKey;
  const draftB = `${draftA} b0123`;
  const textB = await composerText(page);
  check(
    `b: it reloads within ${IDLE_MS / 1000} s (and a look) of the last key, not before`,
    afterKey !== null &&
      afterKey >= IDLE_MS - 1500 &&
      afterKey < IDLE_MS + SLACK_MS,
    JSON.stringify({ afterKey })
  );
  check(
    "b: the draft comes back with every key",
    textB === draftB,
    JSON.stringify({ textB, draftB })
  );

  if (view === "phone" && (await page.locator(PANE).count()) > 0) {
    await page.locator(`${PANE} [data-slot="close"]`).first().click();
    await until(
      "the sheet gone",
      () => page.locator(PANE).count(),
      (count) => count === 0,
      10_000
    ).catch(() => null);
    await settle(page);
  }

  // c. The band's Reload, pressed while typing holds the reload.
  await typeDraft(page, " c");
  const loadsC = update.loads.length;
  await land(update);
  const button = page
    .locator('[data-slot="hub-band"]')
    .getByRole("button", { name: shellWords.reload });
  const shown = await button
    .waitFor({ state: "visible", timeout: SLACK_MS * 2 })
    .then(() => true)
    .catch(() => false);
  const pressed = Date.now();
  if (shown) {
    await button.click();
  }
  const atC = await reloaded(page, update, loadsC, SLACK_MS);
  const textC = await composerText(page);
  check(
    "c: the band's Reload reloads at once",
    shown && atC !== null && atC - pressed < 3000,
    JSON.stringify({ shown, afterMs: atC === null ? null : atC - pressed })
  );
  check(
    "c: the draft comes back after it",
    textC === `${draftB} c`,
    JSON.stringify({ textC })
  );
  await page.close();
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
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();
  const legs: [Engine, View][] = [
    ["chromium", "desk"],
    ["webkit", "desk"],
    ["webkit", "phone"],
  ];
  for (const [index, [engine, view]] of legs.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each timed on its own
    await leg(kit, fleet, base, engine, view, index + 1);
  }
};

const spec: Spec = { name: "stale-reload", run };
export default spec;
