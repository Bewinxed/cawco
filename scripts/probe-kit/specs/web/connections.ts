/**
 * Configure › Connections, on the built dashboard against a scratch hub
 * holding two connections: Linear signed in, GitHub not (it takes a key).
 * On the desk (1440) and the phone (390), light and dark, read from the
 * engine (rule 7: the DOM, geometry and the hub's own answers, no pixels):
 *  - one row per connection, each row's state word the hub's state
 *    (`signed-in` "Signed in", `needs-sign-in` "Not signed in"), its account
 *    the hub's, the not-signed-in row carrying Set key and the signed-in row
 *    no way in;
 *  - the list never scrolls sideways, no row's controls past the card.
 * Then, desk light:
 *  - Set key: the key goes to the hub (it holds a secret now), and no input,
 *    attribute or text on the page still holds it;
 *  - Remove asks on the row (a fieldset under it, no dialog), and Remove
 *    connection removes it at the hub and the row leaves.
 * Then with none, every width and theme: the empty state says signing in is
 * the owner's, with a start card per service; desk light, a card opens the
 * sign-in form in the page.
 */

import type { Page } from "playwright-core";
import type { ConnectionView } from "../../../../packages/core/src/index";
import { until } from "../../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  type Spec,
  THEMES,
  type View,
} from "../../kit";

const respond = () => ({ everyMs: 5, words: ["ok"] });
/** A key no page may hold once the hub has it. */
const KEY = "ghp_probe_connection_key_7f3a9c";
/** Nothing listens here: a look at either connection fails fast. */
const NOWHERE = "http://127.0.0.1:9/mcp";
const WORD: Record<ConnectionView["state"], string> = {
  "signed-in": "Signed in",
  "needs-sign-in": "Not signed in",
  error: "Failing",
};
const VIEWS: View[] = ["desk", "phone"];

