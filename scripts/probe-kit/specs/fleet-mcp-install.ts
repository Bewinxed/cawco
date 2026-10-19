/**
 * A fleet MCP server a row runs with `npx -y <package>@<version>` is
 * installed once by the machine's fleet sync and launched from that install
 * with node, so a leftover npx lock in the shared npm cache no longer holds a
 * session's browser tool for a minute (agent mcp-install.ts).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code and OpenCode
 * against the mock model), with a fresh `concurrency.lock` left where npx
 * would wait on it, in the agent's npm cache and in the one every workspace
 * shares (core paths.ts `workspaceCacheEnv`):
 *
 * - control: `npx -y chrome-devtools-mcp@<old> --version` with that cache
 *   says nothing for {@link CONTROL_MS} (npm's with-lock.js waits until the
 *   lock is 60 s old);
 * - the fleet's chrome-devtools at <old>: the entry the sync writes for
 *   Claude Code and for OpenCode launches node on the install's bin, and
 *   names npx nowhere;
 * - that entry, started as a session starts it, answers `initialize` as
 *   chrome-devtools-mcp <old> within {@link START_BOUND_MS};
 * - the row moved to <new>: the sync installs <new> and the entries launch
 *   it, and it answers as <new> within the bound; <old>'s install stays
 *   while a process launched from it runs, and is retired within
 *   {@link RETIRE_BOUND_MS} once it ends;
 * - a row whose package the registry does not have reads `failed`, with
 *   npm's own sentence.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts fleet-mcp-install
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, utimes } from "node:fs/promises";
import { basename, join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { CLAUDE_JSON_NAME } from "../../../packages/core/src/claude-dirs";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const SERVER = "chrome-devtools";
const PACKAGE = "chrome-devtools-mcp";
const OLD = "1.10.1";
const NEW = "1.11.0";
const MISSING = "probe-missing";
const MISSING_PACKAGE = "cawco-probe-no-such-package";
/** How long the control npx is given to say anything past the lock. */
const CONTROL_MS = 10_000;
/**
 * How soon the entry a session launches must answer `initialize` with the
 * lock in place: node starting the installed bin takes a second or two here;
 * an npx behind the lock says nothing for 60 s, the MCP SDK's own timeout.
 */
const START_BOUND_MS = 15_000;
/** How soon an install no row names is gone once its last process ends: the agent looks again each 60 s (mcp-install.ts `RETIRE_AGAIN_MS`), with margin. */
const RETIRE_BOUND_MS = 90_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Entry {
  args?: string[];
  command: string;
  env?: Record<string, string>;
}

interface Row {
  mcp?: Record<string, { detail?: string; state?: string }>;
}

/** The dir npx keeps `wanted`'s install in under `cache` (npm 11 libnpmexec index.js: sha512 of the specs, 16 hex). */
const npxDir = (cache: string, wanted: string): string =>
  join(
    cache,
    "_npx",
    createHash("sha512").update(wanted).digest("hex").slice(0, 16)
  );

interface McpClient {
  close: () => Promise<void>;
  getServerVersion: () => { name?: string; version?: string } | undefined;
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const home = fleet.env.HOME as string;

  // The caches a leftover lock can sit in: the agent's own npm's, and the
  // one every workspace's commands share.
  const agentCache = (
    await Bun.$`npm config get cache`.env(fleet.env).quiet().text()
  ).trim();
  const caches = [agentCache, join(home, ".cawco", "workspace-cache", "npm")];
  /** A fresh lock, as a SIGKILLed npx leaves it, for each version in each cache. */
  const leaveLocks = async (): Promise<string[]> => {
    const locks = caches.flatMap((cache) =>
      [OLD, NEW].map((version) =>
        join(npxDir(cache, `${PACKAGE}@${version}`), "concurrency.lock")
      )
    );
    await Promise.all(
      locks.map(async (lock) => {
        await mkdir(lock, { recursive: true });
        const now = new Date();
        await utimes(lock, now, now);
      })
    );
    return locks;
  };

