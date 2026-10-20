/**
 * The fleet's MCP servers reach CawCo's sessions on every harness, each
 * through that harness's own per-session API, and none of the person's own
 * config files (agent fleet-mcp-set.ts):
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code, OpenCode and
 * pi against the mock model) where the person already has a server of his
 * own, `his`, in the user scope each of his CLIs reads (Claude Code's
 * `~/.claude.json` and the account's, OpenCode's `opencode.json`, pi's
 * `mcp.json`), and the fleet adds `probefleet` (both
 * fixtures/shared-mcp-server.ts, `whoami` answering its pid, each process
 * writing its pid into a directory of its own):
 *
 * - the machine's row reads `probefleet` applied for Claude Code, OpenCode
 *   and pi alike;
 * - a session on each harness calls `probefleet`'s `whoami`, and the answer
 *   names a process of the fleet's;
 * - the same sessions call `his` `whoami`, answered by a process of his;
 * - the fleet's row moves to another config, and the same three sessions,
 *   with no new one spawned, call it again: answered by a process of the
 *   new config's;
 * - what CawCo wrote into his files before (a server its sidecar names, one
 *   its old-named sidecar names, the fleet's own name, a placed copy, its own
 *   server in OpenCode's file) is gone after the first sync: Claude Code's
 *   `~/.claude.json` and the account's, OpenCode's `opencode.json` and pi's
 *   `mcp.json` hold `his` and nothing of CawCo's, and the old sidecar and the
 *   sidecar's list of what it wrote are gone;
 * - the OpenCode server CawCo's session runs on lists no plan agent and lists his own, and his `opencode.json`
 *   holds his agent and not the plan agent's `disabled` CawCo once wrote.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts fleet-mcp-parity
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  at,
  opencodeClient,
} from "../../../packages/agent/src/harnesses/opencode-client";
import {
  CLAUDE_DIR_NAME,
  CLAUDE_JSON_NAME,
} from "../../../packages/core/src/claude-dirs";
import {
  ACCOUNT,
  type Harness,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const FLEET = "probefleet";
const HIS = "his";
/** His own OpenCode agent, beside the plan agent. */
const HIS_AGENT = "hisagent";
/** The machine's OpenCode generation record (agent opencode-server.ts `recordStem`), not an account's. */
const SERVER_RECORD = /^opencode-server-[0-9a-f]{16}\.json$/;
const FIXTURE = join(import.meta.dir, "../fixtures/shared-mcp-server.ts");
const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const TAG = /PROBE-PARITY-([A-Z]+)-(\d+): (fleet|his)/g;
const PID = /PROBE-PID (\d+)/g;
/** OpenCode's Code Mode tool, which runs MCP tools from a script (document-scope.ts). */
const CODE_MODE = "execute";

/** Each ask, by `<HARNESS>-<n>`: whether its search and its call went out, and the pid that answered. */
const steps = new Map<string, { called?: boolean; searched?: boolean }>();
const answers = new Map<string, string>();

/** A message part's words: a string, or the text of its blocks. */
const wordsOf = (content: unknown): string => {
  if (typeof content === "string") {
    return content;
  }
  return Array.isArray(content)
    ? (content as { text?: string; content?: unknown }[])
        .map((part) => part.text ?? wordsOf(part.content))
        .join("\n")
    : "";
};

/** A session's log line up to what it did with the change. */
const TOOK_PREFIX = /^.*fleet MCP /;

/**
 * The words of the request's last tool result: an Anthropic message's last
 * `tool_result` block, or a chat completion's last `tool` message.
 */
const lastToolResult = (body: string): string => {
  const messages =
    (JSON.parse(body) as { messages?: { content?: unknown; role?: string }[] })
      .messages ?? [];
  for (const message of [...messages].reverse()) {
    if (message.role === "tool") {
      return wordsOf(message.content);
    }
    const block = Array.isArray(message.content)
      ? (message.content as { type?: string; content?: unknown }[]).findLast(
          (part) => part.type === "tool_result"
        )
      : undefined;
    if (block) {
      return wordsOf(block.content);
    }
  }
  return "";
};

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

