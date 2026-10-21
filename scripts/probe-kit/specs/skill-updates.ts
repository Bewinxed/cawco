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
 *   badge says "Update available · 1.0.0 → 1.1.0" (a status, not a button),
 *   its action is Fetch update, and the hub stored none of the new files
 *   (the row's hash is the old one).
 * - Fetch update pressed: "Updated 1.0.0 → 1.1.0 · just now", the badge
 *   gone, and the machines told.
 * - The plugin the same way: its plugin.json moves to 1.1.0, the check marks
 *   it, Fetch update fetches it.
 * - The plugin's source broken, Fetch again: the hub keeps its last good
 *   hash and files, the row says "Couldn't update: …", no machine is told.
 * - A nightly-long version on a phone, at 390px and 320px: the badge, its
 *   action and the outcome note stay inside the row, and neither the row
 *   nor the page scrolls sideways.
 *
 * Each row's rendered text is printed, and a capture of it kept in the run's
 * out dir.
 *
 *   bun scripts/probe-kit/run.ts skill-updates
 */
import { rm } from "node:fs/promises";
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
/** A version as long as a nightly's, to hold the row's edges against. */
const LONG_VERSION = "2026.10.21-nightly.4627+abcdef0";
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
    "the row says Already on latest (1.0.0) · just now",
    await rowSays(page, SKILL, "Already on latest (1.0.0) · just now")
  );
  await readRow(kit, page, SKILL, "skill-already-latest");
  let log = await mark.since();
  kit.check(
    "the hub logs the unchanged fetch and tells no machine",
    log.includes(`skill ${SKILL}: unchanged`) && !log.includes(SYNC_LINE),
    told(log, SKILL)
  );

  // ── the source moves on; Check for updates ──────────────────────────
  served = skillMd("1.1.0");
  await page.getByRole("button", { name: "Check for updates" }).click();
  kit.check(
    "the row's badge says Update available · 1.0.0 → 1.1.0",
    await rowSays(page, SKILL, "Update available · 1.0.0 → 1.1.0")
  );
  kit.check(
    "the badge is a status, not a button; its action is Fetch update",
    (await rowOf(page, SKILL)
      .getByRole("button", { name: UPDATE_CHIP })
      .count()) === 0 && (await updateButton(page, SKILL).count()) === 1
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

  // ── Fetch update pressed ────────────────────────────────────────────
  mark = await fleet.logMark("hub");
  await updateButton(page, SKILL).click();
  kit.check(
    "the row says Updated 1.0.0 → 1.1.0 · just now",
    await rowSays(page, SKILL, "Updated 1.0.0 → 1.1.0 · just now")
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
    "the badge and its action have gone",
    (await rowOf(page, SKILL).getByText(UPDATE_CHIP).count()) === 0 &&
      (await updateButton(page, SKILL).count()) === 0
  );
  await readRow(kit, page, SKILL, "skill-updated");
  log = await mark.since();
  kit.check(
    "the hub tells the machines of the changed copy",
    log.includes(`skill ${SKILL}: the fleet's copy changed`) &&
      log.includes(SYNC_LINE),
    told(log, SKILL)
  );

  // ── the plugin ──────────────────────────────────────────────────────
  await market(fleet, "1.1.0");
  await page.getByRole("button", { name: "Check for updates" }).click();
  kit.check(
    "the plugin row's badge says Update available · 1.0.0 → 1.1.0",
    await rowSays(page, PLUGIN_ID, "Update available · 1.0.0 → 1.1.0")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-update-available");
  await updateButton(page, PLUGIN_ID).click();
  kit.check(
    "the plugin row says Updated 1.0.0 → 1.1.0 · just now",
    await rowSays(page, PLUGIN_ID, "Updated 1.0.0 → 1.1.0 · just now")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-updated");

  // ── the plugin's source breaks; Fetch again keeps the last good copy ─
  const held = () =>
    fleet.query<{ files: number; hash: string }>(
      "SELECT hash, length(files) AS files FROM plugins WHERE id = ?",
      PLUGIN_ID
    )[0];
  const good = held();
  await rm(join(source, "plugins", PLUGIN), { recursive: true, force: true });
  mark = await fleet.logMark("hub");
  const failed = await fleet.fetched(
    (frame) => (frame.plugin?.id === PLUGIN_ID ? frame.plugin : undefined),
    () => fetchAgain(page, PLUGIN_ID)
  );
  const kept = held();
  kit.check(
    "a failed plugin refresh keeps its hash and files, and says it failed",
    failed.lastRefresh?.outcome === "failed" &&
      failed.hash === good?.hash &&
      kept?.hash === good?.hash &&
      kept?.files === good?.files &&
      (good?.files ?? 0) > 0,
    `before ${JSON.stringify(good)}, after ${JSON.stringify(kept)}, refresh ${JSON.stringify(failed.lastRefresh)}`
  );
  kit.check(
    "the plugin row says Couldn't update: …",
    await rowSays(page, PLUGIN_ID, "Couldn't update: ")
  );
  await readRow(kit, page, PLUGIN_ID, "plugin-update-failed");
  log = await mark.since();
  kit.check(
    "the failed refresh tells no machine",
    log.includes(`plugin ${PLUGIN_ID}: failed`) && !log.includes(SYNC_LINE),
    told(log, PLUGIN_ID)
  );
  await market(fleet, "1.1.0");
  await page.close();

  // ── a long version on a phone: nothing leaves the row ───────────────
  served = skillMd(LONG_VERSION);
  await fleet.api("/api/fleet/updates/check", {});
  await until(
    () => skillOf(fleet),
    (row) => row?.latestVersion === LONG_VERSION
  );
  const phone = await kit.page("phone");
  await open(phone, `${base}/config/skills`, `li[data-row-name="${SKILL}"]`);
  await rowSays(phone, SKILL, "Update available");
  for (const width of [390, 320]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, on one page
    await phone.setViewportSize({ width, height: 844 });
    await fitsRow(kit, phone, `badge at ${width}px`);
  }
  await updateButton(phone, SKILL).click();
  await rowSays(phone, SKILL, `Updated 1.1.0 → ${LONG_VERSION}`);
  for (const width of [320, 390]) {
    // biome-ignore lint/performance/noAwaitInLoops: one width at a time, on one page
    await phone.setViewportSize({ width, height: 844 });
    await fitsRow(kit, phone, `note at ${width}px`);
  }
  await phone.close();
  await server.stop(true);
};

/** The row's Fetch update, the update badge's action. */
const updateButton = (page: Page, name: string) =>
  rowOf(page, name).getByRole("button", { name: "Fetch update" });

/** The hub's lines about `what` and its syncs, for a check's detail. */
const told = (log: string, what: string) =>
  log
    .split("\n")
    .filter((line) => line.includes(what) || line.includes(SYNC_LINE))
    .join(" / ");

/**
 * Every drawn part of the skill's row (its meta line, the update badge and
 * its action, the note) inside the row's box, the row and the page with
 * nothing to scroll sideways: read off the engine, then a capture kept. A
 * control's touch area under a finger (`touch-hit`, 44px, DESIGN.md "without
 * changing its drawn size") may reach past the row into the page's gutter,
 * so the row's own overflow is read with those areas off (`scrollBare`), and
 * each that reaches past the row must stand on the screen (`hits`).
 */
async function fitsRow(kit: Kit, page: Page, leg: string): Promise<void> {
  const read = await page.evaluate((name) => {
    const row = document.querySelector(
      `li[data-row-name="${CSS.escape(name)}"]`
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
  }, SKILL);
  await rowOf(page, SKILL).screenshot({
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
