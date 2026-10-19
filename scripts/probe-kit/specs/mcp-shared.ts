/**
 * A fleet MCP server marked `shared` runs once on its machine, for every
 * session there, and only from its first call (packages/agent mcp-host.ts).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model) whose fleet runs the fixture server `probe-shared`
 * (fixtures/shared-mcp-server.ts: one tool, `whoami`, answering its pid;
 * each process writes its pid into a directory the spec reads):
 *
 * - the gateway refuses a request without the machine's host key (401);
 * - a first session's handshake starts the server once, to learn its
 *   listing, which the agent keeps; the agent's stop ends it;
 * - after the agent starts again, three sessions A, B and C start, and each
 *   holds the server's `whoami`, with no server process running: their
 *   handshakes and lists are answered from the kept listing;
 * - A, B and C then each call `whoami`: one process runs, and all three
 *   answers name the same pid.
 *
 *   bun scripts/probe-kit/run.ts mcp-shared
 */
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { isAlive, listedPid } from "../../../packages/core/src/signal";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const SERVER = "probe-shared";
const TOOL = `mcp__${SERVER}__whoami`;
const WHO = /PROBE-SHARED-([A-Z]\d?): (hello|call)/;
const PID = /PROBE-PID (\d+)/;

/** Each session's word on the tool: held at its first turn, and the pid its call answered. */
const held: Record<string, boolean> = {};
const answered: Record<string, string> = {};

/** The text of the last tool result in a request. */
const lastToolResult = (body: string): string => {
  const parsed = JSON.parse(body) as {
    messages?: { content?: unknown }[];
  };
  let text = "";
  for (const message of parsed.messages ?? []) {
    if (!Array.isArray(message.content)) {
      continue;
    }
    for (const block of message.content as {
      type?: string;
      content?: unknown;
    }[]) {
      if (block.type !== "tool_result") {
        continue;
      }
      text = Array.isArray(block.content)
        ? (block.content as { text?: string }[])
            .map((part) => part.text ?? "")
            .join("\n")
        : String(block.content ?? "");
    }
  }
  return text;
};

/** `hello`: say whether the tool is held; `call`: call it, then keep its answer. */
const respond = (request: Seen): Reply => {
  const found = WHO.exec(request.last);
  const who = found?.[1];
  if (!(request.tools && who)) {
    return { everyMs: 5, words: ["ok"] };
  }
  if (found?.[2] === "hello") {
    held[who] = request.body.includes(TOOL);
    return { everyMs: 5, words: ["hello"] };
  }
  if (request.afterTool) {
    answered[who] = lastToolResult(request.body);
    return { everyMs: 5, words: ["done"] };
  }
  return { everyMs: 5, words: [], tool: { name: TOOL, input: {} } };
};

/** The pids the fixture wrote, and which of them run now. */
const processes = async (
  dir: string
): Promise<{ ever: number[]; running: number[] }> => {
  const ever = (await readdir(dir).catch(() => [] as string[]))
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 1);
  return { ever, running: ever.filter((pid) => isAlive(listedPid(pid))) };
};

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  const pids = join(fleet.sandbox, "probe-shared-pids");
  await mkdir(pids, { recursive: true });
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  const put = await fetch(`${fleet.base}/api/fleet/mcp/${SERVER}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      config: {
        command: process.execPath,
        args: [join(import.meta.dir, "../fixtures/shared-mcp-server.ts")],
        env: { PROBE_MCP_PIDS: pids },
      },
      enabled: true,
      shared: true,
    }),
  });
  const saved = await put.text();
  kit.check(
    "the fleet runs probe-shared, shared",
    put.ok && (JSON.parse(saved) as { shared?: boolean }).shared === true,
    `${put.status} ${saved.slice(0, 300)}`
  );
  const applied = await until(
    "the machine applied probe-shared",
    () =>
      fleet
        .query<{ fleet: string | null }>("SELECT fleet FROM agents")
        .map((row) => row.fleet ?? "")
        .find((text) => text.includes(SERVER)),
    (text) =>
      (JSON.parse(text) as { mcp?: Record<string, { state?: string }> }).mcp?.[
        SERVER
      ]?.state === "applied",
    180_000
  ).catch(() => undefined);
  kit.check(
    "the machine applied probe-shared",
    !!applied,
    applied?.slice(0, 300) ?? "no report naming it"
  );

  const gateway = `http://127.0.0.1:${fleet.env.CAWCO_MCP_PORT}/mcp/local/${SERVER}`;
  const keyless = await fetch(gateway, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  kit.check(
    "the gateway refuses a request without the machine's host key",
    keyless.status === 401,
    `${keyless.status} ${await keyless.text()}`
  );

  const talk = async (who: string, words: "hello" | "call", id: string) => {
    await fleet.send(id, `PROBE-SHARED-${who}: ${words}`);
    await until(
      `${who}'s ${words}`,
      () => (words === "hello" ? held[who] : answered[who]),
      (said) => said !== undefined,
      180_000
    ).catch(() => undefined);
  };

  // The first handshake ever: nothing kept, so the server starts to list.
  const first = await fleet.spawn("claude", "Shared first", fleet.repo);
  await talk("F", "hello", first);
  const learned = await processes(pids);
  kit.check(
    "a first session's handshake started the server once, to learn its listing",
    held.F === true && learned.ever.length === 1,
    JSON.stringify({ held: held.F, ...learned })
  );
  await fleet.stopSession(first);
  await fleet.stop("agent");
  const ended = await processes(pids);
  kit.check(
    "the agent's stop ended the server it started",
    ended.running.length === 0,
    JSON.stringify(ended)
  );

  fleet.launch("agent");
  await fleet.agentUp();
  const ids: Record<string, string> = {};
  for (const who of ["A", "B", "C"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one session's start and hello, then the next's
    ids[who] = await fleet.spawn("claude", `Shared ${who}`, fleet.repo);
    await talk(who, "hello", ids[who]);
  }
  const resting = await processes(pids);
  kit.check(
    `three sessions hold ${TOOL} and no server process runs (${resting.running.length} running)`,
    held.A === true &&
      held.B === true &&
      held.C === true &&
      resting.running.length === 0 &&
      resting.ever.length === 1,
    JSON.stringify({ held, ...resting })
  );

  for (const who of ["A", "B", "C"]) {
    // biome-ignore lint/performance/noAwaitInLoops: each call in turn, so the first is the one that starts it
    await talk(who, "call", ids[who] ?? "");
  }
  const called = await processes(pids);
  const answeredPids = ["A", "B", "C"].map(
    (who) => PID.exec(answered[who] ?? "")?.[1]
  );
  kit.check(
    `A, B and C's calls ran on one process (${called.running.length} running, ${called.ever.length - 1} started since the restart)`,
    called.running.length === 1 && called.ever.length === 2,
    JSON.stringify(called)
  );
  kit.check(
    "all three answers name that one process's pid",
    answeredPids.every((pid) => pid === String(called.running[0])),
    JSON.stringify({ answered, running: called.running })
  );
  await Promise.allSettled(
    Object.values(ids).map((id) => fleet.stopSession(id))
  );
};

const spec: Spec = { name: "mcp-shared", run };

export default spec;