async function stage(fleet: KitFleet) {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  for (const [name, service, account, auth] of [
    ["linear-brand", "linear", "Petra Lab", "oauth"],
    ["github-petra", "github", "petra", "bearer"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one connection at a time, in the list's order
    await fleet.api("/api/connections", {
      name,
      service,
      account,
      transport: "http",
      url: NOWHERE,
      auth,
    });
  }
  // Signed in as the hub files it after a look that answered.
  fleet.write(
    "UPDATE connections SET state = 'signed-in', reason = NULL WHERE name = 'linear-brand'"
  );
}

const hubRows = async (fleet: KitFleet) =>
  (await fleet.api<{ connections: ConnectionView[] }>("/api/connections"))
    .connections;

async function openPage(page: Page, base: string, ready: string) {
  await open(page, `${base}/config/connections`, ready);
  await page.waitForTimeout(600);
}

/** The rows as the engine lays them out. */
const rowsOf = () => {
  const card = document.querySelector('ul[aria-label="Connections"]');
  const frame = card?.closest("section, main") ?? document.body;
  const limit = frame.getBoundingClientRect().right;
  return {
    sideways: document.scrollingElement
      ? document.scrollingElement.scrollWidth -
        document.scrollingElement.clientWidth
      : 0,
    rows: [
      ...(card?.querySelectorAll<HTMLElement>("[data-row-name]") ?? []),
    ].map((row) => ({
      name: row.dataset.rowName ?? "",
      state: row.querySelector<HTMLElement>("[data-state]")?.dataset.state,
      word: row.querySelector("[data-state]")?.textContent?.trim(),
      meta: row.querySelector(".meta")?.textContent?.trim(),
      buttons: [...row.querySelectorAll(".controls button")]
        .map((b) => b.textContent?.trim() ?? b.getAttribute("aria-label"))
        .filter(Boolean),
      past:
        (row.querySelector(".controls")?.getBoundingClientRect().right ??
          limit) - limit,
    })),
  };
};

async function checkRows(kit: Kit, fleet: KitFleet, page: Page, at: string) {
  const hub = await hubRows(fleet);
  const read = await page.evaluate(rowsOf);
  kit.check(
    `one row per connection the hub holds (${at})`,
    read.rows.length === hub.length && hub.length === 2,
    `${read.rows.length} rows, hub ${hub.length}`
  );
  for (const one of hub) {
    const label = one.service === "linear" ? "Linear" : "GitHub";
    const row = read.rows.find((each) => each.name === label);
    kit.check(
      `${label}: its state word is the hub's ${one.state}, its account the hub's (${at})`,
      row !== undefined &&
        row.state === one.state &&
        row.word === WORD[one.state] &&
        row.meta === one.account,
      JSON.stringify(row)
    );
    const wayIn = row?.buttons.filter(
      (b) => b === "Set key" || b === "Sign in"
    );
    kit.check(
      `${label}: ${one.state === "signed-in" ? "no way in" : "Set key"} on the row (${at})`,
      one.state === "signed-in"
        ? wayIn?.length === 0
        : JSON.stringify(wayIn) === JSON.stringify(["Set key"]),
      JSON.stringify(row?.buttons)
    );
  }
  kit.check(
    `nothing scrolls sideways; no row's controls past the card (${at})`,
    read.sideways <= 0 && read.rows.every((row) => row.past <= 0.5),
    JSON.stringify({
      sideways: read.sideways,
      past: read.rows.map((r) => r.past),
    })
  );
}

const githubRow = '[data-row-name="GitHub"]';

/** Set key on GitHub's row: the hub holds it; the page holds it nowhere. */
async function setKey(kit: Kit, fleet: KitFleet, page: Page) {
  await page.click(`${githubRow} .controls button:has-text("Set key")`);
  const field = page.locator(
    `${githubRow} form.row-ask input[type="password"]`
  );
  await field.fill(KEY);
  await page.click(`${githubRow} form.row-ask button[type="submit"]`);
  const held = await until(
    "the hub holds GitHub's key",
    async () => (await hubRows(fleet)).find((r) => r.name === "github-petra"),
    (row) => row?.hasSecret === true,
    30_000
  );
  await page.waitForFunction(
    (selector) => !document.querySelector(`${selector} form.row-ask`),
    githubRow,
    { timeout: 30_000 }
  );
  const left = await page.evaluate((key) => {
    const inputs = [...document.querySelectorAll("input, textarea")].filter(
      (el) => (el as HTMLInputElement).value.includes(key)
    ).length;
    return {
      inputs,
      markup: document.documentElement.outerHTML.includes(key),
    };
  }, KEY);
  kit.check(
    "Set key: the hub holds the key, and no input or markup on the page still does",
    held?.hasSecret === true && left.inputs === 0 && !left.markup,
    JSON.stringify({ hasSecret: held?.hasSecret, state: held?.state, ...left })
  );
}

/** Remove from GitHub's ⋯: asked on the row, then removed at the hub. */
async function removeOnRow(kit: Kit, fleet: KitFleet, page: Page) {
  await page.click(`${githubRow} .controls button[aria-label^="More"]`);
  await page.click('[role="menuitem"]:has-text("Remove")');
  await page.waitForSelector(`${githubRow} fieldset.row-ask`, {
    timeout: 10_000,
  });
  const ask = await page.evaluate((selector) => {
    const row = document.querySelector(selector);
    const fieldset = row?.querySelector("fieldset.row-ask");
    return {
      onRow: Boolean(fieldset && row?.contains(fieldset)),
      words: fieldset?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      dialogs: document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], dialog[open]'
      ).length,
    };
  }, githubRow);
  kit.check(
    "Remove asks on the row: a fieldset under it, no dialog",
    ask.onRow && ask.dialogs === 0 && ask.words.startsWith("Remove GitHub?"),
    JSON.stringify(ask)
  );
  await page.click(
    `${githubRow} fieldset.row-ask button:has-text("Remove connection")`
  );
  const gone = await until(
    "the hub removes github-petra",
    () => hubRows(fleet),
    (rows) => !rows.some((r) => r.name === "github-petra"),
    30_000
  );
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    githubRow,
    { timeout: 30_000 }
  );
  kit.check(
    "Remove connection removes it at the hub, and its row leaves",
    !gone.some((r) => r.name === "github-petra"),
    gone.map((r) => r.name).join(", ")
  );
}

