/**
 * Config → Skills says each skill's and plugin's version, when its source
 * holds something newer, and what a refresh came to (FleetVersioned in
 * @cawco/core; hub server.ts `fetchSkill`, `fetchPlugins`, `checkSources`).
 *
 * On a scratch fleet (real hub, agent and sessiond), the built dashboard:
 *
 * - A skill whose SKILL.md this spec serves on 127.0.0.1, as a one-shot file
 *   server installs one: its meta line names its version 1.0.0; its menu
 *   offers no Fetch again; Check for updates never reads it, and clears the
 *   ECONNREFUSED an earlier check left on it (core `isLoopbackSource`), so
 *   the row says nothing about updates.
 * - Two skills from the owner's own multi-skill GitHub repos, as the live
 *   fleet holds them, each by its bare source: apple-web-app from
 *   `skills:joe-bell/skills` (installed bare, the row's name picking it) and
 *   hairline from `skills:lucasmarkes/hairline` (installed picked, then its
 *   source made bare, its SKILL.md declaring `hairline-create`). Check for
 *   updates reads each as the skill the row holds: no "repo has several
 *   skills", what the source holds is the row's own copy.
 * - Fetch again on apple-web-app: "Already on latest (…) · just now", the
 *   frame's outcome `unchanged`, no machine told (the agent takes no sync:
 *   no `[fleet] sync from the hub`).
 * - Its stored copy made older (its hash changed in the hub's database), then
 *   Check for updates: the badge "Update available · a → b" (a status, not a
 *   button) and its Fetch update; pressed, "Updated a → b · just now", and
 *   no delta sent: the machine already holds that copy.
 * - A plugin from a marketplace on the hub's disk (`plugin.json` 1.0.0): its
 *   version, its update to 1.1.0 found and fetched; its source broken, Fetch
 *   again keeps its last good hash and files, says "Couldn't update: …" and
 *   tells no machine.
 * - The plugin at a nightly-long version on a phone, at 390px and 320px: the
 *   badge, its action and the outcome note inside the row, nothing scrolling
 *   sideways, the name kept.
 * - The loopback skill edited on the machine, then Overwrite pressed while
 *   a slow converge runs (an npx row whose registry answers after 8 s) and
 *   a sync asked at once behind it: the forced item stays forced on the
 *   machine until a converge writes it (agent fleet-desired.ts), and the
 *   machine's file ends equal to the fleet's. Main lost the Overwrite.
 *
 * Each row's rendered text is printed, and a capture of it kept in the run's
 * out dir. The GitHub legs read github.com, as the live check does.
 *
 *   bun scripts/probe-kit/run.ts skill-updates
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import type { FleetPlugin, FleetSkillMeta } from "../../../packages/core/src";
import { projectClaudeDir } from "../../../packages/core/src/paths";
import { MACHINE, type Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

/** Served on 127.0.0.1: a one-shot install source, never read for updates. */
const LOCAL = "probe-local";
/** `skills:joe-bell/skills` holds apple-web-app, elron and letterboxd-diary. */
const MULTI = "apple-web-app";
const MULTI_SOURCE = "skills:joe-bell/skills";
/** `skills:lucasmarkes/hairline` holds hairline-adopt and hairline-create. */
const HAIRLINE = "hairline";
const HAIRLINE_SOURCE = "skills:lucasmarkes/hairline";
const MARKETPLACE = "version-plugins";
const PLUGIN = "versioned-plugin";
const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;
/** The agent's word that it took a fleet sync (agent session.ts). */
const SYNC_LINE = "[fleet] sync from the hub";
/** How long a sync the hub sent takes to reach the agent's log, at most, here. */
const TOLD_MS = 5000;
/** An npx row whose registry (this spec's) answers every read after {@link SLOW_REGISTRY_MS}: a sync that converges slowly. */
const SLOW_NPM = "probe-slow-npm";
const SLOW_REGISTRY_MS = 8000;
const UPDATE_CHIP = /^Update available/;
const SEVERAL = "several skills";
/** A version as long as a nightly's, to hold the row's edges against. */
const LONG_VERSION = "2026.10.21-nightly.4627+abcdef0";
const LINE_BREAKS = /\s*\n\s*/g;
/** A content hash no source holds: a stored copy older than its source's. */
const OLDER = "0".repeat(64);

