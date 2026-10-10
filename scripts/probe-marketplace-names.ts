/**
 * A marketplace has one name across the fleet: its own marketplace.json's.
 * A scratch hub and agent (scripts/scratch-fleet.ts) with the real `claude`
 * CLI and two public marketplaces on GitHub:
 *
 * 1. A row linked before the hub read manifests, `humanlayer-skills` for
 *    humanlayer/skills (which calls itself `skills`), with one plugin under
 *    it, is renamed at hub start, plugin id and all.
 * 2. jakubkrehel/skills (which calls itself `interfaces`) is linked through
 *    the hub's route: the name read answers `interfaces`, and the row is
 *    `interfaces`, whatever an operator would have typed.
 *    So are a directory on the hub (`probe-local`) and a marketplace.json
 *    served by URL (`probe-url`).
 * 3. After the agent's sync, every row is applied on the machine: for the
 *    GitHub and URL rows that is the CLI's registry holding that very name,
 *    and the hub directory is linked nowhere but the hub's machine. Browse,
 *    answered by the hub from each row's source, lists every one's plugins,
 *    the hub directory's included; a plugin installed from each is applied;
 *    and the URL row's relative plugin is refused with the docs' reason.
 * 4. Two plugins called show-me, from `skills` and `probe-url`, both apply,
 *    each installed as `show-me@cawco-<marketplace>` with its own vendored
 *    folder and cache folder. A disabled `show-me@cawco`, from when every
 *    vendored plugin shared one marketplace, moves to its new id on the first
 *    sync: logged, still disabled, its data folder with it, and the shared
 *    `cawco` marketplace unlinked and its folder gone.
 * 5. The agent runs with a `CLAUDE_CONFIG_DIR` of someone else's (as a daemon
 *    started from inside a session does): nothing lands in it.
 *
 *   bun scripts/probe-marketplace-names.ts
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../packages/core/src/claude-dirs";
import { MACHINE, scratchFleet, until } from "./scratch-fleet";

/** The scratch agent's own user layer, `$HOME/.claude`. */
const userLayer = (home: string, ...parts: string[]) =>
  join(home, CLAUDE_DIR_NAME, ...parts);

const fleet = await scratchFleet({
  name: "probe-marketplace-names",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});

const operatorDir = join(fleet.sandbox, "operator-claude");
await mkdir(operatorDir, { recursive: true });
fleet.env.CLAUDE_CONFIG_DIR = operatorDir;
// The services clone from GitHub; inside a workspace boundary that is only
// through its proxy, which the scratch env does not carry on its own.
for (const key of Object.keys(process.env)) {
  if (/^(https?|all|no)_proxy$/i.test(key) || key === "GIT_CONFIG_PARAMETERS") {
    fleet.env[key] = process.env[key] ?? "";
  }
}

/**
 * The hub runs as a machine of its own: with the agent's id it would take
 * the agent for its own machine (core machine-id.ts, hub `isHubMachine`) and
 * have it link the hub's directory, which is the case this probe needs not.
 */
const launchHub = () => {
  fleet.env.CAWCO_MACHINE_ID = `${MACHINE}-hub`;
  fleet.launch("hub");
  fleet.env.CAWCO_MACHINE_ID = MACHINE;
};

const failures: string[] = [];
const check = (label: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`
  );
  if (!ok) {
    failures.push(label);
  }
};

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
    signal: AbortSignal.timeout(180_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path}: ${response.status} ${text}`);
  }
  return JSON.parse(text) as unknown;
};

