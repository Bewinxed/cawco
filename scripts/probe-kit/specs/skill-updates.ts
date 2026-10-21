/**
 * Config → Skills says each skill's and plugin's version, when its source
 * holds something newer, and what a refresh came to (FleetVersioned in
 * @cawco/core; hub server.ts `fetchSkill`, `fetchPlugins`, `checkSources`).
 *
 * On a scratch fleet (real hub, agent and sessiond), the built dashboard on
 * the desk: a skill whose SKILL.md this spec serves (`version: 1.0.0`), and a
 * plugin from a marketplace on the hub's disk (`plugin.json` 1.0.0).
 *
 * - Each row's meta line names its version.
 * - Fetch again on a source that has not moved: the row says "Already on
 *   latest (1.0.0)", the `fleet.fetch` frame carries outcome `unchanged`, and
 *   the hub tells no machine (no `[fleet] sync →` in its log).
 * - The served SKILL.md moves to 1.1.0, then Check for updates: the row's
 *   chip says "Update available · 1.0.0 → 1.1.0", and the hub stored none of
 *   the new files (the row's hash is the old one).
 * - The chip pressed: "Updated 1.0.0 → 1.1.0", the chip gone, and the
 *   machines told.
 * - The plugin the same way: its plugin.json moves to 1.1.0, the check marks
 *   it, its chip fetches it.
 *
 * Each row's rendered text is printed, and a capture of it kept in the run's
 * out dir.
 *
 *   bun scripts/probe-kit/run.ts skill-updates
 */
import { join } from "node:path";
import type { Locator, Page } from "playwright-core";
import type { FleetPlugin, FleetSkillMeta } from "../../../packages/core/src";
import type { Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const SKILL = "probe-versions";
const MARKETPLACE = "version-plugins";
const PLUGIN = "versioned-plugin";
const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;
const SYNC_LINE = "[fleet] sync →";
const UPDATE_CHIP = /^Update available/;
const LINE_BREAKS = /\s*\n\s*/g;

interface Snapshot {
  config: { plugins: FleetPlugin[] };
  skills: FleetSkillMeta[];
}

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const skillMd = (version: string) =>
  `---\nname: ${SKILL}\ndescription: says its version\nversion: ${version}\n---\nVersion ${version}.\n`;

/** Polls `read` until `accept` holds or `ms` runs out; the last value either way. */
async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  ms = 60_000
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
const skillOf = async (fleet: KitFleet) =>
  (await fleetOf(fleet)).skills.find((one) => one.name === SKILL);
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
    .waitFor({ timeout: 60_000 })
    .then(
      () => true,
      () => false
    );

async function fetchAgain(page: Page, name: string) {
  await page.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Fetch again" }).click();
}

/** A marketplace with one plugin at `version`, on the hub's disk. */
async function market(fleet: KitFleet, version: string): Promise<string> {
  const source = join(fleet.sandbox, "version-market");
  const plugin = join(source, "plugins", PLUGIN);
  await Bun.write(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: MARKETPLACE,
      owner: { name: "probe" },
      plugins: [{ name: PLUGIN, source: `./plugins/${PLUGIN}` }],
    })
  );
  await Bun.write(
    join(plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: PLUGIN, version })
  );
  await Bun.write(
    join(plugin, "skills", "noop", "SKILL.md"),
    `---\nname: noop\ndescription: does nothing\n---\nNothing at ${version}.\n`
  );
  return source;
}

