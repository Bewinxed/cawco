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
 * - up to the first fleet change, the starting agent got one fleet sync,
 *   held until every harness its register named had reported, and its
 *   location was evicted by fleet MCP status at most once;
 * - a session on each harness calls `probefleet`'s `whoami`, and the answer
 *   names a process of the fleet's;
 * - the same sessions call `his` `whoami`, answered by a process of his;
 * - the fleet's row moves to another config, and the agent takes the sync
 *   within {@link HELD_MS} of the PUT; the same three sessions,
 *   with no new one spawned, call it again: answered by a process of the
 *   new config's;
 * - what CawCo wrote into his files before (a server its sidecar names, one
 *   its old-named sidecar names, the fleet's own name, a placed copy, its own
 *   server in OpenCode's file) is gone after the first sync: Claude Code's
 *   `~/.claude.json` and the account's, OpenCode's `opencode.json` and pi's
 *   `mcp.json` hold `his` and nothing of CawCo's, and the old sidecar and the
 *   sidecar's list of what it wrote are gone;
 * - the OpenCode server CawCo's session runs on lists no plan agent and lists his own, and his `opencode.json`
 *   holds his agent and not the plan agent's `disabled` CawCo once wrote;
 * - the fleet adds `probedocs`, an OAuth server (mcp-oauth-mock.ts) the hub
 *   is not signed in to: the row reads it `needs-auth` on Claude Code,
 *   OpenCode and pi, in the hub's words; from its addition to
 *   {@link QUIET_MS} after that, longer than the first two waits of the
 *   backoff that used to retry it, the agent's log has at most one
 *   `location evicted by fleet MCP status` (the addition's sync reading
 *   `probefleet`; the new generation's pass reads nothing more) and nothing
 *   read or started it again;
 * - the hub signs in to it: the row reads it applied on every harness, and
 *   the same three sessions, with no new one spawned, call its `whoami`;
 * - a project binds `probeplaced` (the fixture) to its one place here, and a
 *   second place is added, then removed (`POST`/`DELETE
 *   /api/projects/:id/places`: the hub's "a place changed" sync, the one a
 *   workspace's cut and archive send; cutting a real one needs a delegate's
 *   boundary, which a workspace cannot start): each time the place file
 *   holds what the hub carried, and for {@link PLACE_WATCH_MS} after the
 *   sync the machine's OpenCode server is the same generation, nothing is
 *   applied, no location is evicted by fleet MCP status and no OpenCode
 *   location boots (his own server, which only an OpenCode location starts,
 *   does not start);
 * - with every session stopped, the person edits his `opencode.json` and the
 *   hub is asked for a sync: for {@link IDLE_MS} the machine starts no
 *   OpenCode server, applies nothing, evicts nothing and starts no MCP
 *   server, and its log says the edit waits for the next need; the next
 *   OpenCode session's start applies it;
 * - the fleet carries a `chrome-devtools` and an OpenCode session starts in a
 *   folder no workspace holds: no process of it runs under an OpenCode
 *   server, and the row reads it applied for OpenCode.
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
  MACHINE,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { mcpOauthMock, signIn } from "../mcp-oauth-mock";

const FLEET = "probefleet";
const HIS = "his";
/** The fleet's OAuth server the hub signs in to only late in the spec. */
const DOCS = "probedocs";
/** What it lists once signed in to; a call answers "Posted." (mcp-oauth-mock.ts). */
const DOCS_TOOL = {
  name: "whoami",
  description: "Say who answers.",
  inputSchema: { type: "object", properties: {} },
};
/**
 * How long the agent is watched while the hub holds no sign-in for it:
 * past the first two waits of the backoff OpenCode's pass once retried it
 * on (15 s, then 30 s: opencode.ts `MCP_RETRY_FIRST_MS`), with margin.
 */
const QUIET_MS = 90_000;
/** The words every harness says a server waiting on the hub's sign-in with (core `MCP_NEEDS_SIGN_IN`). */
const SIGN_IN_WORDS = "Sign in to this server from Configure → MCP servers.";
/** His own OpenCode agent, beside the plan agent. */
const HIS_AGENT = "hisagent";
/** A project's server, bound to its places (the fixture). */
const PLACED = "probeplaced";
/**
 * How long the agent is watched after a place's sync: past the first pass a
 * new generation's publication schedules (15 s, opencode.ts
 * `MCP_RETRY_FIRST_MS`) and a location release's retry (30 s,
 * `DIRECTORY_RELEASE_RETRY_MS`), with margin.
 */
const PLACE_WATCH_MS = 45_000;
/**
 * How long an idle machine is watched: 11 minutes. Longer than the Mac's
 * cadence (a server started at its home folder about every 10 minutes,
 * 2026-10-22), and twice every timer the OpenCode adapter runs on a machine
 * with nothing running, short of the hourly sign-in check: the model
 * catalog's refresh (5 min, opencode-models.ts `REFRESH_MS`), the stray
 * server sweep and an account server's idle retirement (5 min each,
 * opencode.ts `STRAY_SWEEP_MS`, `ACCOUNT_SERVER_IDLE_MS`) and the fleet MCP
 * pass's longest wait (5 min, `MCP_RETRY_MAX_MS`).
 */
const IDLE_MS = 11 * 60_000;
/** The machine's OpenCode generation record (agent opencode-server.ts `recordStem`), not an account's. */
const SERVER_RECORD = /^opencode-server-[0-9a-f]{16}\.json$/;
const FIXTURE = join(import.meta.dir, "../fixtures/shared-mcp-server.ts");
const HARNESSES: Harness[] = ["claude", "opencode", "pi"];
const TAG = /PROBE-PARITY-([A-Z]+)-(\d+): (fleet|his|docs)/g;
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
  const server = { his: HIS, docs: DOCS }[found[3] as string] ?? FLEET;
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

/** The agent's line for each location a fleet MCP status read booted and let go (opencode.ts `#releaseDirectory`). */
const EVICTED = "location evicted by fleet MCP status";
/** What the hub's log says before a welcome's count and reason (hub fleet-sync.ts). */
const SYNC_PREFIX = /^.*\[fleet\] welcome rev \d+ sent → /;
/** The wait 8ca774966 put on every fleet sync, which only the start-up's first may have. */
const HELD_MS = 1500;
/** A fleet sync the agent took, and how many servers it carried. */
const SYNC_LINE = /\[fleet\] sync from the hub: (.*)$/;

/**
 * What the agent's log says each fleet sync cost in fleet MCP status reads,
 * from its first sync on: per sync (`[fleet] sync from the hub`), the
 * generations OpenCode published (`config-convergence` applied), the passes
 * those publications scheduled that found the sync's reading taken and read
 * nothing (opencode.ts `#mendFleetMcp`), and the locations evicted by fleet
 * MCP status. An eviction's line can land in the next sync's span when its
 * release waited, so the evictions are judged in total: at most one read,
 * the sync's own, for each sync.
 */
const statusReads = (
  log: string
): { evicted: number; published: number; skipped: number; sync: string }[] => {
  const counts: {
    evicted: number;
    published: number;
    skipped: number;
    sync: string;
  }[] = [];
  for (const line of log.split("\n")) {
    const sync = SYNC_LINE.exec(line);
    if (sync) {
      counts.push({
        sync: `#${counts.length + 1} (${sync[1]})`,
        evicted: 0,
        published: 0,
        skipped: 0,
      });
    }
    const last = counts.at(-1);
    if (!(sync || last === undefined)) {
      last.evicted += Number(line.includes(EVICTED));
      last.published += Number(
        line.includes('"type":"config-convergence","state":"applied"')
      );
      last.skipped += Number(line.includes("fleet MCP pass: generation"));
    }
  }
  return counts;
};

/**
 * The fleet's {@link DOCS}, an OAuth server the hub is not signed in to, on
 * the machine `run` stood up with its three sessions (`askAll` asks each):
 * a verdict that waits for the sign-in, never a failure tried again on a
 * timer, and the sign-in reaches the sessions in place. {@link FLEET}
 * stays: the addition's sync reads it once, booting the machine location
 * once, and the pass the new generation's publication schedules finds that
 * reading taken and reads nothing (opencode.ts `#mendFleetMcp`), so one
 * eviction by fleet MCP status is the whole of the change's.
 */
const waitsForSignIn = async (
  kit: Kit,
  fleet: KitFleet,
  askAll: (
    server: "fleet" | "his" | "docs"
  ) => Promise<Record<Harness, string | undefined>>
): Promise<void> => {
  // A fleet server the hub holds no sign-in for: a verdict that waits for
  // the sign-in, never a failure tried again on a timer.
  const row = (): Row | undefined => {
    const said = fleet
      .query<{ fleet: string | null }>("SELECT fleet FROM agents")
      .map((one) => one.fleet ?? "")
      .at(0);
    return said ? (JSON.parse(said) as Row) : undefined;
  };
  const docs = mcpOauthMock([DOCS_TOOL]);
  try {
    const added = await fleet.logMark("agent");
    const putDocs = await fetch(`${fleet.base}/api/fleet/mcp/${DOCS}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        config: { type: "http", url: docs.url },
        enabled: true,
      }),
    });
    kit.check(
      `the fleet adds ${DOCS}, an OAuth server the hub is not signed in to`,
      putDocs.ok,
      `${putDocs.status} ${await putDocs.text()}`
    );
    const docsStates = () =>
      HARNESSES.map(
        (h) => `${h}: ${row()?.mcpByHarness?.[h]?.[DOCS]?.state}`
      ).join(", ");
    const waiting = await until(
      `the row reads ${DOCS} needs-auth for every harness`,
      row,
      (read) =>
        HARNESSES.every(
          (h) => read.mcpByHarness?.[h]?.[DOCS]?.state === "needs-auth"
        ),
      180_000
    ).catch(() => undefined);
    kit.check(
      `the machine reads ${DOCS} needs-auth, in the hub's words, on Claude Code, OpenCode and pi (${docsStates()})`,
      !!waiting && row()?.mcp?.[DOCS]?.detail?.includes(SIGN_IN_WORDS) === true,
      JSON.stringify(row()?.mcp?.[DOCS])
    );

    await Bun.sleep(QUIET_MS);
    const during = (await added.since()).split("\n");
    const evicted = during.filter((line) => line.includes(EVICTED));
    const again = during.filter(
      (line) =>
        line.includes(DOCS) &&
        (line.includes("fleet MCP read again later") ||
          line.includes("OpenCode held it failed"))
    );
    kit.check(
      `from its addition to ${QUIET_MS / 1000} s after it read needs-auth, ${evicted.length} location eviction(s) by fleet MCP status, the sync's own read of ${FLEET} at most, and nothing read or started ${DOCS} again (${again.length}); the row still reads ${docsStates()}`,
      evicted.length <= 1 &&
        again.length === 0 &&
        HARNESSES.every(
          (h) => row()?.mcpByHarness?.[h]?.[DOCS]?.state === "needs-auth"
        ),
      [...evicted, ...again].join("\n").slice(0, 2000)
    );

    const spawnsSignedOut = fleet.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM instances"
    )[0]?.n;
    await signIn(fleet.base, DOCS);
    const signedIn = await until(
      `the row reads ${DOCS} applied for every harness`,
      row,
      (read) =>
        HARNESSES.every(
          (h) => read.mcpByHarness?.[h]?.[DOCS]?.state === "applied"
        ),
      180_000
    ).catch(() => undefined);
    kit.check(
      `after the hub's sign-in the machine reads ${DOCS} applied (${docsStates()})`,
      !!signedIn,
      JSON.stringify(row()?.mcp?.[DOCS])
    );
    const called = await askAll("docs");
    const spawnsSignedIn = fleet.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM instances"
    )[0]?.n;
    for (const harness of HARNESSES) {
      kit.check(
        `${harness}: with no new session (${spawnsSignedOut} → ${spawnsSignedIn} sessions), the same session called ${DOCS}'s whoami after the sign-in (${called[harness]})`,
        spawnsSignedOut === spawnsSignedIn &&
          called[harness]?.includes("Posted.") === true,
        JSON.stringify({ answered: called[harness] })
      );
    }
  } finally {
    docs.stop();
  }
};

