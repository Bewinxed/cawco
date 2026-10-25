/**
 * An OpenCode server starts for a session someone runs on OpenCode, and for
 * nothing else, and ends once no session is on it. Read on a scratch fleet
 * with OpenCode 2.0 on the mock, by the processes themselves: every
 * `opencode serve` whose HOME is the fleet's.
 *
 * (a) An agent that connects, reports, syncs the fleet and has its own
 *     stores read by the hub (everything an agent does with no session)
 *     starts none. Before, its report's model catalog, its provider list,
 *     the fleet sync's MCP read and the hub's read of OpenCode's own
 *     sign-ins each started the machine's server, which ran on for good.
 * (b) A session's start starts one, and the machine's report then carries
 *     the catalog that server listed.
 * (c) Its session stopped, the server is retired once idle (the adapter's
 *     `SERVER_IDLE_MS`, five minutes) and its process ends.
 *
 *   bun scripts/probe-kit/run.ts opencode-serve-on-need
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { harnessWords } from "../../../packages/core/src/index";
import {
  commandLines,
  processArgs,
} from "../../../packages/core/src/process-identity";
import { until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const PROMPT = "Start a server for me.";

/** The adapter's idle time, and the minute of ticks and grace its end takes past it. */
const RETIRED_WITHIN_MS = 5 * 60_000 + 90_000;

/** Every `opencode serve` running with `home` as its HOME, by pid. */
const servesOf = async (home: string): Promise<number[]> => {
  const found: number[] = [];
  for (const { pid, command } of await commandLines()) {
    if (!command.includes(" serve")) {
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: only the few serve lines are read whole
    const read = await processArgs(pid);
    if (read?.argv.includes("serve") && read.env.includes(`HOME=${home}`)) {
      found.push(pid);
    }
  }
  return found;
};

const spec: Spec = {
  name: "opencode-serve-on-need",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet((request) =>
      request.last.includes(PROMPT)
        ? { everyMs: 5, words: ["started"] }
        : { everyMs: 5, words: ["Title"] }
    );
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    // (a) Online with its reports: everything a connection reads has been
    // asked by now. A further half-minute covers the fleet sync and the
    // hub's read of the machine's own stores, which follow the register.
    await Bun.sleep(30_000);
    const idle = await servesOf(fleet.home);
    check(
      "(a) an agent with no OpenCode session runs no opencode serve",
      idle.length === 0,
      `serve pids ${JSON.stringify(idle)}`
    );
    const opencodeReport = async () =>
      (
        await fleet.api<
          {
            harnesses?: {
              harness: string;
              models?: unknown[];
              modelsUnread?: string;
            }[];
          }[]
        >("/api/agents")
      )
        .flatMap((row) => row.harnesses ?? [])
        .find((report) => report.harness === "opencode");
    const unlisted = await opencodeReport();
    check(
      "(a) its report says OpenCode lists its models once a session has run",
      unlisted?.models === undefined &&
        unlisted?.modelsUnread === harnessWords.opencodeModelsUnlisted,
      JSON.stringify(unlisted?.modelsUnread)
    );

    // (b) A session's start is a need: one server, the machine's.
    const instanceId = await fleet.spawn("opencode", "Served", fleet.workdir);
    const uuid = await fleet.send(instanceId, PROMPT);
    await until(
      "the turn's send read",
      () => fleet.sendRow(uuid),
      (row) => row?.state === "read",
      180_000
    );
    const serving = await servesOf(fleet.home);
    check(
      "(b) the session's start runs exactly one opencode serve",
      serving.length === 1,
      `serve pids ${JSON.stringify(serving)}`
    );
    const facts = await until(
      "the models the server listed, kept for the report",
      () =>
        readFile(
          join(fleet.home, ".config", "opencode", "cawco-server-facts.json"),
          "utf8"
        ).catch(() => ""),
      (text) => text.includes('"models"'),
      60_000
    );
    check(
      "(b) what the running server listed is kept for the reports that start none",
      (JSON.parse(facts) as { models: unknown[] }).models.length > 0,
      `${facts.length} bytes`
    );
    const listed = await until(
      "the machine's report carrying the catalog the server listed",
      opencodeReport,
      (report) => (report?.models?.length ?? 0) > 0,
      60_000
    );
    check(
      "(b) the machine's report then carries that catalog",
      (listed?.models?.length ?? 0) > 0,
      `${listed?.models?.length ?? 0} models`
    );

    // (c) Its need ended: the server is retired once idle, and ends.
    await fleet.stopSession(instanceId);
    const after = await until(
      "the machine's server ended once idle",
      () => servesOf(fleet.home),
      (pids) => pids.length === 0,
      RETIRED_WITHIN_MS
    );
    check(
      "(c) its session stopped, the server ends once idle",
      after.length === 0,
      `serve pids ${JSON.stringify(after)}`
    );
    const retired = await fleet.logs("agent");
    check(
      "(c) the agent says why it retired the machine's server",
      retired.includes("the machine's server: no session on it for 5 minutes"),
      "the retirement line"
    );
  },
};

export default spec;