/** The `claude` CLI on the scratch agent's own HOME, as the agent runs it. */
const cli = (args: string[]): string => {
  const env = Object.fromEntries(
    Object.entries(fleet.env).filter(([key]) => key !== "CLAUDE_CONFIG_DIR")
  );
  const ran = Bun.spawnSync(["claude", ...args], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return `${ran.stdout.toString()}${ran.stderr.toString()}`;
};

/** `claude plugin list --json` on the scratch agent's HOME. */
const pluginList = (): {
  enabled: boolean;
  id: string;
  installPath: string;
}[] => JSON.parse(cli(["plugin", "list", "--json"]));

/** Browse, as the dashboard asks it: the hub reads the row's source. */
const browse = async (name: string) =>
  (await send(
    "GET",
    `/api/fleet/marketplaces/${encodeURIComponent(name)}/plugins`
  )) as { name: string }[];

const install = (id: string) =>
  send("PUT", `/api/fleet/plugins/${encodeURIComponent(id)}`, {
    enabled: true,
  });

/**
 * A marketplace that is a directory on the hub: no machine but the hub's own
 * links it, so a scratch agent (which is not the hub's machine) holds no copy.
 */
const localMarket = join(fleet.sandbox, "hub-market");
const writeLocalMarket = async () => {
  await Bun.write(
    join(localMarket, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "probe-local",
      owner: { name: "probe" },
      plugins: [{ name: "local-one", source: "./plugins/local-one" }],
    })
  );
  await Bun.write(
    join(localMarket, "plugins", "local-one", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "local-one", version: "1.0.0" })
  );
  await Bun.write(
    join(localMarket, "plugins", "local-one", "skills", "hello", "SKILL.md"),
    "---\ndescription: Says hello\n---\n\nSay hello.\n"
  );
};

/**
 * A marketplace added by its marketplace.json URL: one plugin with a source of
 * its own (a GitHub subdirectory) and one with a relative path, which the docs
 * say cannot resolve there.
 */
const urlMarket = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: () =>
    Response.json({
      name: "probe-url",
      owner: { name: "probe" },
      plugins: [
        {
          name: "show-me",
          source: {
            source: "git-subdir",
            url: "https://github.com/humanlayer/skills",
            path: "plugins/show-me",
          },
        },
        { name: "relative-one", source: "./plugins/relative-one" },
      ],
    }),
});
const urlSource = `http://127.0.0.1:${urlMarket.port}/marketplace.json`;

interface AgentRow {
  fleet?: {
    marketplaces?: Record<string, { state: string; detail?: string }>;
    plugins?: Record<string, { state: string; detail?: string }>;
  };
  machineId: string;
}
const report = async () =>
  ((await send("GET", "/api/agents")) as AgentRow[]).find(
    (row) => row.machineId === MACHINE
  )?.fleet;

