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
 * 3. After the agent's sync, both rows are applied on the machine, which is
 *    the CLI's registry holding that very name; Browse (`marketplaceCatalog`)
 *    lists each one's plugins; and a plugin installed from each is applied.
 * 4. The agent runs with a `CLAUDE_CONFIG_DIR` of someone else's (as a daemon
 *    started from inside a session does): nothing lands in it. A `cawco`
 *    already registered at another HOME's directory is replaced by the
 *    agent's own `$HOME/.claude/cawco-marketplace`.
 *
 *   bun scripts/probe-marketplace-names.ts
 */
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

/** One control call to the agent, answered over a dashboard socket of its own. */
const control = async <T>(method: string, args: unknown[]): Promise<T> => {
  const socket = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("dashboard socket did not open"));
  });
  const requestId = crypto.randomUUID();
  try {
    return await new Promise<T>((done, fail) => {
      const timer = setTimeout(
        () => fail(new Error(`${method}: no answer`)),
        60_000
      );
      socket.onmessage = (event) => {
        // The hub sends `{ verb: "frames", payload }`, one frame or several.
        const { payload } = JSON.parse(String(event.data)) as {
          payload?: unknown;
        };
        const frame = (Array.isArray(payload) ? payload : [payload]).find(
          (one: { kind?: string; requestId?: string } | undefined) =>
            one?.kind === "control_result" && one.requestId === requestId
        ) as { ok?: boolean; result?: unknown; error?: string } | undefined;
        if (!frame) {
          return;
        }
        clearTimeout(timer);
        if (frame.ok) {
          done(frame.result as T);
        } else {
          fail(new Error(frame.error ?? `${method} failed`));
        }
      };
      socket.send(
        JSON.stringify({
          verb: "control",
          machineId: MACHINE,
          requestId,
          payload: { requestId, method, args },
        })
      );
    });
  } finally {
    socket.close();
  }
};

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
  fleet.launch("hub");
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
  fleet.launch("hub");
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

  // ── 3. The machine: registry, Browse, install ────────────────────────
  // A `cawco` some other HOME's daemon registered here, as obelisk's
  // registry holds one at a scratch agent's HOME: the sync replaces it.
  const stray = join(
    fleet.sandbox,
    "stray-home",
    CLAUDE_DIR_NAME,
    "cawco-marketplace"
  );
  await mkdir(join(stray, ".claude-plugin"), { recursive: true });
  await Bun.write(
    join(stray, ".claude-plugin", "marketplace.json"),
    JSON.stringify({ name: "cawco", owner: { name: "cawco" }, plugins: [] })
  );
  await Bun.write(
    userLayer(fleet.home, "plugins", "known_marketplaces.json"),
    JSON.stringify({
      cawco: {
        source: { source: "directory", path: stray },
        installLocation: stray,
        lastUpdated: new Date().toISOString(),
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const synced = await until(
    "both marketplaces applied on the agent",
    report,
    (fleetNow) =>
      fleetNow?.marketplaces?.skills?.state === "applied" &&
      fleetNow.marketplaces.interfaces?.state === "applied",
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

  for (const name of ["skills", "interfaces"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one Browse at a time, as the dashboard does
    const listed = await control<{ name: string }[]>("marketplaceCatalog", [
      name,
    ]);
    check(
      `Browse lists ${name}'s plugins`,
      listed.length > 0,
      listed.map((one) => one.name).join(", ")
    );
  }

  const browsed = await control<{ name: string }[]>("marketplaceCatalog", [
    "interfaces",
  ]);
  const picked = `${browsed[0]?.name}@interfaces`;
  await send("PUT", `/api/fleet/plugins/${encodeURIComponent(picked)}`, {
    enabled: true,
  });
  const installed = await until(
    "both plugins applied on the agent",
    report,
    (fleetNow) =>
      fleetNow?.plugins?.[picked]?.state === "applied" &&
      fleetNow.plugins[`${seeded}@skills`]?.state === "applied",
    300_000
  );
  check(
    "a plugin from each marketplace installs",
    true,
    JSON.stringify(installed?.plugins)
  );

  // ── 4. Someone else's CLAUDE_CONFIG_DIR stays untouched ──────────────
  const leaked = await Bun.file(
    join(operatorDir, "plugins", "known_marketplaces.json")
  ).exists();
  check("nothing written into the inherited CLAUDE_CONFIG_DIR", !leaked);
  const vendor = registry.cawco?.installLocation;
  check(
    "a stray cawco is replaced by the agent's own HOME's",
    vendor === userLayer(fleet.home, "cawco-marketplace"),
    vendor ?? "absent"
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.log(`FAIL ${failures.at(-1)}`);
} finally {
  await fleet.close();
  await fleet.clean(failures.length > 0);
}

console.log(failures.length ? `\n${failures.length} failed` : "\nall passed");
process.exit(failures.length ? 1 : 0);