/** With none: the line, a card per service; a card opens the form in the page. */
async function checkEmpty(
  kit: Kit,
  fleet: KitFleet,
  page: Page,
  at: string,
  press: boolean
) {
  const read = await page.evaluate(() => ({
    line:
      document
        .querySelector(".empty-line")
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? "",
    cards: [
      ...document.querySelectorAll('ul[aria-label="Services"] button'),
    ].map((b) => b.textContent?.trim()),
    sideways: document.scrollingElement
      ? document.scrollingElement.scrollWidth -
        document.scrollingElement.clientWidth
      : 0,
  }));
  kit.check(
    `empty: says signing in is yours, with a start card per service (${at})`,
    read.line.includes("signing in is yours") &&
      JSON.stringify(read.cards) ===
        JSON.stringify([
          "Sign in to GitHub",
          "Sign in to Linear",
          "Sign in to Slack",
        ]) &&
      read.sideways <= 0,
    JSON.stringify(read)
  );
  if (!press) {
    return;
  }
  await page.click(
    'ul[aria-label="Services"] button:has-text("Sign in to GitHub")'
  );
  await page.waitForSelector('form.add[aria-label="Sign in to GitHub"]', {
    timeout: 10_000,
  });
  const form = await page.evaluate(() => {
    const add = document.querySelector("form.add");
    return {
      fields: [...(add?.querySelectorAll("label") ?? [])].map((l) =>
        l.textContent?.trim()
      ),
      dialogs: document.querySelectorAll('[role="dialog"], dialog[open]')
        .length,
      underCards: Boolean(
        add &&
        document
          .querySelector('ul[aria-label="Services"]')
          ?.compareDocumentPosition(add) === Node.DOCUMENT_POSITION_FOLLOWING
      ),
      focused: document.activeElement?.id,
    };
  });
  kit.check(
    "empty: a card starts the sign-in in the page, under the cards, the account field focused, then the key",
    JSON.stringify(form.fields) ===
      JSON.stringify(["Which GitHub account", "GitHub key"]) &&
      form.dialogs === 0 &&
      form.underCards &&
      form.focused === "connection-account",
    JSON.stringify(form)
  );
  await page.fill("#connection-account", "Brand");
  await page.fill("#connection-key", KEY);
  await page.click('form.add button[type="submit"]');
  const made = await until(
    "the hub makes github-brand and holds its key",
    async () => (await hubRows(fleet)).find((r) => r.name === "github-brand"),
    (row) => row?.hasSecret === true,
    30_000
  );
  await page.waitForSelector(githubRow, { timeout: 30_000 });
  const left = await page.evaluate(
    (key) => ({
      inputs: [...document.querySelectorAll("input, textarea")].filter((el) =>
        (el as HTMLInputElement).value.includes(key)
      ).length,
      markup: document.documentElement.outerHTML.includes(key),
    }),
    KEY
  );
  kit.check(
    "empty: Sign in makes the connection at the hub with its key; its row stands, and no input or markup holds the key",
    made?.account === "Brand" &&
      made.hasSecret &&
      left.inputs === 0 &&
      !left.markup,
    JSON.stringify({
      account: made?.account,
      hasSecret: made?.hasSecret,
      ...left,
    })
  );
  // The rest of the widths read the hub with none again.
  await fetch(`${fleet.base}/api/connections/github-brand`, {
    method: "DELETE",
  });
}

const spec: Spec = {
  name: "connections",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    await stage(fleet);
    const base = await fleet.dashboard();
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
        const page = await kit.page(view, { theme });
        await openPage(page, base, '[data-row-name="Linear"] [data-state]');
        await checkRows(kit, fleet, page, `${view}, ${theme}`);
        if (view === "desk" && theme === "light") {
          await setKey(kit, fleet, page);
          await removeOnRow(kit, fleet, page);
          // The rest of the widths read the two again.
          await fleet.api("/api/connections", {
            name: "github-petra",
            service: "github",
            account: "petra",
            transport: "http",
            url: NOWHERE,
            auth: "bearer",
          });
        }
        await page.close();
      }
    }
    for (const name of ["linear-brand", "github-petra"]) {
      // biome-ignore lint/performance/noAwaitInLoops: one removal at a time
      await fetch(`${fleet.base}/api/connections/${name}`, {
        method: "DELETE",
      });
    }
    for (const theme of THEMES) {
      for (const view of VIEWS) {
        // biome-ignore lint/performance/noAwaitInLoops: one width and theme at a time
        const page = await kit.page(view, { theme });
        await openPage(page, base, 'ul[aria-label="Services"]');
        await checkEmpty(
          kit,
          fleet,
          page,
          `${view}, ${theme}`,
          view === "desk" && theme === "light"
        );
        await page.close();
      }
    }
  },
};

export default spec;