const probe = async (kit: Kit) => {
  let served = skillMd("1.0.0");
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(served),
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

  // ── seeded: a skill and a plugin, each at 1.0.0 ─────────────────────
  await send(fleet, "PUT", `/api/fleet/skills/${SKILL}`, {
    source: `${server.url.origin}/${SKILL}/SKILL.md`,
  });
  const fetched = await until(
    () => skillOf(fleet),
    (row) => Boolean(row?.hash)
  );
  const first = fetched.value;
  kit.check(
    "the hub reads the skill's declared version",
    first?.version === "1.0.0",
    JSON.stringify(first)
  );
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
    "the hub reads the plugin's plugin.json version",
    installed.value?.version === "1.0.0",
    JSON.stringify(installed.value)
  );

  await open(page, `${base}/config/skills`, `li[data-row-name="${SKILL}"]`);
  const shown = await readRow(kit, page, SKILL, "skill-version-shown");
  kit.check("the skill's meta line names 1.0.0", shown.includes("1.0.0"));
  const pluginShown = await readRow(
    kit,
    page,
    PLUGIN_ID,
    "plugin-version-shown"
  );
  kit.check(
    "the plugin's meta line names 1.0.0",
    pluginShown.includes("1.0.0")
  );

  // ── Fetch again, nothing new ────────────────────────────────────────
  let mark = await fleet.logMark("hub");
  const unchanged = await fleet.fetched(
    (frame) => (frame.skill?.name === SKILL ? frame.skill : undefined),
    () => fetchAgain(page, SKILL)
  );
  kit.check(
    "the landing frame carries outcome unchanged, 1.0.0",
    unchanged.lastRefresh?.outcome === "unchanged" &&
      unchanged.lastRefresh.toVersion === "1.0.0",
    JSON.stringify(unchanged.lastRefresh)
  );
  kit.check(
    "the row says Already on latest (1.0.0)",
    await rowSays(page, SKILL, "Already on latest (1.0.0)")
  );
  await readRow(kit, page, SKILL, "skill-already-latest");
  let log = await mark.since();
  kit.check(
    "the hub logs the unchanged fetch and tells no machine",
    log.includes(`skill ${SKILL}: unchanged`) && !log.includes(SYNC_LINE),
    log
      .split("\n")
      .filter((line) => line.includes(SKILL) || line.includes(SYNC_LINE))
      .join(" / ")
  );

  // ── the source moves on; Check for updates ──────────────────────────
  served = skillMd("1.1.0");
  await page.getByRole("button", { name: "Check for updates" }).click();
  kit.check(
    "the row's chip says Update available · 1.0.0 → 1.1.0",
    await rowSays(page, SKILL, "Update available · 1.0.0 → 1.1.0")
  );
  const checked = await skillOf(fleet);
  kit.check(
    "the check marks the update and stores none of its files",
    checked?.updateAvailable === true &&
      checked.latestVersion === "1.1.0" &&
      checked.hash === first?.hash &&
      checked.version === "1.0.0",
    JSON.stringify(checked)
  );
  await readRow(kit, page, SKILL, "skill-update-available");

  // ── the chip pressed ────────────────────────────────────────────────
  mark = await fleet.logMark("hub");
  await rowOf(page, SKILL).getByRole("button", { name: UPDATE_CHIP }).click();
  kit.check(
    "the row says Updated 1.0.0 → 1.1.0",
    await rowSays(page, SKILL, "Updated 1.0.0 → 1.1.0")
  );
  const updated = await skillOf(fleet);
  kit.check(
    "the update lands: 1.1.0, no update available",
    updated?.version === "1.1.0" &&
      updated.updateAvailable === undefined &&
      updated.lastRefresh?.outcome === "updated",
    JSON.stringify(updated)
  );
  kit.check(
    "the chip has gone",
    (await rowOf(page, SKILL)
      .getByRole("button", { name: UPDATE_CHIP })
      .count()) === 0
  );
  await readRow(kit, page, SKILL, "skill-updated");
  log = await mark.since();
  kit.check(
    "the hub tells the machines of the changed copy",
    log.includes(`skill ${SKILL}: the fleet's copy changed`) &&
      log.includes(SYNC_LINE),
    log
      .split("\n")
      .filter((line) => line.includes(SKILL) || line.includes(SYNC_LINE))
      .join(" / ")
  );

  // ── the plugin ──────────────────────────────────────────────────────
  await market(fleet, "1.1.0");
  await page.getByRole("button", { name: "Check for updates" }).click();
  kit.check(
    "the plugin row's chip says Update available · 1.0.0 → 1.1.0",
    await rowSays(page, PLUGIN_ID, "Update available · 1.0.0 → 1.1.0")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-update-available");
  await rowOf(page, PLUGIN_ID)
    .getByRole("button", { name: UPDATE_CHIP })
    .click();
  kit.check(
    "the plugin row says Updated 1.0.0 → 1.1.0",
    await rowSays(page, PLUGIN_ID, "Updated 1.0.0 → 1.1.0")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-updated");

  await page.close();
  await server.stop(true);
};

const spec: Spec = { name: "skill-updates", run: probe };
export default spec;
