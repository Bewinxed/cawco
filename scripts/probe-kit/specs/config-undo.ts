/**
 * Delete, then undo, on every config section that deletes (JOURNEY.md
 * Flow 5: "an undo affordance after the fact rather than a confirm dialog
 * before it"). On a scratch fleet (real hub, agent and sessiond), the built
 * dashboard on the desk. Each row is seeded through the hub, then the person
 * picks its menu's delete once: nothing is asked (no dialog, no question
 * under the row), the hub no longer holds it and its row is gone; Undo in
 * the toast, and the hub holds it again as it stood, its row back.
 *
 * - a hook (a starter, as the empty page adds it), from its row's menu and
 *   from its editor's footer;
 * - a skill, switched off, its SKILL.md served here: back from the version
 *   the hub kept, its files' hash and its switch as they were;
 * - a plugin from a marketplace on the hub's disk: installed again, off as
 *   it stood;
 * - that marketplace: linked again from its source;
 * - a delegate type the hub seeded: saved again, whole;
 * - a subagent: its file stored again;
 * - an MCP server, off and signed in: back as it stood, its sign-in too;
 * - a memory document scoped to a role: back with its scope; then the main
 *   file, which takes the document it links with it and leaves the scoped
 *   one: both back;
 * - a rule: back with the date it was made, so it stands where it stood;
 * - a connection with its key: back signed in, its projects with it.
 *
 * Then the trash itself, through the hub: an entry outlives a hub restart;
 * one whose name was taken again answers 409 and the new item stays; one
 * whose window ran out answers 404, in words.
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { userLayerLabel } from "../../../packages/core/src/claude-dirs";
import { HOOK_TEMPLATES } from "../../../packages/core/src/hooks";
import { RULE_TEMPLATES } from "../../../packages/core/src/rules";
import type { Reply } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const SKILL = "probe-undo";
const MARKETPLACE = "undo-plugins";
const PLUGIN = "undo-plugin";
const PLUGIN_ID = `${PLUGIN}@${MARKETPLACE}`;
const UNDO = /^Undo/;
/** The main memory file's row menu, named by its path in the user layer. */
const MAIN_ROW = /^More for .*CLAUDE\.md$/;

interface Snapshot {
  config: {
    marketplaces: { name: string; source: string }[];
    plugins: { enabled: boolean; hash?: string; id: string }[];
  };
  skills: { enabled: boolean; hash?: string; name: string }[];
}

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const fleetOf = (fleet: KitFleet) => fleet.api<Snapshot>("/api/fleet");
const hooksOf = async (fleet: KitFleet) =>
  (
    await fleet.api<{
      hooks: { enabled: boolean; id: string; name: string }[];
    }>("/api/fleet/hooks")
  ).hooks;

/** Polls `read` until `accept` holds or `ms` runs out; the last value either way. */
async function until<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  ms = 30_000
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