interface Snapshot {
  config: { plugins: FleetPlugin[] };
  skills: FleetSkillMeta[];
}

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const skillMd = (version: string) =>
  `---\nname: ${LOCAL}\ndescription: says its version\nversion: ${version}\n---\nVersion ${version}.\n`;

/** Polls `read` until `accept` holds or `ms` runs out; the last value either way. */
async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  ms = 120_000
): Promise<{ ok: boolean; value: T }> {
  const deadline = Date.now() + ms;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll, one read at a time
    const value = await read();
    if (accept(value) || Date.now() > deadline) {
      return { ok: accept(value), value };
    }
    await Bun.sleep(250);
  }
}

const fleetOf = (fleet: KitFleet) => fleet.api<Snapshot>("/api/fleet");
const skillOf = async (fleet: KitFleet, name: string) =>
  (await fleetOf(fleet)).skills.find((one) => one.name === name);
const pluginOf = async (fleet: KitFleet) =>
  (await fleetOf(fleet)).config.plugins.find((one) => one.id === PLUGIN_ID);

const send = async (
  fleet: KitFleet,
  method: "POST" | "PUT",
  path: string,
  body?: unknown
) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${await response.text()}`
    );
  }
  return await response.json();
};

/** A skill stored from `source`, once its fetch has landed with files. */
async function install(
  fleet: KitFleet,
  name: string,
  source: string
): Promise<FleetSkillMeta | undefined> {
  await send(fleet, "PUT", `/api/fleet/skills/${name}`, { source });
  return (
    await until(
      () => skillOf(fleet, name),
      (row) => Boolean(row?.hash || row?.error)
    )
  ).value;
}

const rowOf = (page: Page, name: string): Locator =>
  page.locator(`li[data-row-name="${name}"]`);

/** The row's rendered text, said in the run's output, and a capture of it kept. */
async function readRow(
  kit: Kit,
  page: Page,
  name: string,
  state: string
): Promise<string> {
  const row = rowOf(page, name);
  const text = (await row.innerText()).replace(LINE_BREAKS, " | ");
  kit.note(`${name} [${state}]: ${text}`);
  await row.screenshot({ path: join(kit.out, `${state}.png`) });
  return text;
}

/** Waits for `words` in the row; whether they came. */
const rowSays = (page: Page, name: string, words: string) =>
  rowOf(page, name)
    .getByText(words, { exact: false })
    .first()
    .waitFor({ timeout: 120_000 })
    .then(
      () => true,
      () => false
    );

const openMenu = async (page: Page, name: string) => {
  await page.getByRole("button", { name: `More for ${name}` }).click();
};

async function fetchAgain(page: Page, name: string) {
  await openMenu(page, name);
  await page.getByRole("menuitem", { name: "Fetch again" }).click();
}

/** Check for updates pressed; resolves once the hub says the check ended. */
const checkNow = (fleet: KitFleet, page: Page) =>
  fleet.fetched(
    (frame) => frame.check,
    () => page.getByRole("button", { name: "Check for updates" }).click()
  );

/** A marketplace with one plugin at `version`, on the hub's disk. */
async function market(fleet: KitFleet, version: string): Promise<string> {
  const source = join(fleet.sandbox, "version-market");
  const dir = join(source, "plugins", PLUGIN);
  await Bun.write(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: MARKETPLACE,
      owner: { name: "probe" },
      plugins: [{ name: PLUGIN, source: `./plugins/${PLUGIN}` }],
    })
  );
  await Bun.write(
    join(dir, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: PLUGIN, version })
  );
  await Bun.write(
    join(dir, "skills", "noop", "SKILL.md"),
    `---\nname: noop\ndescription: does nothing\n---\nNothing at ${version}.\n`
  );
  return source;
}

const probe = async (kit: Kit) => {
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(skillMd("1.0.0")),
  });
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  const base = await fleet.dashboard();
  const page = await kit.page("desk");
  const on = { kit, fleet, page, base };

  await loopback(on, `${server.url.origin}/${LOCAL}/SKILL.md`);
  await server.stop(true);
  await overwrite(on);
  await multiSkill(on);
  await plugin(on);
  await page.close();
  await phone(on);
};

/** What each leg works on. */
interface On {
  base: string;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
}

/** A skill served on 127.0.0.1: its version shown, never fetched again or checked. */
async function loopback({ kit, fleet, page, base }: On, source: string) {
  const first = await install(fleet, LOCAL, source);
  kit.check(
    "loopback: the skill is stored, version 1.0.0",
    first?.version === "1.0.0" && Boolean(first.hash),
    JSON.stringify(first)
  );
  // What the live fleet's first check left on such a row.
  fleet.write(
    "UPDATE skills SET check_error = ?, checked_at = ? WHERE name = ?",
    `connect ECONNREFUSED ${new URL(source).host}`,
    Date.now() - 60_000,
    LOCAL
  );
  kit.check(
    "loopback: before the check, the hub holds what the earlier check left",
    (await skillOf(fleet, LOCAL))?.checkError?.includes("ECONNREFUSED") === true
  );
  await open(page, `${base}/config/skills`, `li[data-row-name="${LOCAL}"]`);
  await checkNow(fleet, page);
  const after = await skillOf(fleet, LOCAL);
  kit.check(
    "loopback: the check reads nothing from it and clears what was left",
    after !== undefined &&
      after.checkedAt === undefined &&
      after.checkError === undefined &&
      after.latestHash === undefined &&
      after.updateAvailable === undefined &&
      after.hash === first?.hash,
    JSON.stringify(after)
  );
  const text = await readRow(kit, page, LOCAL, "loopback-row");
  kit.check(
    "loopback: the row names 1.0.0 and says nothing about updates",
    text.includes("1.0.0") &&
      !text.includes("Couldn't check") &&
      !text.includes("Update available") &&
      !text.includes("Already on latest"),
    text
  );
  await openMenu(page, LOCAL);
  const items = await page.getByRole("menuitem").allInnerTexts();
  kit.check(
    "loopback: its menu offers no Fetch again",
    items.length > 0 && !items.some((item) => item.includes("Fetch again")),
    items.join(" / ")
  );
  await page.keyboard.press("Escape");
}

/**
 * The agent's lines since `mark` once any sync the hub sent has had time to
 * reach it ({@link TOLD_MS}).
 */
const agentSince = async (mark: { since: () => Promise<string> }) => {
  await Bun.sleep(TOLD_MS);
  return await mark.since();
};

/** Waits for the agent's word that it took a sync since `mark`; its lines. */
const agentTook = async (mark: { since: () => Promise<string> }) =>
  (
    await until(
      () => mark.since(),
      (log) => log.includes(SYNC_LINE),
      60_000
    )
  ).value;

/**
 * The loopback skill edited on the machine, then the fleet's copy forced
 * over it while another delta's converge runs, and a sync asked at once
 * behind it: the forced item goes as a delta item, the agent keeps it
 * forced until a converge writes it, whatever comes meanwhile (agent
 * fleet-desired.ts), and the machine's file ends equal to the fleet's.
 */
async function overwrite({ kit, fleet }: On) {
  const file = projectClaudeDir(fleet.home, "skills", LOCAL, "SKILL.md");
  const fleetCopy = skillMd("1.0.0");
  const read = () =>
    Bun.file(file)
      .text()
      .catch(() => "");
  const held = await until(read, (text) => text === fleetCopy);
  kit.check(
    "overwrite: the machine holds the fleet's copy of the skill",
    held.ok,
    JSON.stringify(held.value)
  );
  await Bun.write(file, `${fleetCopy}\nEdited on the machine.\n`);

  const registry = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async () => {
      await Bun.sleep(SLOW_REGISTRY_MS);
      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });
  const hubMark = await fleet.logMark("hub");
  const agentMark = await fleet.logMark("agent");
  try {
    // The row's PUT sends a sync whose converge waits on the registry.
    await send(fleet, "PUT", `/api/fleet/mcp/${SLOW_NPM}`, {
      config: {
        command: "npx",
        args: ["-y", `${SLOW_NPM}@latest`],
        env: { npm_config_registry: registry.url.href },
      },
      enabled: true,
    });
    await until(
      () => agentMark.since(),
      (text) => text.includes(SYNC_LINE),
      30_000
    );
    // Overwrite, then another sync behind it while the first still converges.
    await send(fleet, "POST", `/api/fleet/skills/${LOCAL}/push`, {
      machineId: MACHINE,
    });
    await send(fleet, "POST", "/api/fleet/sync", { machineId: MACHINE });
    const after = await until(read, (text) => text === fleetCopy);
    const log = await hubMark.since();
    const syncs = log
      .split("\n")
      .filter((line) => line.includes("[fleet] "))
      .join(" / ");
    kit.check(
      "overwrite: the Overwrite went to the machine as a delta while another converge ran",
      log.includes(`an overwrite of skill ${LOCAL}`) &&
        log.includes("[fleet] delta rev"),
      syncs
    );
    kit.check(
      "overwrite: an Overwrite followed at once by another sync leaves the machine's file equal to the fleet's",
      after.ok,
      `${JSON.stringify(after.value)} / ${syncs}`
    );
  } finally {
    // Its removal is a sync too: taken before the next leg counts syncs.
    const removed = await fleet.logMark("agent");
    await fetch(`${fleet.base}/api/fleet/mcp/${SLOW_NPM}`, {
      method: "DELETE",
    });
    await agentTook(removed);
    await registry.stop(true);
  }
}

/** The owner's two multi-skill repos, each row by its bare source. */
async function multiSkill({ kit, fleet, page }: On) {
  const multi = await install(fleet, MULTI, MULTI_SOURCE);
  kit.check(
    "multi-skill: installed by its bare source, the row's name picks the skill",
    Boolean(multi?.hash) && multi?.error === undefined,
    JSON.stringify(multi)
  );
  const picked = await install(
    fleet,
    HAIRLINE,
    `${HAIRLINE_SOURCE}@hairline-create`
  );
  // As the live row stands: the bare source, the files hairline-create's.
  fleet.write(
    "UPDATE skills SET source = ? WHERE name = ?",
    HAIRLINE_SOURCE,
    HAIRLINE
  );
  kit.check(
    "multi-skill: hairline stored, then its source made bare",
    Boolean(picked?.hash) &&
      (await skillOf(fleet, HAIRLINE))?.source === HAIRLINE_SOURCE
  );
  await checkNow(fleet, page);
  for (const name of [MULTI, HAIRLINE]) {
    // biome-ignore lint/performance/noAwaitInLoops: one row at a time, read after the one check
    const row = await skillOf(fleet, name);
    kit.check(
      `multi-skill: the check reads ${name} as the skill it holds, unchanged`,
      row?.checkError === undefined &&
        row?.latestHash === row?.hash &&
        row?.checkedAt !== undefined &&
        row.updateAvailable === undefined,
      JSON.stringify({ ...row, source: row?.source })
    );
    const text = await readRow(kit, page, name, `multi-${name}-checked`);
    kit.check(
      `multi-skill: ${name}'s row says no "${SEVERAL}"`,
      !(text.includes(SEVERAL) || text.includes("Couldn't check")),
      text
    );
  }

  // Fetch again, nothing new.
  let mark = await fleet.logMark("hub");
  let agentMark = await fleet.logMark("agent");
  const unchanged = await fleet.fetched(
    (frame) => (frame.skill?.name === MULTI ? frame.skill : undefined),
    () => fetchAgain(page, MULTI)
  );
  kit.check(
    "multi-skill: Fetch again lands outcome unchanged",
    unchanged.lastRefresh?.outcome === "unchanged" &&
      unchanged.error === undefined,
    JSON.stringify(unchanged.lastRefresh)
  );
  kit.check(
    "multi-skill: the row says Already on latest (…) · just now",
    await rowSays(page, MULTI, "· just now")
  );
  await readRow(kit, page, MULTI, "multi-already-latest");
  let log = await mark.since();
  let agentLog = await agentSince(agentMark);
  kit.check(
    "multi-skill: the unchanged fetch tells no machine",
    log.includes(`skill ${MULTI}: unchanged`) && !agentLog.includes(SYNC_LINE),
    told(log, agentLog, MULTI)
  );

  // Its stored copy made older: the check finds the update.
  const current = unchanged.hash ?? "";
  fleet.write("UPDATE skills SET hash = ? WHERE name = ?", OLDER, MULTI);
  await checkNow(fleet, page);
  const badge = `Update available · ${OLDER.slice(0, 7)} → ${current.slice(0, 7)}`;
  kit.check(
    `multi-skill: the row's badge says ${badge}`,
    await rowSays(page, MULTI, badge)
  );
  kit.check(
    "multi-skill: the badge is a status, not a button; its action is Fetch update",
    (await rowOf(page, MULTI)
      .getByRole("button", { name: UPDATE_CHIP })
      .count()) === 0 && (await updateButton(page, MULTI).count()) === 1
  );
  await readRow(kit, page, MULTI, "multi-update-available");
  mark = await fleet.logMark("hub");
  agentMark = await fleet.logMark("agent");
  await updateButton(page, MULTI).click();
  const updated = `Updated ${OLDER.slice(0, 7)} → ${current.slice(0, 7)} · just now`;
  kit.check(
    `multi-skill: the row says ${updated}`,
    await rowSays(page, MULTI, updated)
  );
  const landed = await skillOf(fleet, MULTI);
  kit.check(
    "multi-skill: the update lands: the source's copy, no update available, the badge gone",
    landed?.hash === current &&
      landed.updateAvailable === undefined &&
      (await updateButton(page, MULTI).count()) === 0,
    JSON.stringify(landed?.lastRefresh)
  );
  await readRow(kit, page, MULTI, "multi-updated");
  agentLog = await agentSince(agentMark);
  log = await mark.since();
  // The machine holds the source's copy already (the hub's stored hash was
  // made older in its database alone): the hub builds the machine's items
  // again and sends nothing, as nothing it holds moved (hub fleet-sync.ts).
  kit.check(
    "multi-skill: the hub weighs the changed copy against what the machine holds, and sends nothing it holds already",
    log.includes(`skill ${MULTI}: the fleet's copy changed`) &&
      log.includes("[fleet] no delta for") &&
      !agentLog.includes(SYNC_LINE),
    told(log, agentLog, MULTI)
  );
}