/**
 * The agent's start, up to the first fleet change: one welcome (hub
 * fleet-sync.ts), converged on every harness the agent has, and one read
 * of the fleet's servers for it.
 */
const startedOnce = async (kit: Kit, fleet: KitFleet): Promise<void> => {
  const syncs = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => SYNC_PREFIX.test(line));
  const evicted = (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(EVICTED)).length;
  kit.check(
    `the agent's start-up got ${syncs.length} fleet sync(s) before the first fleet change, on ${HARNESSES.join(", ")}, and its location was evicted by fleet MCP status ${evicted} time(s): ${syncs[0]?.replace(SYNC_PREFIX, "")}`,
    syncs.length === 1 && evicted <= 1,
    syncs.join("\n")
  );
};

/**
 * A fleet change after the start (`change`, the fleet's {@link FLEET} moved)
 * goes out when it is asked: the agent's log is read every 25 ms, finer
 * than `until`'s half second, for its word that it took the sync.
 */
const syncedAtOnce = async (
  kit: Kit,
  fleet: KitFleet,
  change: () => Promise<boolean>
): Promise<void> => {
  const before = await fleet.logMark("agent");
  const putAt = performance.now();
  kit.check(`the fleet's ${FLEET} moves to a new config`, await change());
  let reachedMs: number | undefined;
  while (reachedMs === undefined && performance.now() - putAt < 10_000) {
    // biome-ignore lint/performance/noAwaitInLoops: one look at the log every 25 ms until the sync is taken
    if ((await before.since()).includes("[fleet] sync from the hub")) {
      reachedMs = performance.now() - putAt;
    } else {
      await Bun.sleep(25);
    }
  }
  kit.check(
    `the fleet change reached the agent ${reachedMs === undefined ? "never" : `${Math.round(reachedMs)} ms`} after the PUT, under the ${HELD_MS} ms every sync waited in 8ca774966`,
    reachedMs !== undefined && reachedMs < HELD_MS
  );
};