/**
 * One ask, `PROBE-PARITY-<H>-<n>: fleet|his`: `whoami` of that server called
 * as the harness offers it (declared, behind Claude Code's ToolSearch or pi's
 * `tool_search`, or in OpenCode's Code Mode catalog), and the pid its answer
 * names kept.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const found = [...request.all.matchAll(TAG)].at(-1);
  if (!found) {
    return text("ok");
  }
  const key = `${found[1]}-${found[2]}`;
  const server = found[3] === "his" ? HIS : FLEET;
  const step = steps.get(key) ?? {};
  steps.set(key, step);
  if (step.called) {
    if (request.afterTool && !answers.has(key)) {
      const result = lastToolResult(request.body);
      answers.set(
        key,
        [...result.matchAll(PID)].at(-1)?.[1] ??
          `no pid: ${result.slice(0, 300)}`
      );
    }
    return text("done");
  }
  const tool = `mcp__${server}__whoami`;
  if (request.toolNames.includes(tool)) {
    step.called = true;
    return call(tool, {});
  }
  if (request.toolNames.includes(CODE_MODE)) {
    step.called = true;
    return call(CODE_MODE, {
      code: `return await tools.${server}.whoami({});`,
    });
  }
  if (!step.searched && request.toolNames.includes("ToolSearch")) {
    step.searched = true;
    return call("ToolSearch", { query: `select:${tool}`, max_results: 1 });
  }
  if (!step.searched && request.toolNames.includes("tool_search")) {
    step.searched = true;
    return call("tool_search", { query: `${server} whoami` });
  }
  step.called = true;
  answers.set(key, "none offered");
  return text(`No ${tool} is offered.`);
};

/** The pids the fixture wrote into `dir`. */
const pidsIn = async (dir: string): Promise<string[]> =>
  await readdir(dir).catch(() => [] as string[]);

/** A stdio server of the fixture's, writing its pids into `dir`. */
const fixture = (dir: string) => ({
  command: process.execPath,
  args: [FIXTURE],
  env: { PROBE_MCP_PIDS: dir },
});

const readJson = async (path: string): Promise<Record<string, unknown>> =>
  JSON.parse(await readFile(path, "utf8").catch(() => "{}")) as Record<
    string,
    unknown
  >;

/**
 * The agents the machine's OpenCode server has in `directory`, as its own
 * API lists them: the server and its password from the generation record
 * the agent keeps in `home`. None when there is no record.
 */
const opencodeAgents = async (
  home: string,
  directory: string
): Promise<string[]> => {
  const file = (await readdir(join(home, ".cawco"))).find((name) =>
    SERVER_RECORD.test(name)
  );
  const record = file
    ? ((await readJson(join(home, ".cawco", file))) as {
        active?: { password?: string; url?: string };
      })
    : {};
  if (!record.active?.url) {
    return [];
  }
  const listed = await opencodeClient({
    url: record.active.url,
    password: record.active.password ?? "",
  }).agent.list(at(directory));
  return listed.data.map((agent) => agent.id);
};

interface Row {
  mcp?: Record<string, { detail?: string; state?: string }>;
  mcpByHarness?: Record<string, Record<string, { state?: string }> | undefined>;
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const home = fleet.env.HOME as string;
  const pids = (name: string) => join(fleet.sandbox, `pids-${name}`);
  await Promise.all(
    ["fleet1", "fleet2", ...HARNESSES.map((h) => `his-${h}`)].map((name) =>
      mkdir(pids(name), { recursive: true })
    )
  );

