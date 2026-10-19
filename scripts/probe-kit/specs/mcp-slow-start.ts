/**
 * A fleet MCP server whose first start times out in OpenCode still reaches
 * it: CawCo starts it again on its own, with no fleet change, and the hub's
 * row (`agents.fleet`) reads `applied` for OpenCode once it connects.
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
 * - the hub's row reads OpenCode's `failed`, in OpenCode's own words
 *   ("Request timed out"), for the slow first start;
 * - within 240 s of the PUT the row reads `applied`, for the machine and for
 *   OpenCode's own reading;
 * - one OpenCode server started it twice in one location, the first the
 *   slow one, and the agent says it started it again itself;
 * - the hub carried `probe-slow` to the machine once.
 *
 * Runs inside a workspace or on the host alike: it delegates nothing.
 *
 *   bun scripts/probe-kit/run.ts mcp-slow-start
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { MCP_CONNECT_MS } from "../../../packages/agent/src/mcp-status";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const SERVER = "probe-slow";
/** How long after the PUT the row must read applied for OpenCode. */
const CONVERGE_MS = 240_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

interface Row {
  mcp?: Record<string, { detail?: string; state?: string }>;
  mcpByHarness?: Record<
    string,
    Record<string, { detail?: string; state?: string }> | undefined
  >;
}

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

  // Every reading of OpenCode's the hub kept, in order, until it applied.
  const seen: { state: string; detail: string }[] = [];
  const applied = await until(
    `the hub's row reads ${SERVER} applied for OpenCode`,
    () => {
      const read = row();
      const opencode = read?.mcpByHarness?.opencode?.[SERVER];
      if (opencode?.state) {
        const last = seen.at(-1);
        if (last?.state !== opencode.state) {
          seen.push({ state: opencode.state, detail: opencode.detail ?? "" });
        }
      }
      return read;
    },
    (read) =>
      read?.mcp?.[SERVER]?.state === "applied" &&
      read.mcpByHarness?.opencode?.[SERVER]?.state === "applied",
    CONVERGE_MS
  ).catch(() => undefined);
  const tookS = Math.round((Date.now() - putAt) / 1000);

  const timedOut = seen.find((one) => one.state === "failed");
  kit.check(
    `OpenCode's first start timed out: the row read opencode failed — "${timedOut?.detail.slice(0, 80)}"`,
    !!timedOut && timedOut.detail.includes("timed out"),
    JSON.stringify(seen)
  );
  kit.check(
    `with no fleet change, the row reads ${SERVER} applied (machine and opencode) ${tookS} s after the PUT (within ${CONVERGE_MS / 1000} s)`,
    !!applied,
    JSON.stringify({ seen, last: row()?.mcp?.[SERVER] })
  );

  const files = (await readdir(starts)).filter(
    (file) => !file.startsWith("first-opencode")
  );
  // Each start with the directory it ran in and the OpenCode server that
  // started it, as it wrote them, in the order they started.
  const startsRead = (
    await Promise.all(
      files.map(async (file) => ({
        file,
        where: await Bun.file(join(starts, file)).text(),
      }))
    )
  ).sort((a, b) => Number(a.file.split("-")[0]) - Number(b.file.split("-")[0]));
  // One OpenCode server's location: its slow first start, then the one CawCo made.
  const restarted = Object.entries(
    Object.groupBy(
      startsRead.filter((one) => one.file.includes("-opencode")),
      (one) => one.where
    )
  ).find(
    ([, group]) =>
      (group?.length ?? 0) >= 2 &&
      !!group?.[0]?.file.endsWith("-slow") &&
      !group[1]?.file.endsWith("-slow")
  );
  kit.check(
    `OpenCode's server ${restarted?.[0].split(" ")[1]} started ${SERVER} ${restarted?.[1]?.length} times in one location, the first the slow one`,
    !!restarted,
    JSON.stringify(startsRead)
  );

  const agentLog = await fleet.logs("agent");
  const startedAgain = agentLog
    .split("\n")
    .find(
      (line) =>
        line.includes(
          `${SERVER} at the machine's server: OpenCode held it failed (`
        ) && line.includes("started again: settled")
    );
  kit.check(
    `the agent started it again itself: ${startedAgain?.trim().slice(0, 160)}`,
    !!startedAgain,
    agentLog
      .split("\n")
      .filter((line) => line.includes(SERVER))
      .join("\n")
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