/** The machine's active OpenCode generation, by the record the agent keeps in `home`. */
const activeGeneration = async (home: string): Promise<string | undefined> => {
  const file = (await readdir(join(home, ".cawco"))).find((name) =>
    SERVER_RECORD.test(name)
  );
  return file
    ? (
        (await readJson(join(home, ".cawco", file))) as {
          active?: { procId?: string };
        }
      ).active?.procId
    : undefined;
};

/** How many processes the fixture servers writing into `dirs` have started so far. */
const startedIn = async (dirs: string[]): Promise<number> =>
  (await Promise.all(dirs.map(pidsIn))).reduce(
    (sum, one) => sum + one.length,
    0
  );

/** The agent's log lines that say each sign of churn. */
interface Churn {
  applying: string[];
  evicted: string[];
  left: string[];
  started: string[];
  synced: string[];
}

/** The agent's log lines since `mark` that say each sign of churn, by name. */
const churnSince = async (mark: {
  since: () => Promise<string>;
}): Promise<Churn> => {
  const lines = (await mark.since()).split("\n");
  const saying = (words: string) =>
    lines.filter((line) => line.includes(words));
  return {
    // A server generation's event feed coming up: a server started.
    started: saying("subscribe ready"),
    applying: saying('"state":"applying"'),
    evicted: saying(EVICTED),
    synced: saying("[fleet] sync from the hub"),
    left: saying("left for the next need"),
  };
};

