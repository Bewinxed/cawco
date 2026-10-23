/**
 * Secrets in Find (hub find-secrets.ts; the owner's picks on "find-secrets",
 * 2026-10-22), on a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model), the dashboard on Chromium and WebKit, at the
 * desk (1440×900) and on a phone (390×844).
 *
 * Seeded: a session told a line that holds a made-up token-shaped secret (a
 * GitHub token's shape: never a real one) beside the word "walrus"; a second
 * session whose Bash call prints a word ("capybaraledger") no one says,
 * only its tool's output holds; a third, the agent that asks.
 *
 * a. Each leg: Find opened, "walrus" typed: the result's excerpt holds dots
 *    and not the secret's text, read from the DOM; a click on the dots shows
 *    exactly that secret in place, and opens nothing. At the desk, the list
 *    changing hides it again, and ↵ on its row shows it.
 * b. Each leg: "Hide secrets in Find" turned off on Configure › Devices: it
 *    is still off after a reload, and Find shows the secret plainly.
 * c. An agent's `find` answers the excerpt unmasked: no dots and no spans in
 *    its record, the secret itself `[redacted]` by the agents' filter.
 * d. An agent's `find` matches what a tool returned in another session; the
 *    person's `GET /api/find` matches what was said, not what tools returned.
 *
 *   bun scripts/probe-kit/run.ts find-secrets
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import { PRESENCE_ONBOARDING_SKIPPED } from "../../../packages/core/src/presence-onboarding";
import { findSecretWords } from "../../../packages/core/src/words/find-secrets";
import { shellWords } from "../../../packages/core/src/words/shell";
import { sidebarWords } from "../../../packages/core/src/words/sidebar";
import { toolRecord } from "../../lib/tool-call";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { bootFleet } from "../journeys/suite";
import type { Engine, Kit, KitFleet, Spec, View } from "../kit";
import { exactly } from "../words";

/** A made-up token in a GitHub token's shape (secretlint's GitHub rule): never a real one. */
const TOKEN = "ghp_Pr0beWalrusK3yNotRealAbCdEfGh1234IjK";
const SAID = `PROBE-SECRET the walrus deploy key is ${TOKEN} for the staging box.`;
const WORD = "walrus";
/** A word only a tool's output holds: the command that prints it never spells it. */
const OUTPUT_WORD = "capybaraledger";
const RUN = "PROBE-OUTPUT run the ledger check";
const FIND = "Find a session, or a task, preview, decision";
const JUMP = exactly(shellWords.jumpToSession);
const SHEET_SEARCH = "Search sessions, projects, machines";
const LEGS: { engine: Engine; view: View }[] = [
  { engine: "chromium", view: "desk" },
  { engine: "chromium", view: "phone" },
  { engine: "webkit", view: "desk" },
  { engine: "webkit", view: "phone" },
];
const INDEXED_MS = 120_000;

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Find secrets probe"] };
  }
  if (request.last.includes(RUN) && !request.all.includes(OUTPUT_WORD)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: "printf 'capy%sledger checked\\n' bara",
          description: "Ledger check",
        },
      },
    };
  }
  return { everyMs: 5, words: ["Noted."] };
};

interface Session {
  credential: string;
  id: string;
}

/** A session in `cwd`, its credential read from its process. */
const sessionIn = async (
  fleet: KitFleet,
  title: string,
  cwd: string,
  projectId: string
): Promise<Session> => {
  const id = await fleet.spawn("claude", title, cwd, { projectId });
  const environ = await Bun.file(
    `/proc/${await fleet.sessionPid(id)}/environ`
  ).text();
  const credential =
    environ
      .split("\0")
      .find((line) => line.startsWith("CAWCO_SESSION_CREDENTIAL="))
      ?.slice("CAWCO_SESSION_CREDENTIAL=".length) ?? "";
  return { id, credential };
};