  // The person's own server, in each of his CLIs' user scope, before any
  // agent runs: Claude Code's machine file and the account's own (where
  // CawCo's sessions on it read theirs), OpenCode's, pi's.
  const claudeJson = join(home, CLAUDE_JSON_NAME);
  const accountJson = join(
    home,
    ".cawco",
    "accounts",
    ACCOUNT,
    "claude",
    CLAUDE_JSON_NAME
  );
  const opencodeJson = join(home, ".config", "opencode", "opencode.json");
  const piJson = join(home, ".pi", "agent", "mcp.json");
  // Beside his, what CawCo wrote into his files before its sessions took the
  // fleet's servers through their harness's API, which its first sync takes
  // back out: a server its sidecar names, one the sidecar of its old name
  // (`cockpit-fleet.json`) names, the fleet's own name (whose entry a merge
  // overwrote), a placed copy in a folder's map, and in OpenCode's file its
  // own server.
  const legacy = fixture(pids("legacy"));
  const placedFolder = join(home, "placed-folder");
  for (const path of [claudeJson, accountJson]) {
    // biome-ignore lint/performance/noAwaitInLoops: two files, each read and written whole
    const root = await readJson(path);
    await writeFile(
      path,
      JSON.stringify({
        ...root,
        mcpServers: {
          [HIS]: fixture(pids("his-claude")),
          oldfleet: legacy,
          cockpitold: legacy,
          [FLEET]: legacy,
        },
        projects: {
          [placedFolder]: { mcpServers: { placedold: legacy } },
        },
      })
    );
  }
  const sidecar = join(home, CLAUDE_DIR_NAME, "cawco-fleet.json");
  const legacySidecar = join(home, CLAUDE_DIR_NAME, "cockpit-fleet.json");
  await mkdir(join(home, CLAUDE_DIR_NAME), { recursive: true });
  await writeFile(
    sidecar,
    JSON.stringify({
      mcp: ["oldfleet"],
      placedMcp: {
        "placedold@place-old": { cwd: placedFolder, name: "placedold" },
      },
    })
  );
  await writeFile(legacySidecar, JSON.stringify({ mcp: ["cockpitold"] }));
  const opencode = await readJson(opencodeJson);
  await writeFile(
    opencodeJson,
    JSON.stringify({
      ...opencode,
      mcp: {
        servers: {
          [HIS]: {
            type: "local",
            command: [process.execPath, FIXTURE],
            environment: { PROBE_MCP_PIDS: pids("his-opencode") },
          },
          cawco: { type: "remote", url: "http://127.0.0.1:9/mcp/cawco" },
        },
      },
      // His own agent, and the plan agent's `disabled` CawCo once wrote
      // here to turn its plan mode off (its sidecar below says so).
      agents: {
        [HIS_AGENT]: { description: "his own agent", system: "his" },
        plan: { disabled: true },
      },
    })
  );
  await writeFile(
    join(home, ".config", "opencode", "cawco-fleet.json"),
    JSON.stringify({ skills: {}, mcp: [], planAgentDisabled: true })
  );
  await writeFile(
    piJson,
    JSON.stringify({ mcpServers: { [HIS]: fixture(pids("his-pi")) } })
  );

  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();