const hubSend = async (
  fleet: KitFleet,
  method: "PATCH" | "PUT",
  path: string,
  body: unknown
) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${path}: ${response.status} ${await response.text()}`
    );
  }
};

/** A request to the hub, answered as its status and its words. */
const hubCall = async (
  fleet: KitFleet,
  method: "DELETE" | "POST" | "PUT",
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
  return { status: response.status, text: await response.text() };
};

/** Nothing asked: no dialog open, and no question standing in the page. */
const asked = (page: Page) =>
  page.evaluate(
    () =>
      document.querySelectorAll(
        '[role="dialog"], [role="alertdialog"], section[data-ask]'
      ).length
  );

/**
 * The row's menu, its delete picked once; what was asked, and whether the
 * hub let go of it (`held` false) by the time it was read.
 */
async function deleteFromMenu(
  page: Page,
  name: string | RegExp,
  item: string,
  held: () => Promise<boolean>
) {
  await page
    .getByRole("button", {
      name: typeof name === "string" ? `More for ${name}` : name,
    })
    .first()
    .click();
  await page.getByRole("menuitem", { name: item }).click();
  const let_go = await until(held, (on) => !on);
  return { asked: await asked(page), gone: let_go.ok };
}

/** An editor's own delete, its footer's button pressed once. */
async function deleteFromEditor(
  page: Page,
  label: string,
  held: () => Promise<boolean>
) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const let_go = await until(held, (on) => !on);
  return { asked: await asked(page), gone: let_go.ok };
}

async function undo(page: Page): Promise<boolean> {
  const button = page
    .getByRole("button", { name: UNDO })
    .filter({ visible: true })
    .first();
  const offered = await button.waitFor({ timeout: 10_000 }).then(
    () => true,
    () => false
  );
  if (offered) {
    await button.click();
  }
  return offered;
}

const rowShown = (page: Page, name: string) =>
  page
    .getByText(name, { exact: true })
    .first()
    .waitFor({ timeout: 15_000 })
    .then(
      () => true,
      () => false
    );

const rowGone = (page: Page, name: string) =>
  page
    .getByText(name, { exact: true })
    .first()
    .waitFor({ state: "detached", timeout: 15_000 })
    .then(
      () => true,
      () => false
    );

/** A marketplace with one plugin, on the hub's disk. */
async function market(fleet: KitFleet): Promise<string> {
  const source = join(fleet.sandbox, "undo-market");
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
    JSON.stringify({ name: PLUGIN, version: "1.0.0" })
  );
  await Bun.write(
    join(plugin, "skills", "noop", "SKILL.md"),
    "---\nname: noop\ndescription: does nothing\n---\nNothing.\n"
  );
  return source;
}

const probe = async (kit: Kit) => {
  const served = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response(
        `---\nname: ${SKILL}\ndescription: kept through an undo\n---\nKept.\n`
      ),
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
  const on: On = { kit, fleet, page, base };
  await hooks(on);
  await skill(on, served.url.origin);
  await pluginAndMarketplace(on);
  await delegateType(on);
  await subagent(on);
  await mcpServer(on);
  await memory(on);
  await rule(on);
  await connection(on);
  await page.close();
  await trash(on);
  await served.stop(true);
};

/** What each part of the spec works on. */
interface On {
  base: string;
  fleet: KitFleet;
  kit: Kit;
  page: Page;
}

const [template] = HOOK_TEMPLATES;

async function hooks({ kit, fleet, page, base }: On) {
  const hookId = "probe-undo-hook";
  await hubSend(fleet, "PUT", `/api/fleet/hooks/${hookId}`, template.draft);
  const hookName = template.draft.name;
  await open(page, `${base}/config/hooks`, `text=${hookName}`);
  const hookHeld = async () =>
    (await hooksOf(fleet)).some((one) => one.id === hookId);
  const hookDelete = await deleteFromMenu(
    page,
    hookName,
    "Delete hook",
    hookHeld
  );
  kit.check(
    "hooks: one pick of Delete hook asks nothing and the hub lets the hook go",
    hookDelete.asked === 0 && hookDelete.gone,
    `asked ${hookDelete.asked}, gone ${hookDelete.gone}`
  );
  kit.check(
    "hooks: the deleted hook's row leaves",
    await rowGone(page, hookName)
  );
  kit.check("hooks: the toast offers Undo", await undo(page));
  const hookBack = await until(hookHeld, Boolean);
  kit.check(
    "hooks: Undo puts the hook back on the hub, its row back",
    hookBack.ok && (await rowShown(page, hookName)),
    JSON.stringify(await hooksOf(fleet))
  );
  // The same from its editor's footer: back to the list, Undo there.
  await open(page, `${base}/config/hooks/${hookId}`, "text=Delete hook");
  const editorDelete = await deleteFromEditor(page, "Delete hook", hookHeld);
  kit.check(
    "hooks: the editor's Delete hook asks nothing and the hub lets the hook go",
    editorDelete.asked === 0 && editorDelete.gone,
    `asked ${editorDelete.asked}, gone ${editorDelete.gone}`
  );
  kit.check("hooks: the editor's delete offers Undo", await undo(page));
  kit.check(
    "hooks: Undo from the editor's delete puts the hook back",
    (await until(hookHeld, Boolean)).ok && (await rowShown(page, hookName))
  );
}

/** A skill, its SKILL.md served at `origin`. */
async function skill({ kit, fleet, page, base }: On, origin: string) {
  await hubSend(fleet, "PUT", `/api/fleet/skills/${SKILL}`, {
    source: `${origin}/${SKILL}/SKILL.md`,
  });
  const fetched = await until(
    () => fleetOf(fleet),
    (all) => Boolean(all.skills.find((one) => one.name === SKILL)?.hash),
    60_000
  );
  const before = fetched.value.skills.find((one) => one.name === SKILL);
  kit.check("skills: the skill is fetched", Boolean(before?.hash));
  await hubSend(fleet, "PATCH", `/api/fleet/skills/${SKILL}`, {
    enabled: false,
  });
  const skillHeld = async () =>
    (await fleetOf(fleet)).skills.some((one) => one.name === SKILL);
  await open(page, `${base}/config/skills`, `text=${SKILL}`);
  const skillDelete = await deleteFromMenu(
    page,
    SKILL,
    "Remove everywhere",
    skillHeld
  );
  kit.check(
    "skills: one pick of Remove everywhere asks nothing and the hub lets the skill go",
    skillDelete.asked === 0 && skillDelete.gone,
    `asked ${skillDelete.asked}, gone ${skillDelete.gone}`
  );
  kit.check(
    "skills: the removed skill's row leaves",
    await rowGone(page, SKILL)
  );
  kit.check("skills: the toast offers Undo", await undo(page));
  const skillBack = await until(
    () => fleetOf(fleet),
    (all) => all.skills.some((one) => one.name === SKILL)
  );
  const after = skillBack.value.skills.find((one) => one.name === SKILL);
  kit.check(
    "skills: Undo puts the skill back as it stood: its files' hash, switched off",
    after?.hash === before?.hash && after?.enabled === false,
    `before ${before?.hash}, after ${after?.hash} enabled ${after?.enabled}`
  );
  kit.check("skills: the skill's row is back", await rowShown(page, SKILL));
}

async function pluginAndMarketplace({ kit, fleet, page }: On) {
  const source = await market(fleet);
  await fleet.fetched(
    (frame) => (frame.link?.source === source ? frame.link : undefined),
    () => fleet.api("/api/fleet/marketplace-links", { source })
  );
  await hubSend(
    fleet,
    "PUT",
    `/api/fleet/plugins/${encodeURIComponent(PLUGIN_ID)}`,
    {
      enabled: false,
    }
  );
  const pluginHeld = async () =>
    (await fleetOf(fleet)).config.plugins.some((one) => one.id === PLUGIN_ID);
  await until(pluginHeld, Boolean);
  await page.reload({ waitUntil: "domcontentloaded" });
  await rowShown(page, PLUGIN_ID);
  const pluginDelete = await deleteFromMenu(
    page,
    PLUGIN_ID,
    "Remove everywhere",
    pluginHeld
  );
  kit.check(
    "plugins: one pick of Remove everywhere asks nothing and the hub lets the plugin go",
    pluginDelete.asked === 0 && pluginDelete.gone,
    `asked ${pluginDelete.asked}, gone ${pluginDelete.gone}`
  );
  kit.check("plugins: the toast offers Undo", await undo(page));
  const pluginBack = await until(
    () => fleetOf(fleet),
    (all) => all.config.plugins.some((one) => one.id === PLUGIN_ID)
  );
  const plugin = pluginBack.value.config.plugins.find(
    (one) => one.id === PLUGIN_ID
  );
  kit.check(
    "plugins: Undo installs the plugin again as it stood, off",
    plugin?.enabled === false && (await rowShown(page, PLUGIN_ID)),
    JSON.stringify(plugin)
  );

  const marketHeld = async () =>
    (await fleetOf(fleet)).config.marketplaces.some(
      (one) => one.name === MARKETPLACE
    );
  const marketDelete = await deleteFromMenu(
    page,
    MARKETPLACE,
    "Unlink",
    marketHeld
  );
  kit.check(
    "marketplaces: one pick of Unlink asks nothing and the hub lets it go",
    marketDelete.asked === 0 && marketDelete.gone,
    `asked ${marketDelete.asked}, gone ${marketDelete.gone}`
  );
  kit.check("marketplaces: the toast offers Undo", await undo(page));
  const marketBack = await until(
    () => fleetOf(fleet),
    (all) => all.config.marketplaces.some((one) => one.name === MARKETPLACE),
    120_000
  );
  kit.check(
    "marketplaces: Undo links it again from its source, its row back",
    marketBack.ok &&
      marketBack.value.config.marketplaces.find(
        (one) => one.name === MARKETPLACE
      )?.source === source &&
      (await rowShown(page, MARKETPLACE)),
    JSON.stringify(marketBack.value.config.marketplaces)
  );
}

const typesOf = async (fleet: KitFleet) =>
  (
    await fleet.api<{ types: ({ name: string } & Record<string, unknown>)[] }>(
      "/api/delegate-types"
    )
  ).types;

/** A delegate type, one the hub seeded. */
async function delegateType({ kit, fleet, page, base }: On) {
  const [seeded] = await typesOf(fleet);
  const typeHeld = async () =>
    (await typesOf(fleet)).some((one) => one.name === seeded.name);
  await open(page, `${base}/config/delegate-types`, `text=${seeded.name}`);
  const typeDelete = await deleteFromMenu(
    page,
    seeded.name,
    "Delete delegate type",
    typeHeld
  );
  kit.check(
    "delegate types: one pick of Delete asks nothing and the hub lets it go",
    typeDelete.asked === 0 && typeDelete.gone,
    `asked ${typeDelete.asked}, gone ${typeDelete.gone}`
  );
  kit.check("delegate types: the toast offers Undo", await undo(page));
  const typeBack = await until(
    () => typesOf(fleet),
    (all) => all.some((one) => one.name === seeded.name)
  );
  kit.check(
    "delegate types: Undo saves it again whole, its row back",
    JSON.stringify(typeBack.value.find((one) => one.name === seeded.name)) ===
      JSON.stringify(seeded) && (await rowShown(page, seeded.name)),
    JSON.stringify(typeBack.value.find((one) => one.name === seeded.name))
  );
}

const agentsOf = async (fleet: KitFleet) =>
  (
    await fleet.api<{ agents: { content: string; name: string }[] }>(
      "/api/fleet"
    )
  ).agents;

async function subagent({ kit, fleet, page, base }: On) {
  const AGENT = "probe-undo-agent";
  const agentFile = `---\nname: ${AGENT}\ndescription: kept through an undo\n---\n\nYou are kept.\n`;
  await hubSend(fleet, "PUT", `/api/fleet/agents/${AGENT}`, {
    content: agentFile,
  });
  const agentHeld = async () =>
    (await agentsOf(fleet)).some((one) => one.name === AGENT);
  await open(page, `${base}/config/subagents`, `text=${AGENT}`);
  const agentDelete = await deleteFromMenu(
    page,
    AGENT,
    "Remove from the fleet",
    agentHeld
  );
  kit.check(
    "subagents: one pick of Remove asks nothing and the fleet lets it go",
    agentDelete.asked === 0 && agentDelete.gone,
    `asked ${agentDelete.asked}, gone ${agentDelete.gone}`
  );
  kit.check("subagents: the toast offers Undo", await undo(page));
  const agentBack = await until(
    () => agentsOf(fleet),
    (all) => all.some((one) => one.name === AGENT)
  );
  kit.check(
    "subagents: Undo stores its file again, its row back",
    agentBack.value.find((one) => one.name === AGENT)?.content === agentFile &&
      (await rowShown(page, AGENT))
  );
}

/** An MCP server, off and signed in. */
async function mcpServer({ kit, fleet, page, base }: On) {
  const MCP = "probe-undo-mcp";
  await hubSend(fleet, "PUT", `/api/fleet/mcp/${MCP}`, {
    config: { command: "true" },
    enabled: false,
  });
  // A sign-in as the hub keeps one: what a removal must not lose.
  fleet.write(
    "INSERT INTO fleet_mcp_oauth (name, generation, upstream, resource, issuer, metadata) VALUES (?, ?, ?, ?, ?, ?)",
    MCP,
    "probe-generation",
    "https://mcp.invalid/",
    "{}",
    "https://issuer.invalid/",
    "{}"
  );
  const mcpOf = async () =>
    (
      await fleet.api<{
        config: { mcp: { config: unknown; enabled: boolean; name: string }[] };
      }>("/api/fleet")
    ).config.mcp;
  const mcpHeld = async () => (await mcpOf()).some((one) => one.name === MCP);
  const signIn = () =>
    fleet.query<{ generation: string }>(
      "SELECT generation FROM fleet_mcp_oauth WHERE name = ?",
      MCP
    );
  await open(page, `${base}/config/mcp`, `text=${MCP}`);
  const mcpDelete = await deleteFromMenu(
    page,
    MCP,
    "Remove everywhere",
    mcpHeld
  );
  kit.check(
    "mcp: one pick of Remove everywhere asks nothing and the hub lets it go, sign-in too",
    mcpDelete.asked === 0 && mcpDelete.gone && signIn().length === 0,
    `asked ${mcpDelete.asked}, gone ${mcpDelete.gone}, sign-ins ${signIn().length}`
  );
  kit.check("mcp: the toast offers Undo", await undo(page));
  const mcpBack = await until(mcpOf, (all) =>
    all.some((one) => one.name === MCP)
  );
  const server = mcpBack.value.find((one) => one.name === MCP);
  kit.check(
    "mcp: Undo puts it back as it stood (its config, off) and signed in as it was",
    JSON.stringify(server?.config) === JSON.stringify({ command: "true" }) &&
      server?.enabled === false &&
      signIn()[0]?.generation === "probe-generation" &&
      (await rowShown(page, MCP)),
    `${JSON.stringify(server)}; sign-in ${JSON.stringify(signIn())}`
  );
}

/** A scoped memory document, then the main file and the document it links. */
async function memory({ kit, fleet, page, base }: On) {
  const MAIN_TEXT = "# Probe\n\nKept through an undo.\n";
  const LINKED = "models/probe.md";
  const SCOPED = "probe-leaf.md";
  /** The linked document's row, named where it lands (config/memory.ts `fileLabel`). */
  const linkedRow = userLayerLabel("memories", LINKED);
  await hubSend(fleet, "PUT", "/api/fleet/memory", { content: MAIN_TEXT });
  await hubSend(fleet, "PUT", "/api/fleet/memory/docs", {
    path: LINKED,
    content: "Linked.\n",
  });
  await hubSend(fleet, "PUT", "/api/fleet/memory/docs", {
    path: SCOPED,
    content: "Scoped.\n",
    scope: { role: "leaf" },
  });
  interface MemoryRead {
    memory: { content: string } | null;
    memoryDocs: { content: string; path: string; scope?: { role?: string } }[];
  }
  const memoryOf = () => fleet.api<MemoryRead>("/api/fleet");
  const docHeld = (path: string) => async () =>
    (await memoryOf()).memoryDocs.some((one) => one.path === path);
  await open(page, `${base}/config/memory`, `text=${SCOPED}`);
  const scopedDelete = await deleteFromMenu(
    page,
    SCOPED,
    "Delete everywhere",
    docHeld(SCOPED)
  );
  kit.check(
    "memory: one pick of Delete on a scoped document asks nothing and the hub lets it go",
    scopedDelete.asked === 0 && scopedDelete.gone,
    `asked ${scopedDelete.asked}, gone ${scopedDelete.gone}`
  );
  kit.check("memory: the toast offers Undo", await undo(page));
  const scopedBack = await until(memoryOf, (all) =>
    all.memoryDocs.some((one) => one.path === SCOPED)
  );
  kit.check(
    "memory: Undo puts the scoped document back with its scope",
    scopedBack.value.memoryDocs.find((one) => one.path === SCOPED)?.scope
      ?.role === "leaf" && (await rowShown(page, SCOPED)),
    JSON.stringify(scopedBack.value.memoryDocs)
  );

  const mainHeld = async () => (await memoryOf()).memory !== null;
  const mainDelete = await deleteFromMenu(
    page,
    MAIN_ROW,
    "Delete everywhere",
    mainHeld
  );
  const emptied = await memoryOf();
  kit.check(
    "memory: one pick of Delete on the main file asks nothing; the hub drops it and the document it links, the scoped one stays",
    mainDelete.asked === 0 &&
      mainDelete.gone &&
      !emptied.memoryDocs.some((one) => one.path === LINKED) &&
      emptied.memoryDocs.some((one) => one.path === SCOPED),
    `asked ${mainDelete.asked}, gone ${mainDelete.gone}, docs ${emptied.memoryDocs.map((one) => one.path).join(", ")}`
  );
  kit.check(
    "memory: the linked document's row leaves with it",
    await rowGone(page, linkedRow)
  );
  kit.check("memory: the toast offers Undo", await undo(page));
  const mainBack = await until(
    memoryOf,
    (all) =>
      all.memory?.content === MAIN_TEXT &&
      all.memoryDocs.some((one) => one.path === LINKED)
  );
  kit.check(
    "memory: Undo puts the main file and its linked document back",
    mainBack.ok && (await rowShown(page, linkedRow)),
    JSON.stringify(mainBack.value)
  );
}

async function rule({ kit, fleet, page, base }: On) {
  interface RuleRead {
    createdAt: number;
    id: string;
    name: string;
  }
  const rulesOf = async () =>
    (await fleet.api<{ rules: RuleRead[] }>("/api/rules")).rules;
  const made = JSON.parse(
    (await hubCall(fleet, "POST", "/api/rules", RULE_TEMPLATES[0].draft)).text
  ) as RuleRead;
  const ruleHeld = async () =>
    (await rulesOf()).some((one) => one.id === made.id);
  await open(page, `${base}/config/rules`, `text=${made.name}`);
  const ruleDelete = await deleteFromMenu(
    page,
    made.name,
    "Delete rule",
    ruleHeld
  );
  kit.check(
    "rules: one pick of Delete rule asks nothing and the hub lets it go",
    ruleDelete.asked === 0 && ruleDelete.gone,
    `asked ${ruleDelete.asked}, gone ${ruleDelete.gone}`
  );
  kit.check("rules: the toast offers Undo", await undo(page));
  const ruleBack = await until(rulesOf, (all) =>
    all.some((one) => one.id === made.id)
  );
  kit.check(
    "rules: Undo puts the rule back with the date it was made, its row back",
    ruleBack.value.find((one) => one.id === made.id)?.createdAt ===
      made.createdAt && (await rowShown(page, made.name)),
    `made ${made.createdAt}, back ${JSON.stringify(ruleBack.value.find((one) => one.id === made.id))}`
  );
}

/** A connection, with its key. */
async function connection({ kit, fleet, page, base }: On) {
  const CONNECTION = "probe-undo-conn";
  const SERVICE = "probe";
  await hubCall(fleet, "POST", "/api/connections", {
    name: CONNECTION,
    service: SERVICE,
    account: "kept",
    transport: "http",
    url: "https://mcp.invalid/mcp",
    auth: "bearer",
  });
  await hubCall(fleet, "PUT", `/api/connections/${CONNECTION}/key`, {
    key: "probe-key",
  });
  /** The key as the hub keeps it, sealed: the same text back means the same key back. */
  const sealedKey = () =>
    fleet.query<{ sealed: string | null }>(
      "SELECT sealed FROM connections WHERE name = ?",
      CONNECTION
    )[0]?.sealed ?? null;
  const keyBefore = sealedKey();
  const connectionHeld = async () =>
    (
      await fleet.api<{ connections: { name: string }[] }>("/api/connections")
    ).connections.some((one) => one.name === CONNECTION);
  await open(page, `${base}/config/connections`, `text=${SERVICE}`);
  const connectionDelete = await deleteFromMenu(
    page,
    SERVICE,
    "Remove",
    connectionHeld
  );
  kit.check(
    "connections: one pick of Remove asks nothing and the hub lets it go, key too",
    connectionDelete.asked === 0 &&
      connectionDelete.gone &&
      sealedKey() === null,
    `asked ${connectionDelete.asked}, gone ${connectionDelete.gone}`
  );
  kit.check("connections: the toast offers Undo", await undo(page));
  const connectionBack = await until(connectionHeld, Boolean);
  kit.check(
    "connections: Undo puts it back with its key, its row back",
    connectionBack.ok &&
      keyBefore !== null &&
      sealedKey() === keyBefore &&
      (await rowShown(page, SERVICE)),
    `key kept ${keyBefore !== null}, same ${sealedKey() === keyBefore}`
  );
}

/** The trash itself, through the hub. */
async function trash({ kit, fleet }: On) {
  // An entry outlives a hub restart.
  const restartHook = "probe-restart-hook";
  await hubSend(fleet, "PUT", `/api/fleet/hooks/${restartHook}`, {
    ...template.draft,
    name: "Kept through a restart",
  });
  const trashedHook = JSON.parse(
    (await hubCall(fleet, "DELETE", `/api/fleet/hooks/${restartHook}`)).text
  ) as { restore: number };
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  const afterRestart = await hubCall(
    fleet,
    "POST",
    `/api/trash/${trashedHook.restore}/restore`
  );
  kit.check(
    "trash: an entry outlives a hub restart: Undo after it puts the hook back",
    afterRestart.status === 200 &&
      (await hooksOf(fleet)).some((one) => one.id === restartHook),
    `${afterRestart.status} ${afterRestart.text.slice(0, 200)}`
  );

  // One whose name was taken again stays in the trash; the new one stays.
  const [seeded] = await typesOf(fleet);
  const { name: _, ...typeBody } = seeded;
  const TAKEN = "probe-taken";
  await hubSend(fleet, "PUT", `/api/delegate-types/${TAKEN}`, {
    ...typeBody,
    description: "The first, deleted.",
  });
  const trashedType = JSON.parse(
    (await hubCall(fleet, "DELETE", `/api/delegate-types/${TAKEN}`)).text
  ) as { restore: number };
  await hubSend(fleet, "PUT", `/api/delegate-types/${TAKEN}`, {
    ...typeBody,
    description: "The second, made since.",
  });
  const takenAnswer = await hubCall(
    fleet,
    "POST",
    `/api/trash/${trashedType.restore}/restore`
  );
  const standing = (
    await fleet.api<{ types: { description: string; name: string }[] }>(
      "/api/delegate-types"
    )
  ).types.find((one) => one.name === TAKEN);
  kit.check(
    "trash: an Undo whose name was taken since answers 409 in words, and the new one stays",
    takenAnswer.status === 409 &&
      standing?.description === "The second, made since.",
    `${takenAnswer.status} ${takenAnswer.text}; standing ${standing?.description}`
  );

  // One whose window ran out answers 404, in words.
  const LATE = "probe-late-agent";
  await hubSend(fleet, "PUT", `/api/fleet/agents/${LATE}`, {
    content: `---\nname: ${LATE}\ndescription: too late\n---\n\nGone.\n`,
  });
  const trashedAgent = JSON.parse(
    (await hubCall(fleet, "DELETE", `/api/fleet/agents/${LATE}`)).text
  ) as { restore: number; restorableForMs: number };
  await Bun.sleep(trashedAgent.restorableForMs + 1000);
  const lateAnswer = await hubCall(
    fleet,
    "POST",
    `/api/trash/${trashedAgent.restore}/restore`
  );
  kit.check(
    "trash: an Undo past its window answers 404 in words, and nothing comes back",
    lateAnswer.status === 404 &&
      !(await agentsOf(fleet)).some((one) => one.name === LATE),
    `${lateAnswer.status} ${lateAnswer.text}`
  );
}

const spec: Spec = { name: "config-undo", run: probe };
export default spec;