/**
 * A project's place added and removed (hub "a place changed", the sync a
 * workspace's cut and archive send) touches that place alone: the place
 * file holds what the hub carried, and the machine's OpenCode server is not
 * replaced, nothing is applied or evicted, and nothing starts in the
 * server's own location (`home` pids: the person's own server, which every
 * OpenCode location boot starts and no other harness does). Live sessions
 * run meanwhile, so an apply
 * would not wait for the machine to be idle.
 */
const placeTouchesItsPlace = async (
  kit: Kit,
  fleet: KitFleet,
  placedPids: string,
  homePids: string[]
): Promise<void> => {
  const home = fleet.env.HOME as string;
  const folder = (name: string) => join(fleet.sandbox, name);
  for (const name of ["place-main", "place-cut"]) {
    // biome-ignore lint/performance/noAwaitInLoops: two folders, each made once
    await Bun.$`mkdir -p ${folder(name)} && git init -q -b main ${folder(name)}`.quiet();
  }
  const { id: project } = await fleet.api<{ id: string }>("/api/projects", {
    name: "Places",
    caw: false,
  });
  await fleet.api(`/api/projects/${project}/places`, {
    machineId: MACHINE,
    path: folder("place-main"),
  });
  const placedFile = join(home, ".config", "opencode", "cawco-placed-mcp.json");
  const placedAt = async () =>
    Object.values(await readJson(placedFile)).map(
      (one) => (one as { cwd?: string }).cwd ?? ""
    );
  const bound = await fetch(`${fleet.base}/api/fleet/mcp/${PLACED}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: fixture(placedPids),
      enabled: true,
      projectId: project,
    }),
  });
  kit.check(
    `the fleet binds ${PLACED} to a project with one place here`,
    bound.ok,
    `${bound.status} ${await bound.text()}`
  );
  await until(
    `${PLACED} placed at the project's place`,
    placedAt,
    (cwds) => cwds.includes(folder("place-main")),
    120_000
  ).catch(() => undefined);
  // Whatever the binding's own sync set going is over before the place's.
  await Bun.sleep(PLACE_WATCH_MS);

  const watch = async (
    what: string,
    change: () => Promise<boolean>,
    placed: (cwds: string[]) => boolean
  ): Promise<void> => {
    const agent = await fleet.logMark("agent");
    const hub = await fleet.logMark("hub");
    const generation = await activeGeneration(home);
    const before = await startedIn(homePids);
    kit.check(`the project's place ${what}`, await change());
    const synced = await until(
      `the agent took the sync for the place ${what}`,
      async () => (await churnSince(agent)).synced,
      (lines) => lines.length > 0,
      60_000
    ).catch(() => [] as string[]);
    const placedNow = await until(
      `the place file after the place ${what}`,
      placedAt,
      placed,
      60_000
    ).catch(placedAt);
    await Bun.sleep(PLACE_WATCH_MS);
    const churn = await churnSince(agent);
    const said = (await hub.since())
      .split("\n")
      .filter((line) => line.includes("a place changed"));
    const after = await activeGeneration(home);
    const started = (await startedIn(homePids)) - before;
    kit.check(
      `the place ${what}: the hub said "a place changed" (${said.length}), the agent synced (${synced.length}) and placed ${PLACED} at ${placedNow.map((one) => one.replace(fleet.sandbox, "")).join(", ")}; for ${PLACE_WATCH_MS / 1000} s after, the machine's OpenCode server stayed ${generation} (now ${after}), ${churn.started.length} server(s) started, ${churn.applying.length} apply, ${churn.evicted.length} location(s) evicted by fleet MCP status, ${started} MCP server(s) started in its own location`,
      said.length > 0 &&
        synced.length > 0 &&
        placed(placedNow) &&
        generation !== undefined &&
        generation === after &&
        churn.started.length === 0 &&
        churn.applying.length === 0 &&
        churn.evicted.length === 0 &&
        started === 0,
      Object.values(churn).flat().join("\n").slice(0, 2000)
    );
  };

  let cut: string | undefined;
  await watch(
    "is added (a workspace cut)",
    async () => {
      const added = await fleet.api<{ place?: { id?: string } }>(
        `/api/projects/${project}/places`,
        { machineId: MACHINE, path: folder("place-cut") }
      );
      cut = added.place?.id;
      return cut !== undefined;
    },
    (cwds) =>
      cwds.includes(folder("place-main")) && cwds.includes(folder("place-cut"))
  );
  await watch(
    "is removed (a workspace archived)",
    async () =>
      (
        await fetch(`${fleet.base}/api/projects/${project}/places/${cut}`, {
          method: "DELETE",
        })
      ).ok,
    (cwds) =>
      cwds.includes(folder("place-main")) && !cwds.includes(folder("place-cut"))
  );
};