  const row = (): Row | undefined => {
    const said = fleet
      .query<{ fleet: string | null }>("SELECT fleet FROM agents")
      .map((one) => one.fleet ?? "")
      .find((one) => one.includes(FLEET));
    return said ? (JSON.parse(said) as Row) : undefined;
  };
  const put = async (dir: string): Promise<boolean> =>
    (
      await fetch(`${fleet.base}/api/fleet/mcp/${FLEET}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config: fixture(dir), enabled: true }),
      })
    ).ok;

  // The fleet's row is there before the agent's first sync, as it is when a
  // machine runs this build for the first time: that sync's cleanup knows
  // the fleet's names.
  kit.check(`the fleet runs ${FLEET}`, await put(pids("fleet1")));
  // CawCo's OpenCode sessions run with no plan agent, and his own
  // `opencode` keeps his.
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const applied = await until(
    `the row reads ${FLEET} applied for every harness`,
    row,
    (read) =>
      HARNESSES.every(
        (h) => read.mcpByHarness?.[h]?.[FLEET]?.state === "applied"
      ),
    240_000
  ).catch(() => undefined);
  kit.check(
    `the machine reads ${FLEET} applied for Claude Code, OpenCode and pi (${HARNESSES.map((h) => `${h}: ${row()?.mcpByHarness?.[h]?.[FLEET]?.state}`).join(", ")})`,
    !!applied,
    JSON.stringify(row()?.mcp?.[FLEET])
  );

  const sessions: Partial<Record<Harness, string>> = {};
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's start at a time
    sessions[harness] = await fleet.spawn(harness, `Parity ${harness}`);
  }
  let asked = 0;
  /** One ask to each session, answered by the pid of the server it named. */
  const askAll = async (
    server: "fleet" | "his"
  ): Promise<Record<Harness, string | undefined>> => {
    asked += 1;
    const n = asked;
    await Promise.all(
      HARNESSES.map((harness) =>
        fleet.send(
          sessions[harness] as string,
          `PROBE-PARITY-${harness.toUpperCase()}-${n}: ${server}`
        )
      )
    );
    const result = {} as Record<Harness, string | undefined>;
    await Promise.all(
      HARNESSES.map(async (harness) => {
        const key = `${harness.toUpperCase()}-${n}`;
        result[harness] = await until(
          `${harness}'s ${server} call`,
          () => answers.get(key),
          (said) => said !== undefined,
          180_000
        ).catch(() => undefined);
      })
    );
    return result;
  };

  const first = await askAll("fleet");
  const fleetPids = await pidsIn(pids("fleet1"));
  for (const harness of HARNESSES) {
    kit.check(
      `${harness}: a CawCo session called ${FLEET}'s whoami, answered by a fleet process (pid ${first[harness]})`,
      !!first[harness] && fleetPids.includes(first[harness] as string),
      JSON.stringify({ answered: first[harness], fleetPids })
    );
  }

  // The agents the OpenCode server CawCo's session runs on has in its
  // folder, as OpenCode's own API lists them (the machine's generation
  // record names the server and its password).
  // A location answers an empty list until it has loaded its config.
  const agents = await until(
    "the OpenCode server lists its agents",
    () => opencodeAgents(home, fleet.workdir),
    (listed) => listed.length > 0,
    60_000
  ).catch(() => [] as string[]);
  kit.check(
    `opencode: the server CawCo's session runs on has no plan agent and has his ${HIS_AGENT} (${agents.join(", ")})`,
    agents.length > 0 && !agents.includes("plan") && agents.includes(HIS_AGENT),
    JSON.stringify({ agents })
  );

  const his = await askAll("his");
  for (const harness of HARNESSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one harness's pids at a time
    const own = await pidsIn(pids(`his-${harness}`));
    kit.check(
      `${harness}: the same session called his own ${HIS}'s whoami, answered by his process (pid ${his[harness]})`,
      !!his[harness] && own.includes(his[harness] as string),
      JSON.stringify({ answered: his[harness], own })
    );
  }

  // The fleet's row moves to another config; the running sessions take it.
  const spawnsBefore = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM instances"
  )[0]?.n;
  kit.check(
    `the fleet's ${FLEET} moves to a new config`,
    await put(pids("fleet2"))
  );
  await until(
    `the sync wrote ${FLEET}'s new config`,
    async () =>
      JSON.stringify(
        await readJson(
          join(home, ".local", "share", "cawco", "fleet-mcp-set.json")
        )
      ),
    (said) => said.includes(pids("fleet2")),
    120_000
  ).catch(() => undefined);
  // Each session says on the machine's log what it did with the change.
  const tookLines = (log: string) =>
    HARNESSES.map((harness) =>
      log
        .split("\n")
        .find((line) =>
          line.includes(
            `[${harness}] ${sessions[harness]}: fleet MCP ${FLEET} config`
          )
        )
    );
  const took = await until(
    "each session took the fleet's change",
    async () => tookLines(await fleet.logs("agent")),
    (lines) => lines.every(Boolean),
    240_000
  ).catch(async () => tookLines(await fleet.logs("agent")));
  kit.check(
    `each running session took the change: ${took.map((line) => line?.replace(TOOK_PREFIX, "")).join(" | ")}`,
    took.every(Boolean),
    took.join("\n")
  );
  // How the Claude session's own CLI holds the fleet's server and his, as
  // the dashboard reads it: the fleet's from the session alone (`dynamic`,
  // set through the SDK), his from his config file (`user`).
  const status = await fleet.controlAnswer(
    "mcpServerStatus",
    [],
    60_000,
    sessions.claude
  );
  const held = (name: string) =>
    (
      (status.result as
        { name?: string; scope?: string; status?: string }[] | undefined) ?? []
    ).find((server) => server.name === name);
  kit.check(
    `claude: its CLI holds ${FLEET} ${held(FLEET)?.status} from the session (${held(FLEET)?.scope}), and his ${HIS} ${held(HIS)?.status} from his file (${held(HIS)?.scope})`,
    held(FLEET)?.status === "connected" &&
      held(FLEET)?.scope === "dynamic" &&
      held(HIS)?.status === "connected" &&
      held(HIS)?.scope === "user",
    JSON.stringify(status).slice(0, 1500)
  );
  const moved = await askAll("fleet");
  const newPids = await pidsIn(pids("fleet2"));
  const spawnsAfter = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM instances"
  )[0]?.n;
  for (const harness of HARNESSES) {
    kit.check(
      `${harness}: with no new session (${spawnsBefore} → ${spawnsAfter} sessions), the same session called ${FLEET} on its new config (pid ${moved[harness]})`,
      spawnsBefore === spawnsAfter &&
        !!moved[harness] &&
        newPids.includes(moved[harness] as string),
      JSON.stringify({ answered: moved[harness], newPids })
    );
  }

  // The person's own files: his server, and nothing of CawCo's.
  const files: [string, string, () => Promise<string[]>][] = [
    [
      `Claude Code's ${CLAUDE_JSON_NAME} in the home`,
      claudeJson,
      async () =>
        Object.keys(
          ((await readJson(claudeJson)).mcpServers as object | undefined) ?? {}
        ),
    ],
    [
      "OpenCode's opencode.json",
      opencodeJson,
      async () => {
        const mcp = ((await readJson(opencodeJson)).mcp ?? {}) as Record<
          string,
          unknown
        >;
        return [
          ...Object.keys((mcp.servers as object | undefined) ?? {}),
          ...Object.keys(mcp).filter((name) => name !== "servers"),
        ];
      },
    ],
    [
      `the account's ${CLAUDE_JSON_NAME}`,
      accountJson,
      async () =>
        Object.keys(
          ((await readJson(accountJson)).mcpServers as object | undefined) ?? {}
        ),
    ],
    [
      "pi's mcp.json",
      piJson,
      async () =>
        Object.keys(
          ((await readJson(piJson)).mcpServers as object | undefined) ?? {}
        ),
    ],
  ];
  for (const [label, path, names] of files) {
    // biome-ignore lint/performance/noAwaitInLoops: one file at a time
    const inFile = await names();
    kit.check(
      `${label} holds his ${HIS} and nothing of CawCo's: ${inFile.join(", ")}`,
      inFile.length === 1 && inFile[0] === HIS,
      await readFile(path, "utf8").catch(() => "(missing)")
    );
  }
  const hisAgents = Object.keys(
    ((await readJson(opencodeJson)).agents as object | undefined) ?? {}
  );
  kit.check(
    `OpenCode's opencode.json holds his own agents and none CawCo wrote: ${hisAgents.join(", ")}`,
    hisAgents.length === 1 && hisAgents[0] === HIS_AGENT,
    JSON.stringify((await readJson(opencodeJson)).agents)
  );
  const placed = (
    (await readJson(claudeJson)).projects as
      Record<string, { mcpServers?: object }> | undefined
  )?.[placedFolder]?.mcpServers;
  const kept = await readJson(sidecar);
  const oldSidecar = await readFile(legacySidecar, "utf8").catch(() => "");
  kit.check(
    `the cleanup took the placed copy out of its folder's map (${JSON.stringify(placed)}), dropped the old sidecar (${oldSidecar ? "still there" : "gone"}) and the sidecar's list of what it wrote (${JSON.stringify(kept.mcp ?? null)})`,
    Object.keys(placed ?? {}).length === 0 &&
      oldSidecar === "" &&
      kept.mcp === undefined &&
      kept.placedMcp === undefined,
    JSON.stringify({ placed, kept })
  );
  await Promise.allSettled(
    Object.values(sessions).map((id) => fleet.stopSession(id as string))
  );
};

const spec: Spec = { name: "fleet-mcp-parity", run };

export default spec;