  const locks = await leaveLocks();
  // Control: npx itself, behind the lock, never finishes in the time given.
  const control = await readWithin(CONTROL_MS, async (signal) => {
    const npx = Bun.spawn(["npx", "-y", `${PACKAGE}@${OLD}`, "--version"], {
      env: { ...fleet.env, npm_config_cache: caches[1] as string },
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    return `${await new Response(npx.stdout).text()}${await new Response(npx.stderr).text()}`;
  });
  kit.check(
    `control: npx -y ${PACKAGE}@${OLD} --version with the lock left in the shared cache had not answered after ${CONTROL_MS / 1000} s`,
    control.kind === "unanswered",
    JSON.stringify(control)
  );

  const row = (): Row | undefined => {
    const text = fleet
      .query<{ fleet: string | null }>("SELECT fleet FROM agents")
      .map((one) => one.fleet ?? "")
      .find((one) => one.includes(SERVER));
    return text ? (JSON.parse(text) as Row) : undefined;
  };
  const putRow = async (name: string, args: string[]): Promise<boolean> =>
    (
      await fetch(`${fleet.base}/api/fleet/mcp/${name}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: { command: "npx", args },
          enabled: true,
        }),
      })
    ).ok;
  const claudeEntry = async (): Promise<Entry | undefined> =>
    (
      JSON.parse(
        await readFile(join(home, CLAUDE_JSON_NAME), "utf8").catch(() => "{}")
      ) as { mcpServers?: Record<string, Entry> }
    ).mcpServers?.[SERVER];
  const opencodeEntry = async (): Promise<string> =>
    await readFile(
      join(home, ".config", "opencode", "cawco-fleet-mcp.json"),
      "utf8"
    ).catch(() => "");
  const installDir = (version: string): string =>
    join(
      home,
      ".local",
      "share",
      "cawco",
      "fleet-mcp",
      `${PACKAGE}@${version}`
    );

  /** The entry started as a session starts it, timed to its `initialize` answer. */
  const start = async (
    entry: Entry
  ): Promise<{ client: McpClient; ms: number; version?: string }> => {
    const sdk =
      "../../../packages/hub/node_modules/@modelcontextprotocol/sdk/dist/esm/client";
    const { Client } = await import(`${sdk}/index.js`);
    const { StdioClientTransport } = await import(`${sdk}/stdio.js`);
    await leaveLocks();
    const transport = new StdioClientTransport({
      command: entry.command,
      args: entry.args ?? [],
      env: { ...fleet.env, ...entry.env },
      stderr: "ignore",
    });
    const client = new Client({
      name: "fleet-mcp-install",
      version: "1",
    }) as McpClient & { connect: (t: unknown) => Promise<void> };
    const at = Date.now();
    await client.connect(transport);
    return {
      client,
      ms: Date.now() - at,
      version: client.getServerVersion()?.version,
    };
  };

  // The fleet's chrome-devtools at OLD.
  const putAt = Date.now();
  kit.check(
    `the fleet runs ${PACKAGE}@${OLD}`,
    await putRow(SERVER, ["-y", `${PACKAGE}@${OLD}`, "--no-usage-statistics"])
  );
  const old = await until(
    `the sync wrote ${SERVER} for Claude Code from ${PACKAGE}@${OLD}'s install`,
    claudeEntry,
    (entry) => entry.args?.[2]?.startsWith(`${installDir(OLD)}/`) === true,
    180_000
  ).catch(() => undefined);
  const applied = await until(
    `the row reads ${SERVER} applied`,
    row,
    (read) => read.mcp?.[SERVER]?.state === "applied",
    180_000
  ).catch(() => undefined);
  const opencodeOld = await opencodeEntry();
  kit.check(
    `the sync installed ${PACKAGE}@${OLD} and every harness launches it with node, npx named nowhere (row ${applied?.mcp?.[SERVER]?.state ?? "?"} ${Math.round((Date.now() - putAt) / 1000)} s after the PUT)`,
    !!old &&
      basename(old.command) === "node" &&
      !JSON.stringify(old).includes("npx") &&
      opencodeOld.includes(installDir(OLD)) &&
      !opencodeOld.includes("npx") &&
      !!applied,
    JSON.stringify({ old, opencodeOld, row: row()?.mcp?.[SERVER] })
  );
  const installedOld = (await fleet.logs("agent"))
    .split("\n")
    .find((line) => line.includes(`[fleet-mcp] installed ${PACKAGE}@${OLD}`));
  kit.check(
    `the agent says it installed it: ${installedOld?.trim().slice(0, 140)}`,
    !!installedOld
  );

  const first = old ? await start(old) : undefined;
  kit.check(
    `with a fresh concurrency.lock in ${locks.length / 2} npm caches, the entry a session launches answered initialize as ${PACKAGE} ${first?.version} in ${first ? (first.ms / 1000).toFixed(1) : "?"} s (within ${START_BOUND_MS / 1000} s)`,
    !!first && first.ms <= START_BOUND_MS && first.version === OLD,
    JSON.stringify({ locks })
  );

  // Upgraded: the row moves to NEW while OLD's server still runs.
  kit.check(
    `the row moves to ${PACKAGE}@${NEW}`,
    await putRow(SERVER, ["-y", `${PACKAGE}@${NEW}`, "--no-usage-statistics"])
  );
  const next = await until(
    `the sync wrote ${SERVER} for Claude Code from ${PACKAGE}@${NEW}'s install`,
    claudeEntry,
    (entry) => entry.args?.[2]?.startsWith(`${installDir(NEW)}/`) === true,
    180_000
  ).catch(() => undefined);
  const opencodeNew = await opencodeEntry();
  const oldKept = existsSync(installDir(OLD));
  kit.check(
    `the sync installed ${PACKAGE}@${NEW} and both harnesses launch it; ${OLD}'s install is kept while its server runs (${oldKept ? "kept" : "gone"})`,
    !!next &&
      opencodeNew.includes(installDir(NEW)) &&
      !opencodeNew.includes(installDir(OLD)) &&
      oldKept,
    JSON.stringify({ next, opencodeNew })
  );
  const second = next ? await start(next) : undefined;
  kit.check(
    `the upgraded entry answered initialize as ${PACKAGE} ${second?.version} in ${second ? (second.ms / 1000).toFixed(1) : "?"} s (within ${START_BOUND_MS / 1000} s)`,
    !!second && second.ms <= START_BOUND_MS && second.version === NEW
  );

  await first?.client.close();
  const closedAt = Date.now();
  const retired = await until(
    `${PACKAGE}@${OLD}'s install retired`,
    async () => (existsSync(installDir(OLD)) ? undefined : true),
    (gone) => gone,
    RETIRE_BOUND_MS
  ).catch(() => undefined);
  const retiredLine = (await fleet.logs("agent"))
    .split("\n")
    .find((line) => line.includes(`[fleet-mcp] retired ${PACKAGE}@${OLD}`));
  kit.check(
    `${OLD}'s install was retired ${Math.round((Date.now() - closedAt) / 1000)} s after its last server ended (within ${RETIRE_BOUND_MS / 1000} s): ${retiredLine?.trim().slice(0, 120)}`,
    !!retired && !!retiredLine && existsSync(installDir(NEW))
  );
  await second?.client.close();

  // A package the registry does not have: the row says npm's sentence.
  kit.check(
    `the fleet runs ${MISSING}`,
    await putRow(MISSING, ["-y", `${MISSING_PACKAGE}@1.0.0`])
  );
  const missing = await until(
    `the row reads ${MISSING} failed`,
    () => {
      const text = fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((one) => one.fleet ?? "")
        .find((one) => one.includes(MISSING));
      return text ? (JSON.parse(text) as Row).mcp?.[MISSING] : undefined;
    },
    (state) => state.state === "failed",
    180_000
  ).catch(() => undefined);
  kit.check(
    `a package the registry lacks reads failed with npm's sentence: ${missing?.detail?.split("\n")[0]?.slice(0, 160)}`,
    missing?.state === "failed" &&
      missing.detail?.includes("404 Not Found") === true,
    JSON.stringify(missing)
  );
};

const spec: Spec = {
  name: "fleet-mcp-install",
  run,
};

export default spec;
