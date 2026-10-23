/**
 * A fleet MCP server whose first start times out in OpenCode still reaches
 * it: CawCo starts it again on its own, with no fleet change, and the hub's
 * row (`agents.fleet`) reads `applied` for OpenCode once it connects. The
 * config change starts it once, on the generation that serves it; the
 * generation it replaces retires promptly; and no copy of it is left running
 * in the machine server's own location once everything settles.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code and OpenCode
 * against the mock model) whose fleet runs the fixture server `probe-slow`
 * (fixtures/slow-start-mcp-server.ts): the first process each OpenCode
 * server starts in a location answers `initialize` only after OpenCode's
 * startup timeout as CawCo writes it (`MCP_CONNECT_MS`) plus 15 s; every
 * later one answers at once. Each process writes a file naming who started
 * it, where, and whether it was the slow one. After the one PUT that adds
 * it, nothing in the fleet changes:
 *
 * - the agent reads OpenCode's `failed`, in OpenCode's own words
 *   ("Request timed out"), for the slow first start, and reads it again
 *   later (the hub's row may hold that reading for less than a poll);
 * - within 240 s of the PUT the row reads `applied`, for the machine and for
 *   OpenCode's own reading;
 * - (a) the generation the PUT replaced never starts it, and the new one
 *   starts it once per location for the change (before the failed reading);
 *   then it starts it again in that location itself, and that start
 *   connects;
 * - (b) the replaced generation, idle, exits within
 *   {@link RETIRE_BOUND_MS} of the new one taking over, while the slow start
 *   is still being waited for;
 * - (c) once the row reads applied, no process an OpenCode server started of
 *   it is still running, within {@link RELEASE_BOUND_MS};
 * - no OpenCode server starts it in the location the agent's own reads
 *   go to (`OPENCODE_QUIET_DIR`);
 * - no OpenCode server starts it in the location the agent's own reads of
 *   a server go to (agent opencode-plugin.ts `OPENCODE_QUIET_DIR`);
 * - the hub carried `probe-slow` to the machine once.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts mcp-slow-start
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MCP_CONNECT_MS } from "../../../packages/agent/src/mcp-status";
import { isAlive, listedPid } from "../../../packages/core/src/signal";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const SERVER = "probe-slow";
/** How long after the PUT the row must read applied for OpenCode. */
const CONVERGE_MS = 240_000;
/**
 * How soon an idle replaced generation must exit. Ours, from the agent's
 * own clocks: the 2 s config tick runs the retirement, which samples the
 * generation twice 2 s apart; a refused try waits 5 s; its SIGTERM grace is
 * 15 s (opencode-server.ts `#end`). 24 s, rounded up.
 */
const RETIRE_BOUND_MS = 30_000;
/**
 * How soon the machine server's own location lets go of its fleet servers
 * once read: at once, or at the next release try 30 s on when an operation
 * held it (opencode.ts `DIRECTORY_RELEASE_RETRY_MS`), with margin.
 */
const RELEASE_BOUND_MS = 45_000;
/** The location the agent's own reads of a server go to (agent opencode-plugin.ts `OPENCODE_QUIET_DIR`). */
const QUIET_LOCATION = "/.cawco/opencode-quiet";
const CANDIDATE = /candidate→active [^/\s]+\/(\d+) → [^/\s]+\/(\d+)/;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Row {
  mcp?: Record<string, { detail?: string; state?: string }>;
  mcpByHarness?: Record<
    string,
    Record<string, { detail?: string; state?: string }> | undefined
  >;
}

/** One start of the fixture, as it wrote it. */
interface Start {
  at: number;
  cwd: string;
  pid: number;
  /** The OpenCode server that started it; none for another harness's. */
  server?: number;
  slow: boolean;
}

const startsIn = async (dir: string): Promise<Start[]> => {
  const files = (await readdir(dir)).filter(
    (file) => !file.startsWith("first-opencode")
  );
  const read = await Promise.all(
    files.map(async (file): Promise<Start> => {
      const [at, pid, who] = file.split("-");
      const text = await Bun.file(join(dir, file)).text();
      const cut = text.lastIndexOf(" ");
      return {
        at: Number(at),
        pid: Number(pid),
        cwd: text.slice(0, cut),
        ...(who === "opencode" ? { server: Number(text.slice(cut + 1)) } : {}),
        slow: file.endsWith("-slow"),
      };
    })
  );
  return read.sort((a, b) => a.at - b.at);
};