/** The fleet's browser server, by the name each harness gates it by (agent browser/door.ts `CHROME_DEVTOOLS`). */
const BROWSER = "chrome-devtools";

/** An OpenCode server's command line. */
const OPENCODE_SERVE = /opencode\S* serve/;

/** The command line of `pid`'s parent, read from /proc; empty when either is gone. */
const parentCommand = async (pid: string): Promise<string> => {
  const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "");
  // After the command's closing parenthesis: state, then the parent's pid.
  const [, ppid] = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
  return ppid
    ? (
        await readFile(`/proc/${ppid}/cmdline`, "utf8").catch(() => "")
      ).replaceAll("\0", " ")
    : "";
};

/**
 * chrome-devtools runs in an OpenCode location only through a workspace's
 * browser door. The fleet carries a `chrome-devtools` (the fixture, writing
 * its pids), and an OpenCode session starts in a folder no workspace holds:
 * its location boots (his own server starts there) and no process of the
 * fleet's browser server has an OpenCode server for a parent. Claude Code's
 * and pi's own status reads start it too, ungated, so a process is judged
 * by its parent. The row reads it applied for OpenCode, the status read
 * having started none. Linux only: a parent is read from /proc.
 */
const noBrowserOutsideWorkspace = async (
  kit: Kit,
  fleet: KitFleet,
  browserPids: string,
  homePids: string[]
): Promise<void> => {
  if (process.platform !== "linux") {
    kit.check("chrome-devtools outside a workspace: read on Linux only", true);
    return;
  }
  const put = await fetch(`${fleet.base}/api/fleet/mcp/${BROWSER}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ config: fixture(browserPids), enabled: true }),
  });
  kit.check(
    `the fleet runs a ${BROWSER} (the fixture)`,
    put.ok,
    `${put.status} ${await put.text()}`
  );
  const opencodeState = () => {
    const said = fleet
      .query<{ fleet: string | null }>("SELECT fleet FROM agents")
      .map((one) => one.fleet ?? "")
      .at(0);
    return said
      ? (JSON.parse(said) as Row).mcpByHarness?.opencode?.[BROWSER]
      : undefined;
  };
  const read = await until(
    `the row reads ${BROWSER} for OpenCode`,
    opencodeState,
    (state) => state?.state === "applied",
    180_000
  ).catch(opencodeState);
  const booted = await startedIn(homePids);
  const session = await fleet.spawn("opencode", "Outside a workspace");
  const location = await until(
    "the session's location booted (his own server started there)",
    () => startedIn(homePids),
    (count) => count > booted,
    60_000
  ).catch(() => booted);
  const startedByOpencode = async (dirs: string[]) =>
    (
      await Promise.all(
        (await Promise.all(dirs.map(pidsIn))).flat().map(async (pid) => ({
          pid,
          parent: await parentCommand(pid),
        }))
      )
    ).filter(({ parent }) => OPENCODE_SERVE.test(parent));
  // His own server, which the location started: the parent reading works.
  const his = await startedByOpencode(homePids);
  const browser = await startedByOpencode([browserPids]);
  kit.check(
    `an OpenCode session outside a workspace (its location booted: ${location - booted} server(s) of his started, ${his.length} running under an OpenCode server) started no ${BROWSER} (${browser.length} process(es) under an OpenCode server); the row reads it ${read?.state} for OpenCode`,
    location > booted &&
      his.length > 0 &&
      browser.length === 0 &&
      read?.state === "applied",
    JSON.stringify({ browser, his })
  );
  await fleet.stopSession(session);
};

/**
 * A machine with no session running starts no OpenCode server and no MCP
 * server on its own, over {@link IDLE_MS}: not for the person's own
 * `opencode.json` edit (a config change nothing runs on), not for a fleet
 * sync that changes nothing here, not for any timer. The edit waits for the
 * next need, which the next OpenCode session's start is.
 */
const idleStartsNothing = async (
  kit: Kit,
  fleet: KitFleet,
  opencodeJson: string,
  homePids: string[]
): Promise<void> => {
  const home = fleet.env.HOME as string;
  const agent = await fleet.logMark("agent");
  const generation = await activeGeneration(home);
  const before = await startedIn(homePids);
  const his = await readJson(opencodeJson);
  await writeFile(
    opencodeJson,
    JSON.stringify({
      ...his,
      agents: {
        ...(his.agents as object),
        [HIS_AGENT]: { description: "his own agent, edited", system: "his" },
      },
    })
  );
  const asked = await fetch(`${fleet.base}/api/fleet/sync`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machineId: MACHINE }),
  });
  kit.check("the hub is asked for a fleet sync of the machine", asked.ok);
  await Bun.sleep(IDLE_MS);
  const churn = await churnSince(agent);
  const after = await activeGeneration(home);
  const started = (await startedIn(homePids)) - before;
  kit.check(
    `idle for ${IDLE_MS / 60_000} min, with his opencode.json edited and a sync asked for (${churn.synced.length} taken): the machine's OpenCode server stayed ${generation} (now ${after}), ${churn.started.length} server(s) started, ${churn.applying.length} apply, ${churn.evicted.length} location(s) evicted by fleet MCP status, ${started} MCP server(s) started; the edit left for the next need (${churn.left.length})`,
    churn.synced.length > 0 &&
      generation !== undefined &&
      generation === after &&
      churn.started.length === 0 &&
      churn.applying.length === 0 &&
      churn.evicted.length === 0 &&
      started === 0 &&
      churn.left.length > 0,
    Object.values(churn).flat().join("\n").slice(0, 2000)
  );

  const need = await fleet.logMark("agent");
  const session = await fleet.spawn("opencode", "After idle");
  const applied = await until(
    "the edit applied for the session's start",
    async () => await need.since(),
    (log) => log.includes("applied via process restart"),
    180_000
  ).catch(() => "");
  kit.check(
    "the next OpenCode session's start applied the edit left for it",
    applied.includes("applied via process restart"),
    applied
      .split("\n")
      .filter((line) => line.includes("config-convergence"))
      .join("\n")
      .slice(0, 1500)
  );
  await fleet.stopSession(session);
};

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
    server: "fleet" | "his" | "docs"
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

  await startedOnce(kit, fleet);

  // The fleet's row moves to another config; the running sessions take it.
  const spawnsBefore = fleet.query<{ n: number }>(
    "SELECT COUNT(*) AS n FROM instances"
  )[0]?.n;
  await syncedAtOnce(kit, fleet, () => put(pids("fleet2")));
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

  await waitsForSignIn(kit, fleet, askAll);
  // What a boot of an OpenCode location starts that no other harness does:
  // his own server, from his opencode.json. (The fleet's is started by
  // Claude Code's and pi's status reads too.)
  const homePids = [pids("his-opencode")];
  await placeTouchesItsPlace(kit, fleet, pids("placed"), homePids);
  const agentLog = await fleet.logs("agent");
  const perSync = statusReads(agentLog);
  /** The lines the counts are taken from, for the reader of the result. */
  const counted = agentLog
    .split("\n")
    .filter((line) =>
      [
        "[fleet] sync from the hub",
        '"state":"applied"',
        "fleet MCP pass: generation",
        EVICTED,
        "fleet MCP read again later",
      ].some((mark) => line.includes(mark))
    )
    .map((line) => line.slice(0, 200));
  const total = (key: "evicted" | "published" | "skipped") =>
    perSync.reduce((sum, one) => sum + one[key], 0);
  kit.check(
    `the passes OpenCode's publications scheduled found the sync's reading and read nothing (${total("skipped")} pass(es) for ${total("published")} publication(s)), and the ${perSync.length} syncs evicted the machine location ${total("evicted")} time(s), at most once each: ${perSync.map((one) => `${one.sync} published ${one.published}, pass read nothing ${one.skipped}, evicted ${one.evicted}`).join("; ")}`,
    perSync.length > 0 &&
      total("skipped") > 0 &&
      total("evicted") <= perSync.length,
    counted.join("\n")
  );
  await Promise.allSettled(
    Object.values(sessions).map((id) => fleet.stopSession(id as string))
  );
  const stopped = await until(
    "every session stopped",
    () =>
      Object.values(sessions).map((id) => fleet.instance(id as string)?.status),
    (all) => all.every((one) => one === "stopped"),
    120_000
  ).catch(() =>
    Object.values(sessions).map((id) => fleet.instance(id as string)?.status)
  );
  kit.check(
    `every session stopped before the idle watch (${stopped.join(", ")})`,
    stopped.every((one) => one === "stopped")
  );
  await idleStartsNothing(kit, fleet, opencodeJson, homePids);
  await noBrowserOutsideWorkspace(kit, fleet, pids("browser"), homePids);
};

const spec: Spec = { name: "fleet-mcp-parity", run };

export default spec;