/** A plugin from a marketplace on the hub's disk: found, fetched, and kept when its source breaks. */
async function plugin({ kit, fleet, page }: On) {
  const source = await market(fleet, "1.0.0");
  await fleet.fetched(
    (frame) => (frame.link?.source === source ? frame.link : undefined),
    () => fleet.api("/api/fleet/marketplace-links", { source })
  );
  await send(fleet, "PUT", `/api/fleet/plugins/${PLUGIN_ID}`, {
    enabled: true,
  });
  const installed = await until(
    () => pluginOf(fleet),
    (row) => Boolean(row?.hash)
  );
  kit.check(
    "plugin: the hub reads its plugin.json version",
    installed.value?.version === "1.0.0",
    JSON.stringify(installed.value)
  );
  kit.check(
    "plugin: its meta line names 1.0.0",
    await rowSays(page, PLUGIN_ID, "1.0.0")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-version-shown");

  await market(fleet, "1.1.0");
  await checkNow(fleet, page);
  kit.check(
    "plugin: the badge says Update available · 1.0.0 → 1.1.0",
    await rowSays(page, PLUGIN_ID, "Update available · 1.0.0 → 1.1.0")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-update-available");
  await updateButton(page, PLUGIN_ID).click();
  kit.check(
    "plugin: the row says Updated 1.0.0 → 1.1.0 · just now",
    await rowSays(page, PLUGIN_ID, "Updated 1.0.0 → 1.1.0 · just now")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-updated");

  // Its source broken: Fetch again keeps the last good copy.
  const held = () =>
    fleet.query<{ files: number; hash: string }>(
      "SELECT hash, length(files) AS files FROM plugins WHERE id = ?",
      PLUGIN_ID
    )[0];
  const good = held();
  await rm(join(source, "plugins", PLUGIN), { recursive: true, force: true });
  // The update's delta goes 250 ms after the hub's word (its debounce): let
  // it land before the failed refresh is counted.
  await Bun.sleep(TOLD_MS);
  const mark = await fleet.logMark("hub");
  const agentMark = await fleet.logMark("agent");
  const failed = await fleet.fetched(
    (frame) => (frame.plugin?.id === PLUGIN_ID ? frame.plugin : undefined),
    () => fetchAgain(page, PLUGIN_ID)
  );
  const kept = held();
  kit.check(
    "plugin: a failed refresh keeps its hash and files, and says it failed",
    failed.lastRefresh?.outcome === "failed" &&
      failed.hash === good?.hash &&
      kept?.hash === good?.hash &&
      kept?.files === good?.files &&
      (good?.files ?? 0) > 0,
    `before ${JSON.stringify(good)}, after ${JSON.stringify(kept)}, refresh ${JSON.stringify(failed.lastRefresh)}`
  );
  kit.check(
    "plugin: the row says Couldn't update: …",
    await rowSays(page, PLUGIN_ID, "Couldn't update: ")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-update-failed");
  const log = await mark.since();
  const agentLog = await agentSince(agentMark);
  kit.check(
    "plugin: the failed refresh tells no machine",
    log.includes(`plugin ${PLUGIN_ID}: failed`) &&
      !agentLog.includes(SYNC_LINE),
    told(log, agentLog, PLUGIN_ID)
  );
}

/** The plugin at a nightly-long version on a phone: nothing leaves the row. */
async function phone({ kit, fleet, base }: On) {
  await market(fleet, LONG_VERSION);
  await fleet.fetched(
    (frame) => frame.check,
    () => fleet.api("/api/fleet/updates/check", {})
  );
  const page = await kit.page("phone");
  await open(page, `${base}/config/skills`, `li[data-row-name="${PLUGIN_ID}"]`);
  kit.check(
    "phone: the plugin's badge names the long version",
    await rowSays(page, PLUGIN_ID, `→ ${LONG_VERSION}`)
  );
  for (const width of [390, 320]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, on one page
    await page.setViewportSize({ width, height: 844 });
    await fitsRow(kit, page, PLUGIN_ID, `badge at ${width}px`);
  }
  await updateButton(page, PLUGIN_ID).click();
  kit.check(
    "phone: the note names the long version",
    await rowSays(page, PLUGIN_ID, `Updated 1.1.0 → ${LONG_VERSION}`)
  );
  for (const width of [320, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, on one page
    await page.setViewportSize({ width, height: 844 });
    await fitsRow(kit, page, PLUGIN_ID, `note at ${width}px`);
  }
  await page.close();
}

/** The row's Fetch update, the update badge's action. */
const updateButton = (page: Page, name: string) =>
  rowOf(page, name).getByRole("button", { name: "Fetch update" });

/** The hub's lines about `what` and the syncs the agent took, for a check's detail. */
const told = (log: string, agentLog: string, what: string) =>
  [
    ...log.split("\n").filter((line) => line.includes(what)),
    ...agentLog.split("\n").filter((line) => line.includes(SYNC_LINE)),
  ].join(" / ");

/**
 * Every drawn part of the skill's row (its meta line, the update badge and
 * its action, the note) inside the row's box, the row and the page with
 * nothing to scroll sideways: read off the engine, then a capture kept. A
 * control's touch area under a finger (`touch-hit`, 44px, DESIGN.md "without
 * changing its drawn size") may reach past the row into the page's gutter,
 * so the row's own overflow is read with those areas off (`scrollBare`), and
 * each that reaches past the row must stand on the screen (`hits`).
 */
async function fitsRow(
  kit: Kit,
  page: Page,
  name: string,
  leg: string
): Promise<void> {
  const read = await page.evaluate((key) => {
    const row = document.querySelector(
      `li[data-row-name="${CSS.escape(key)}"]`
    );
    const doc = document.scrollingElement;
    if (!(row instanceof HTMLElement && doc)) {
      return;
    }
    const box = row.getBoundingClientRect();
    const parts = [
      ...row.querySelectorAll<HTMLElement>(
        '[data-slot="name"], [data-slot="meta"], [data-slot="badge"], [data-slot="update"] button, [data-slot="note"]'
      ),
    ].map((part) => {
      const at = part.getBoundingClientRect();
      return {
        part: part.dataset.slot ?? part.tagName.toLowerCase(),
        left: Math.round(at.left),
        right: Math.round(at.right),
        width: Math.round(at.width),
        inside: at.left >= box.left - 0.5 && at.right <= box.right + 0.5,
      };
    });
    // What reaches past the row's edge, by its slot or tag: what to fix.
    const past = [...row.querySelectorAll<HTMLElement>("*")]
      .filter((el) => el.getBoundingClientRect().right > box.right + 0.5)
      .map(
        (el) =>
          `${el.dataset.slot ?? el.tagName.toLowerCase()}:${Math.round(el.getBoundingClientRect().left)}-${Math.round(el.getBoundingClientRect().right)}`
      );
    // The same with every ::before/::after (a touch hit area) gone: whether
    // a sideways overflow is a drawn part's or only an invisible hit area's.
    const bare = document.createElement("style");
    bare.textContent = "*::before, *::after { display: none }";
    document.head.append(bare);
    const scrollBare = row.scrollWidth;
    bare.remove();
    // Each hit area that reaches past the row: its owner and how far.
    const hits = [...row.querySelectorAll<HTMLElement>("*")].flatMap((el) => {
      const after = getComputedStyle(el, "::after");
      if (after.position !== "absolute" || after.content === "none") {
        return [];
      }
      const reach =
        el.getBoundingClientRect().right -
        Number.parseFloat(after.right) +
        Number.parseFloat(after.translate.split(" ")[0] || "0");
      return reach > box.right
        ? [
            {
              owner: el.dataset.slot ?? el.tagName.toLowerCase(),
              reach: Math.round(reach * 10) / 10,
              onScreen: reach <= document.documentElement.clientWidth,
            },
          ]
        : [];
    });
    return {
      past,
      scrollBare,
      hits,
      row: {
        left: Math.round(box.left),
        right: Math.round(box.right),
        scroll: row.scrollWidth,
        client: row.clientWidth,
      },
      page: { scroll: doc.scrollWidth, client: doc.clientWidth },
      parts,
    };
  }, name);
  await rowOf(page, name).screenshot({
    path: join(kit.out, `phone-${leg.replaceAll(" ", "-")}.png`),
  });
  kit.check(
    `${leg}: every drawn part inside the row, nothing scrolls sideways, every touch area on screen`,
    read !== undefined &&
      read.parts.length > 0 &&
      read.parts.every((part) => part.inside) &&
      // The name keeps the 3rem the row's controls leave it (section-row).
      read.parts.some((part) => part.part === "name" && part.width >= 48) &&
      read.scrollBare <= read.row.client &&
      read.hits.every((hit) => hit.onScreen) &&
      read.page.scroll <= read.page.client,
    JSON.stringify(read)
  );
}

const spec: Spec = { name: "skill-updates", run: probe };
export default spec;