/** `words` told to `id`, and its turn ended. */
const tell = async (fleet: KitFleet, id: string, words: string) => {
  await fleet.send(id, words);
  await until(
    `the reply to “${words.slice(0, 30)}”`,
    () =>
      fleet.seen.some((request) => request.last.includes(words)) &&
      fleet.instance(id)?.turn_open_at === null,
    Boolean,
    90_000
  ).catch(() => false);
};

interface Hits {
  hits?: { excerpt?: string; id: string }[];
}

interface Found {
  results: {
    id: string;
    kind: string;
    moments?: { excerpt: string; secrets?: unknown }[];
  }[];
}

const engineFind = async (fleet: KitFleet, q: string): Promise<Found> =>
  (await (
    await fetch(`${fleet.base}/api/find?${new URLSearchParams({ q })}`)
  ).json()) as Found;

const setHidden = (fleet: KitFleet, hideSecrets: boolean) =>
  fetch(`${fleet.base}/api/find/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hideSecrets }),
  });

/** A switch's `aria-checked`, or null while it is not drawn. */
const checkedOf = async (toggle: Locator): Promise<string | null> => {
  try {
    return await toggle.getAttribute("aria-checked", { timeout: 2000 });
  } catch {
    return null;
  }
};

/** Opens Find: the bar's Jump on a wide screen, the sheet's search on a phone. */
const openFind = async (page: Page) => {
  const bar = page
    .getByRole("button", { name: JUMP })
    .filter({ visible: true });
  if ((await bar.count()) > 0) {
    await bar.first().click();
  } else {
    await page
      .getByRole("button", { name: sidebarWords.openNavigation })
      .click();
    await page.getByRole("button", { name: SHEET_SEARCH }).click();
  }
  const field = page.getByRole("combobox", { name: FIND });
  await field.waitFor({ state: "visible", timeout: 30_000 });
  await field.click();
  await field.fill(WORD);
};

/** What the result row of `id` draws, read from the DOM once every machine answered. */
const readRow = async (page: Page, id: string) => {
  const row = page.locator(`[data-key="conversation:${id}"]`).first();
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await page
    .locator('[data-slot="covered"]')
    .first()
    .waitFor({ state: "visible", timeout: 30_000 })
    .catch(() => undefined);
  return row;
};

/** The active row's result key, as the field names it its active descendant. */
const activeKey = (page: Page) =>
  page.evaluate((label) => {
    const field = document.querySelector(`[aria-label="${label}"]`);
    const id = field?.getAttribute("aria-activedescendant");
    return id
      ? (document
          .getElementById(id)
          ?.closest("[data-key]")
          ?.getAttribute("data-key") ?? null)
      : null;
  }, FIND);

/**
 * a, by the keys: the list changes (the words typed again) and the shown
 * secret hides; ↓ to its row and ↵ shows it, in place.
 */
const enterLeg = async (kit: Kit, page: Page, name: string, id: string) => {
  const field = page.getByRole("combobox", { name: FIND });
  await field.fill(`${WORD} `);
  const row = await readRow(page, id);
  const hidAgain = await until(
    "the shown secret hidden again",
    () =>
      row.evaluate(
        (node) =>
          node.querySelectorAll('[data-slot="secret"][data-shown]').length
      ),
    (count) => count === 0,
    15_000
  ).catch(() => undefined);
  for (let step = 0; step < 12; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one key at a time, as the person presses them
    if ((await activeKey(page)) === `conversation:${id}`) {
      break;
    }
    await page.keyboard.press("ArrowDown");
  }
  const reached = await activeKey(page);
  await page.keyboard.press("Enter");
  const shown = await until(
    "the secret shown by ↵",
    () =>
      row.evaluate((node) =>
        [...node.querySelectorAll('[data-slot="secret"][data-shown]')].map(
          (each) => each.textContent
        )
      ),
    (texts) => texts.length === 1,
    10_000
  ).catch(() => undefined);
  kit.check(
    `a ${name}: once the list changes the secret hides again; ↵ on its row shows exactly it, and Find stays open`,
    hidAgain === 0 &&
      reached === `conversation:${id}` &&
      shown?.[0] === TOKEN &&
      (await field.isVisible()),
    `hidden again ${hidAgain}, active ${reached}, shown ${JSON.stringify(shown)}`
  );
};

const leg = async (
  kit: Kit,
  fleet: KitFleet,
  base: string,
  at: { engine: Engine; view: View },
  secretId: string
) => {
  const name = `${at.engine} ${at.view}`;
  const page = await kit.page(at.view, {
    engine: at.engine,
    init: [
      {
        content: `localStorage.setItem(${JSON.stringify(PRESENCE_ONBOARDING_SKIPPED.key)}, ${JSON.stringify(PRESENCE_ONBOARDING_SKIPPED.value)});`,
      },
    ],
  });
  await setHidden(fleet, true);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await openFind(page);
  const row = await readRow(page, secretId);
  const masked = row.locator('[data-slot="secret"]:not([data-shown])');
  await masked.first().waitFor({ state: "visible", timeout: 30_000 });
  const before = await row.evaluate((node) => ({
    text: node.textContent ?? "",
    dots: [
      ...node.querySelectorAll('[data-slot="secret"]:not([data-shown])'),
    ].map((each) => ({
      text: each.textContent,
      name: each.getAttribute("aria-label"),
    })),
  }));
  kit.check(
    `a ${name}: the excerpt shows dots of a fixed length, named a hidden secret, and not the secret's text`,
    before.dots.length > 0 &&
      before.dots.every(
        (dot) =>
          dot.text === findSecretWords.dots &&
          dot.name === findSecretWords.hidden
      ) &&
      !before.text.includes(TOKEN) &&
      before.text.toLowerCase().includes(WORD),
    JSON.stringify(before)
  );
  const url = page.url();
  await masked.first().click();
  const shown = row.locator('[data-slot="secret"][data-shown]');
  const revealed = await shown
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const after = await row.evaluate((node) => ({
    shown: [...node.querySelectorAll('[data-slot="secret"][data-shown]')].map(
      (each) => each.textContent
    ),
    hidden: node.querySelectorAll('[data-slot="secret"]:not([data-shown])')
      .length,
  }));
  kit.check(
    `a ${name}: a click on the dots shows exactly that secret in place, and opens nothing`,
    revealed &&
      after.shown.length === 1 &&
      after.shown[0] === TOKEN &&
      after.hidden === before.dots.length - 1 &&
      page.url() === url,
    `${JSON.stringify(after)} at ${page.url()} (was ${url})`
  );

  if (at.view === "desk") {
    await enterLeg(kit, page, name, secretId);
  }

  // b: the setting off, where the person's settings live, kept across a reload.
  await page.goto(`${base}/config/devices`, { waitUntil: "domcontentloaded" });
  const toggle = page.getByRole("switch", { name: findSecretWords.setting });
  await until(
    "the setting read",
    () => checkedOf(toggle),
    (checked) => checked === "true",
    30_000
  ).catch(() => undefined);
  await toggle.click();
  const kept = await until(
    "the hub keeps it off",
    async () =>
      (await (await fetch(`${fleet.base}/api/find/settings`)).json()) as {
        hideSecrets: boolean;
      },
    (read) => read.hideSecrets === false,
    10_000
  ).catch(() => undefined);
  await page.reload({ waitUntil: "domcontentloaded" });
  const afterReload = await until(
    "the switch after a reload",
    () => checkedOf(toggle),
    (checked) => checked !== null && checked !== undefined,
    30_000
  ).catch(() => null);
  kit.check(
    `b ${name}: turned off on Configure › Devices, the hub keeps it off and the switch is still off after a reload`,
    kept !== undefined && afterReload === "false",
    `hub ${JSON.stringify(kept)}, switch after reload ${afterReload}`
  );
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await openFind(page);
  const plainRow = await readRow(page, secretId);
  const plain = await until(
    "the excerpt with the secret drawn plainly",
    () =>
      plainRow.evaluate((node) => ({
        text: node.textContent ?? "",
        secrets: node.querySelectorAll('[data-slot="secret"]').length,
      })),
    (read) => read.text.includes(TOKEN),
    30_000
  ).catch(() => undefined);
  kit.check(
    `b ${name}: with it off, Find shows the secret's words plainly, no dots`,
    plain !== undefined && plain.secrets === 0,
    JSON.stringify(plain)
  );
  await setHidden(fleet, true);
  await page.close();
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  await bootFleet(fleet);
  const cwd = join(fleet.workdir, "secrets-probe");
  await mkdir(cwd, { recursive: true });
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Secrets probe",
    machineId: MACHINE,
    cwd,
    caw: false,
  });
  const secret = await sessionIn(fleet, "Staging notes", cwd, project.id);
  await tell(fleet, secret.id, SAID);
  const tooled = await sessionIn(fleet, "Ledger run", cwd, project.id);
  await tell(fleet, tooled.id, RUN);
  const asker = await sessionIn(fleet, "Asker", cwd, project.id);

  const held = await until(
    "the secret's turn in /api/find",
    () => engineFind(fleet, WORD),
    (answer) =>
      answer.results.some(
        (result) => result.id === secret.id && (result.moments?.length ?? 0) > 0
      ),
    INDEXED_MS
  ).catch(() => undefined);
  kit.check(
    "the machine's index holds the secret's turn, and the hub names its secret in the excerpt",
    held?.results.some(
      (result) =>
        result.id === secret.id &&
        result.moments?.some((moment) => Array.isArray(moment.secrets))
    ) ?? false,
    JSON.stringify(held?.results ?? "never held").slice(0, 900)
  );

  // c and d: an agent's find, through the hub's tool door as the asker.
  const door = { base: fleet.base, id: asker.id, credential: asker.credential };
  const agentSecret = await toolRecord<Hits>(door, "find", {
    query: WORD,
    project: "all",
  });
  const record = agentSecret.refused ? "" : JSON.stringify(agentSecret.record);
  const secretHit = agentSecret.refused
    ? undefined
    : agentSecret.record.hits?.find((hit) => hit.id === secret.id);
  kit.check(
    "c: an agent's find answers the excerpt unmasked: no dots and no secret spans, the secret [redacted] by the agents' filter",
    Boolean(
      secretHit?.excerpt?.toLowerCase().includes(WORD) &&
      secretHit.excerpt.includes("[redacted]")
    ) &&
      !record.includes(findSecretWords.dots) &&
      !record.includes('"secrets"') &&
      !record.includes(TOKEN),
    record.slice(0, 900) || agentSecret.text.slice(0, 900)
  );
  const agentOutput = await until(
    "the tool's output in an agent's find",
    () =>
      toolRecord<Hits>(door, "find", { query: OUTPUT_WORD, project: "all" }),
    (read) =>
      !read.refused &&
      (read.record.hits ?? []).some((hit) => hit.id === tooled.id),
    INDEXED_MS
  ).catch(() => undefined);
  const outputHit =
    agentOutput && !agentOutput.refused
      ? agentOutput.record.hits?.find((hit) => hit.id === tooled.id)
      : undefined;
  const personOutput = await engineFind(fleet, OUTPUT_WORD);
  kit.check(
    "d: an agent's find matches what a tool returned in another session, its excerpt cut from that output",
    Boolean(outputHit?.excerpt?.toLowerCase().includes(OUTPUT_WORD)),
    agentOutput ? agentOutput.text.slice(0, 900) : "never found"
  );
  kit.check(
    "d: the person's GET /api/find matches what was said, not what tools returned",
    !personOutput.results.some(
      (result) => result.id === tooled.id && (result.moments?.length ?? 0) > 0
    ),
    JSON.stringify(personOutput.results).slice(0, 900)
  );

  const base = await fleet.dashboard();
  for (const at of LEGS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, on one fleet
    await leg(kit, fleet, base, at, secret.id);
  }
};

export default { name: "find-secrets", run } satisfies Spec;