try {
  // ── 1. A row under a typed name, renamed at hub start ────────────────
  launchHub();
  await fleet.hubUp();
  const catalog = (await fetch(
    "https://raw.githubusercontent.com/humanlayer/skills/HEAD/.claude-plugin/marketplace.json"
  ).then((r) => r.json())) as { name: string; plugins: { name: string }[] };
  const seeded = catalog.plugins[0]?.name ?? "";
  console.log(
    `humanlayer/skills calls itself ${catalog.name}; seeding ${seeded}`
  );
  fleet.write(
    "INSERT INTO marketplaces (name, source, created_at) VALUES (?, ?, ?)",
    "humanlayer-skills",
    "humanlayer/skills",
    Date.now()
  );
  fleet.write(
    "INSERT INTO plugins (id, enabled, created_at) VALUES (?, 1, ?)",
    `${seeded}@humanlayer-skills`,
    Date.now()
  );
  await fleet.stop("hub");
  launchHub();
  await fleet.hubUp();
  const renamed = await until(
    "the seeded row renamed",
    () => fleet.query<{ name: string }>("SELECT name FROM marketplaces"),
    (rows) => rows.some((row) => row.name === "skills"),
    180_000
  );
  check(
    "pre-existing mismatched row renamed at hub start",
    renamed.length === 1 && renamed[0]?.name === "skills",
    JSON.stringify(renamed)
  );
  const ids = fleet.query<{ id: string }>("SELECT id FROM plugins");
  check(
    "its plugin id moved with it",
    ids.length === 1 && ids[0]?.id === `${seeded}@skills`,
    JSON.stringify(ids)
  );
  const hubLog = await fleet.logs("hub");
  const line = hubLog
    .split("\n")
    .find((one) => one.includes("marketplace humanlayer-skills renamed"));
  check("the rename is logged", Boolean(line), line ?? "");

  // ── 2. Linking reads the manifest's name ─────────────────────────────
  const read = (await send(
    "GET",
    `/api/fleet/marketplace-name?${new URLSearchParams({ source: "jakubkrehel/skills" })}`
  )) as { name: string };
  check(
    "the name read answers the manifest's name",
    read.name === "interfaces",
    JSON.stringify(read)
  );
  const linked = (await send("POST", "/api/fleet/marketplaces", {
    source: "jakubkrehel/skills",
  })) as { name: string };
  check(
    "the link lands under the manifest's name",
    linked.name === "interfaces",
    JSON.stringify(linked)
  );
  await writeLocalMarket();
  const local = (await send("POST", "/api/fleet/marketplaces", {
    source: localMarket,
  })) as { name: string };
  const byUrl = (await send("POST", "/api/fleet/marketplaces", {
    source: urlSource,
  })) as { name: string };
  check(
    "a hub directory and a marketplace.json URL link under their names",
    local.name === "probe-local" && byUrl.name === "probe-url",
    `${local.name}, ${byUrl.name}`
  );

  // ── 3. Browse (answered by the hub) and installs, before any sync ────
  const listings: Partial<Record<string, string[]>> = {};
  for (const name of ["skills", "interfaces", "probe-local", "probe-url"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one Browse at a time, as the dashboard does
    listings[name] = (await browse(name)).map((one) => one.name);
    check(
      `Browse lists ${name}'s plugins`,
      (listings[name]?.length ?? 0) > 0,
      listings[name]?.join(", ")
    );
  }
  const picked = `${listings.interfaces?.[0]}@interfaces`;
  // Two plugins called show-me, from two marketplaces.
  const wanted = [
    picked,
    `${seeded}@skills`,
    "local-one@probe-local",
    "show-me@probe-url",
    "show-me@skills",
  ];
  for (const id of [...wanted, "relative-one@probe-url"]) {
    // biome-ignore lint/performance/noAwaitInLoops: installs one at a time, as an operator clicks them
    await install(id);
  }
  // Carried before the machine's first sync, as a deployed hub's rows are.
  await until(
    "the hub carrying every wanted plugin",
    () =>
      fleet.query<{ id: string; hash: string | null }>(
        "SELECT id, hash FROM plugins"
      ),
    (rows) =>
      wanted.every((id) => rows.some((row) => row.id === id && row.hash)),
    300_000
  );

  // ── 4. A `show-me@cawco` from when vendored plugins shared one marketplace
  const legacyDir = userLayer(fleet.home, "cawco-marketplace");
  await Bun.write(
    join(legacyDir, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: "cawco",
      owner: { name: "cawco" },
      plugins: [{ name: "show-me", source: "./plugins/show-me" }],
    })
  );
  await Bun.write(
    join(legacyDir, "plugins", "show-me", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "show-me", version: "0.0.1" })
  );
  await Bun.write(
    join(legacyDir, "plugins", "show-me", "skills", "legacy", "SKILL.md"),
    "---\ndescription: The old copy\n---\n\nOld.\n"
  );
  for (const args of [
    ["plugin", "marketplace", "add", legacyDir],
    ["plugin", "install", "show-me@cawco", "--scope", "user"],
    ["plugin", "disable", "show-me@cawco", "--scope", "user"],
  ]) {
    cli(args);
  }
  await Bun.write(
    userLayer(fleet.home, "plugins", "data", "show-me-cawco", "marker"),
    "kept"
  );
  const before = pluginList();
  check(
    "a disabled show-me@cawco is installed before the sync",
    before.some((one) => one.id === "show-me@cawco" && !one.enabled),
    JSON.stringify(before.map(({ id, enabled }) => ({ id, enabled })))
  );

  // ── 5. The machine: registry, installs, the move ─────────────────────
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const synced = await until(
    "every marketplace applied on the agent",
    report,
    (fleetNow) =>
      ["skills", "interfaces", "probe-local", "probe-url"].every(
        (name) => fleetNow?.marketplaces?.[name]?.state === "applied"
      ),
    300_000
  );
  check(
    "rollout state applied under the one name",
    true,
    JSON.stringify(synced?.marketplaces)
  );
  const registry = (await Bun.file(
    userLayer(fleet.home, "plugins", "known_marketplaces.json")
  ).json()) as Partial<Record<string, { installLocation?: string }>>;
  check(
    "the CLI registered both under the same names",
    Boolean(registry.skills?.installLocation) &&
      Boolean(registry.interfaces?.installLocation),
    Object.keys(registry).join(", ")
  );

  check(
    "the hub-directory marketplace is not linked on the agent",
    registry["probe-local"] === undefined,
    Object.keys(registry).join(", ")
  );

  const installed = await until(
    "every plugin applied on the agent",
    report,
    (fleetNow) =>
      wanted.every((id) => fleetNow?.plugins?.[id]?.state === "applied"),
    300_000
  );
  check(
    "a plugin from each marketplace installs",
    true,
    JSON.stringify(installed?.plugins)
  );
  const refused = (
    (await send("GET", "/api/fleet")) as {
      config: { plugins: { id: string; error?: string }[] };
    }
  ).config.plugins.find((one) => one.id === "relative-one@probe-url");
  check(
    "a relative plugin of a marketplace.json URL is refused with the docs' reason",
    refused?.error?.includes("relative paths won't resolve") === true,
    refused?.error ?? "no error"
  );

  // Both show-me, each under its own vendored marketplace.
  const after = pluginList();
  const listedIds = after.map(({ id }) => id);
  check(
    "show-me from both marketplaces is installed under its own id",
    listedIds.includes("show-me@cawco-skills") &&
      listedIds.includes("show-me@cawco-probe-url"),
    listedIds.join(", ")
  );
  const paths = after
    .filter(({ id }) => id.startsWith("show-me@cawco-"))
    .map(({ installPath }) => installPath);
  check(
    "each has its own cache folder",
    paths.length === 2 && paths[0] !== paths[1],
    paths.join(" | ")
  );
  const folders = ["skills", "probe-url"].map((marketplace) =>
    userLayer(
      fleet.home,
      "cawco-marketplaces",
      marketplace,
      "plugins",
      "show-me"
    )
  );
  check(
    "each has its own vendored folder",
    folders.every((folder) => existsSync(folder)),
    folders.join(" | ")
  );

  // The old show-me@cawco moved: gone, its marketplace unlinked, its state
  // and data kept by the id it moved to.
  const agentLog = await fleet.logs("agent");
  const moved =
    /show-me@cawco moved to (show-me@cawco-[\w-]+)(, disabled as it was)?/.exec(
      agentLog
    );
  const heir = moved?.[1] ?? "";
  check("the move is logged", Boolean(moved), moved?.[0] ?? "no line");
  const now = (await Bun.file(
    userLayer(fleet.home, "plugins", "known_marketplaces.json")
  ).json()) as Partial<Record<string, unknown>>;
  check(
    "show-me@cawco and the shared cawco marketplace are gone",
    !(
      listedIds.includes("show-me@cawco") ||
      "cawco" in now ||
      existsSync(legacyDir)
    ),
    `${listedIds.join(", ")}; registry ${Object.keys(now).join(", ")}`
  );
  check(
    "it stays disabled under its new id",
    after.some((one) => one.id === heir && !one.enabled),
    heir
  );
  const marker = userLayer(
    fleet.home,
    "plugins",
    "data",
    heir.replace(/[^a-zA-Z0-9_-]/g, "-"),
    "marker"
  );
  check(
    "its data folder moved with it",
    await Bun.file(marker).exists(),
    marker
  );

  // ── 6. Someone else's CLAUDE_CONFIG_DIR stays untouched ──────────────
  const leaked = await Bun.file(
    join(operatorDir, "plugins", "known_marketplaces.json")
  ).exists();
  check("nothing written into the inherited CLAUDE_CONFIG_DIR", !leaked);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.log(`FAIL ${failures.at(-1)}`);
} finally {
  urlMarket.stop(true);
  await fleet.close();
  await fleet.clean(failures.length > 0);
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