const running = (pid: number): boolean => pid > 1 && isAlive(listedPid(pid));

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const starts = join(fleet.sandbox, "probe-slow-starts");
  await mkdir(starts, { recursive: true });
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  /** The machine's row as the hub keeps it, once it names the server. */
  const row = (): Row | undefined => {
    const text = fleet
      .query<{ fleet: string | null }>("SELECT fleet FROM agents")
      .map((one) => one.fleet ?? "")
      .find((one) => one.includes(SERVER));
    return text ? (JSON.parse(text) as Row) : undefined;
  };

  /** The lines of `text` naming `mark`. */
  const lines = (text: string, mark: string) =>
    text.split("\n").filter((line) => line.includes(mark));
  // The machine's start-up sync, on its whole harness set (OpenCode's
  // among them), is applied before the PUT's is counted: the agent took it,
  // and the hub keeps it applied with OpenCode's reading in its report.
  await until(
    "the machine applied the start-up sync the hub sent it",
    async () => {
      const [stored] = fleet.query<{
        fleet: string | null;
        fleet_sync: string | null;
      }>("SELECT fleet, fleet_sync FROM agents");
      return {
        report: stored?.fleet ? (JSON.parse(stored.fleet) as Row) : undefined,
        outcome: stored?.fleet_sync
          ? (JSON.parse(stored.fleet_sync) as { state?: string })
          : undefined,
        took: lines(await fleet.logs("agent"), "[fleet] sync from the hub")
          .length,
      };
    },
    ({ report, outcome, took }) =>
      took >= 1 &&
      outcome?.state === "applied" &&
      report?.mcpByHarness?.opencode !== undefined,
    120_000
  ).catch(() => undefined);
  const agentMark = await fleet.logMark("agent");
  const put = await fetch(`${fleet.base}/api/fleet/mcp/${SERVER}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: process.execPath,
        args: [join(import.meta.dir, "../fixtures/slow-start-mcp-server.ts")],
        env: {
          PROBE_MCP_STARTS: starts,
          PROBE_MCP_DELAY_MS: String(MCP_CONNECT_MS + 15_000),
        },
      },
      enabled: true,
    }),
  });
  const putAt = Date.now();
  kit.check(`the fleet runs ${SERVER}`, put.ok, String(put.status));

  // The generation the PUT replaced and the one taking over, when it took
  // over, and when the replaced one's process ended.
  const handover: {
    at?: number;
    gone?: number;
    next?: number;
    old?: number;
  } = {};
  const look = async (): Promise<void> => {
    if (handover.at === undefined) {
      const found = CANDIDATE.exec(await agentMark.since());
      if (found) {
        Object.assign(handover, {
          at: Date.now(),
          old: Number(found[1]),
          next: Number(found[2]),
        });
      }
    } else if (
      handover.gone === undefined &&
      !running(handover.old as number)
    ) {
      handover.gone = Date.now();
    }
  };
  const stop = new AbortController();
  const watcher = (async () => {
    while (!stop.signal.aborted) {
      // biome-ignore lint/performance/noAwaitInLoops: one look a beat, until the run ends
      await look();
      await Bun.sleep(250);
    }
  })();

  // Every reading of OpenCode's the hub kept, in order, until it applied.
  const seen: { at: number; detail: string; state: string }[] = [];
  const applied = await until(
    `the hub's row reads ${SERVER} applied for OpenCode`,
    () => {
      const read = row();
      const opencode = read?.mcpByHarness?.opencode?.[SERVER];
      if (opencode?.state && seen.at(-1)?.state !== opencode.state) {
        seen.push({
          at: Date.now(),
          state: opencode.state,
          detail: opencode.detail ?? "",
        });
      }
      return read;
    },
    (read) =>
      read?.mcp?.[SERVER]?.state === "applied" &&
      read.mcpByHarness?.opencode?.[SERVER]?.state === "applied",
    CONVERGE_MS
  ).catch(() => undefined);
  const tookS = Math.round((Date.now() - putAt) / 1000);

  // OpenCode's verdict as the agent read it: the hub may hold it for less
  // than a poll, when a second read follows at once.
  const verdict = (await fleet.logs("agent"))
    .split("\n")
    .find(
      (line) =>
        line.includes("fleet MCP read again later:") &&
        line.includes(`${SERVER} failed (Request timed out`)
    );
  kit.check(
    `OpenCode's first start timed out, and the agent read it again later: ${verdict?.trim().slice(0, 110)}`,
    !!verdict,
    JSON.stringify(seen)
  );
  kit.check(
    `with no fleet change, the row reads ${SERVER} applied (machine and opencode) ${tookS} s after the PUT (within ${CONVERGE_MS / 1000} s)`,
    !!applied,
    JSON.stringify({ seen, last: row()?.mcp?.[SERVER] })
  );

  // (c) Nothing of it left running that an OpenCode server started.
  const lingering = async () =>
    (await startsIn(starts)).filter(
      (one) => one.server !== undefined && running(one.pid)
    );
  const releasedAt = Date.now();
  const left = await until(
    "no fleet server process an OpenCode server started is left",
    lingering,
    (rows) => rows.length === 0,
    RELEASE_BOUND_MS
  ).catch(() => undefined);
  kit.check(
    `(c) once applied, no ${SERVER} process an OpenCode server started runs in the machine server's own location (${Math.round((Date.now() - releasedAt) / 1000)} s, within ${RELEASE_BOUND_MS / 1000} s)`,
    left !== undefined,
    JSON.stringify(await lingering())
  );
  stop.abort();
  await watcher;

  const all = await startsIn(starts);
  const opencodeStarts = all.filter((one) => one.server !== undefined);
  // OpenCode's verdict on the slow start: its startup timeout after that
  // start, by its own clock. What the new generation started before it, the
  // config change started; what it started after, it started again.
  const slowStart = opencodeStarts.find(
    (one) => one.server === handover.next && one.slow
  );
  const failedAt = slowStart
    ? slowStart.at + MCP_CONNECT_MS
    : Number.POSITIVE_INFINITY;
  const byOld = opencodeStarts.filter((one) => one.server === handover.old);
  const forChange = opencodeStarts.filter(
    (one) => one.server === handover.next && one.at < failedAt
  );
  const perLocation = Object.entries(
    Object.groupBy(forChange, (one) => one.cwd)
  );
  kit.check(
    `(a) the config change started ${SERVER} once per location on the new generation ${handover.next} (${perLocation.map(([cwd, group]) => `${group?.length}× in ${cwd}`).join(", ")}), never on the replaced ${handover.old}`,
    handover.next !== undefined &&
      byOld.length === 0 &&
      perLocation.length > 0 &&
      perLocation.every(([, group]) => group?.length === 1),
    JSON.stringify({ handover, all })
  );
  // The agent's own reads of a server (its config sources, its models) go
  // to a location the plugin takes every MCP server out of.
  const quiet = opencodeStarts.filter((one) =>
    one.cwd.endsWith(QUIET_LOCATION)
  );
  kit.check(
    `no OpenCode server started ${SERVER} in the agent's quiet location (${quiet.length} start(s) there)`,
    quiet.length === 0,
    JSON.stringify(quiet)
  );
  const again = opencodeStarts.find(
    (one) =>
      one.server === handover.next &&
      one.at > failedAt &&
      !one.slow &&
      forChange.some((first) => first.cwd === one.cwd)
  );
  kit.check(
    `(a) after OpenCode's startup timeout on it, the new generation started it again in that location itself (pid ${again?.pid}, ${again ? ((again.at - failedAt) / 1000).toFixed(1) : "?"} s on) and it connected`,
    !!again && !!applied,
    JSON.stringify({ failedAt, all })
  );

  const retiredInMs =
    handover.at !== undefined && handover.gone !== undefined
      ? handover.gone - handover.at
      : undefined;
  kit.check(
    `(b) the replaced generation ${handover.old}, idle, exited ${retiredInMs === undefined ? "never" : `${Math.round(retiredInMs / 1000)} s`} after the handover (within ${RETIRE_BOUND_MS / 1000} s), while the slow start was waited for`,
    retiredInMs !== undefined &&
      retiredInMs <= RETIRE_BOUND_MS &&
      (handover.gone as number) < failedAt,
    JSON.stringify({ handover, failedAt })
  );

  // One fleet change, one sync to the machine: what the agent took, from
  // the PUT to rest.
  const agentSyncs = lines(
    await agentMark.since(),
    "[fleet] sync from the hub"
  );
  kit.check(
    `the PUT sent the machine one fleet sync (the agent took ${agentSyncs.length})`,
    agentSyncs.length === 1,
    JSON.stringify({ agentSyncs })
  );

  const hubLog = await fleet.logs("hub");
  const carried = hubLog
    .split("\n")
    .filter((line) => line.includes(`${SERVER} added`)).length;
  kit.check(
    `the hub carried ${SERVER} to the machine once (${carried} "added" line)`,
    carried === 1,
    hubLog
      .split("\n")
      .filter((line) => line.includes(SERVER))
      .join("\n")
  );
};

const spec: Spec = {
  name: "mcp-slow-start",
  run,
};

export default spec;
