/**
 * Every `opencode serve` a CawCo agent starts ends once nothing needs it, and
 * a server whose keeper is gone takes no new session, on a scratch fleet (its
 * own hub, agent and sessiond, CAWCO_NO_MDNS):
 *
 * 1. The keeper is killed under the active generation, the agent running on:
 *    the next session starts on a new generation, on the new keeper, and the
 *    old one, idle, is ended.
 * 2. A turn runs across a keeper kill and an agent restart: the session is
 *    reattached on its own generation, its reply reaches the hub whole, that
 *    generation is refused retirement while the turn runs (its birth read
 *    from its OS identity, so its activity is known), and ended once idle.
 * 3. A server this agent started that no keeper holds and no record names
 *    (agent stopped, keeper killed, record files deleted) is found by the
 *    stray sweep and ended; an `opencode serve` of the same HOME that CawCo
 *    did not start is left running.
 *
 *   bun scripts/probe-opencode-retirement.ts [--keep]
 */
import assert from "node:assert/strict";
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const LONG = "LONG-TURN";
const WORDS = Array.from({ length: 120 }, (_, n) => `w${n} `);
const fleet = await scratchFleet({
  name: "oc-retire",
  respond: (seen) =>
    seen.tools && seen.last.includes(LONG)
      ? { everyMs: 500, words: WORDS }
      : { everyMs: 10, words: ["ok"] },
});

interface Identity {
  pid: number;
  procId: string;
  url: string;
}
interface ServerRecord {
  active: Identity | null;
  retired: Identity[];
}
interface Block {
  content: string;
  id: string;
  type: string;
}

const cawco = join(fleet.home, ".cawco");
const RECORD_FILE = /^opencode-server-[0-9a-f]{16}(-account-.+)?\.json$/;
const recordFiles = async () =>
  (await readdir(cawco)).filter((file) => RECORD_FILE.test(file));
const machineRecord = async (): Promise<ServerRecord> => {
  const [file] = (await recordFiles()).filter(
    (found) => !found.includes("-account-")
  );
  assert.ok(file, "the machine's server record exists");
  return (await Bun.file(join(cawco, file)).json()) as ServerRecord;
};
const active = async (): Promise<Identity> => {
  const identity = (await machineRecord()).active;
  assert.ok(identity, "a generation is active");
  return identity;
};
const runs = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/** What a generation's own server says runs in the fleet's work dir. */
const statusOn = async (
  generation: Identity
): Promise<Record<string, { type: string }>> =>
  (await fetch(
    `${generation.url}/session/status?directory=${encodeURIComponent(fleet.workdir)}`
  ).then((response) => response.json())) as Record<string, { type: string }>;
const busyOn = async (generation: Identity) =>
  Object.entries(await statusOn(generation))
    .filter(([, state]) => state.type === "busy")
    .map(([id]) => id);
const agentLines = async (pattern: RegExp) =>
  (await fleet.logs("agent")).split("\n").filter((line) => pattern.test(line));
const show = (label: string, lines: string[]) =>
  console.log(`${label}\n${lines.map((line) => `  ${line}`).join("\n")}`);
const name = (generation: Identity) =>
  `${generation.procId} pid ${generation.pid}`;
/** Waits for a generation's process to be ended by its retirement, and shows the lines. */
const endedOnceIdle = async (generation: Identity, label: string) => {
  const lines = await until(
    `${label} ended`,
    () =>
      agentLines(new RegExp(`retired? ${generation.procId}/${generation.pid}`)),
    (found) => found.some((line) => line.includes("exit confirmed")),
    180_000
  );
  assert.ok(!runs(generation.pid), `${label}'s process is gone`);
  show(`${label} ended:`, lines);
};
const restartKeeper = async () => {
  await fleet.stop("sessiond", "SIGKILL");
  fleet.launch("sessiond");
  await fleet.sessiondUp();
};

// OpenCode installs its plugin package into its config dir as it boots: from
// inside a workspace boundary the registry is reached only through its proxy.
for (const variable of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]) {
  const value = process.env[variable];
  if (value) {
    fleet.env[variable] = value;
  }
}

let stranger: ReturnType<typeof Bun.spawn> | undefined;
try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  // ── 1. The keeper killed under the active generation, the agent running on
  await fleet.spawn("opencode", "before the keeper");
  const generation1 = await active();
  console.log(`generation 1: ${name(generation1)} at ${generation1.url}`);
  await restartKeeper();
  assert.ok(runs(generation1.pid), "generation 1 runs on, its keeper gone");
  const left = await until(
    "the agent leaving generation 1",
    () =>
      agentLines(
        new RegExp(`server ${generation1.procId}/${generation1.pid}: no keeper`)
      ),
    (lines) => lines.length > 0,
    60_000
  );
  show("the agent, on the keeper's loss:", left);
  const generation2 = await until(
    "a generation on the new keeper",
    () => active(),
    (identity) => identity.procId !== generation1.procId,
    120_000
  );
  console.log(`generation 2: ${name(generation2)} at ${generation2.url}`);
  const second = await fleet.spawn("opencode", "after the keeper");
  await fleet.send(second, `${LONG} please`);
  const [turn] = await until(
    "the long turn running on generation 2",
    () => busyOn(generation2),
    (ids) => ids.length === 1,
    60_000
  );
  assert.deepEqual(
    await busyOn(generation1),
    [],
    "nothing runs on generation 1"
  );
  console.log(
    `the new session's turn ${turn} runs on generation 2; generation 1 runs nothing`
  );

  // ── 2. That turn across a keeper kill and an agent restart
  await restartKeeper();
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const reattached = await until(
    "the turn reattached on generation 2",
    () =>
      agentLines(
        new RegExp(
          `recovery ${second}: reattached running turn ${turn} on ${generation2.procId}/${generation2.pid}`
        )
      ),
    (lines) => lines.length > 0,
    120_000
  );
  show("recovery after the agent restart:", reattached);
  const deferred = await until(
    "generation 2's retirement refused while its turn runs",
    () =>
      agentLines(
        new RegExp(`retired generation ${generation2.procId}: .*deferred`)
      ),
    (lines) => lines.length > 0,
    60_000
  );
  assert.deepEqual(
    await busyOn(generation2),
    [turn],
    "the turn still runs on generation 2 while it is refused"
  );
  show("refused while the turn runs:", deferred.slice(0, 1));
  const whole = WORDS.join("").trim();
  const transcript = async () =>
    (
      await fleet.api<{ blocks: Block[] }>(
        `/api/instances/${encodeURIComponent(second)}/transcript?limit=400`
      )
    ).blocks;
  const blocks = await until(
    "the whole reply in the hub's transcript",
    transcript,
    (found) =>
      found.some(
        (block) =>
          block.type === "assistant" && block.content.trim().endsWith("w119")
      ),
    180_000
  ).catch(async (error: unknown) => {
    const found = await transcript();
    show(
      "the transcript as the hub has it:",
      found.map(
        (block) =>
          `${block.type} ${block.id}: ${block.content.slice(0, 60)}…${block.content.slice(-30)}`
      )
    );
    throw error;
  });
  const said = blocks
    .filter((block) => block.type === "assistant")
    .map((block) => block.content.trim());
  assert.ok(said.includes(whole), `the reply is whole: ${said.at(-1)}`);
  assert.equal(
    new Set(blocks.map((block) => block.id)).size,
    blocks.length,
    "no block is in the transcript twice"
  );
  const handedBack = (await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(`${second}: handed back the turn`));
  assert.deepEqual(handedBack, [], "the hub handed back no cut turn");
  console.log(
    `the reply reached the hub whole: ${whole.length} characters, "${whole.slice(0, 12)}…${whole.slice(-10)}", ${blocks.length} blocks, none twice`
  );
  await endedOnceIdle(generation2, "generation 2");
  console.log(
    `refusals logged for generation 2: ${(await agentLines(new RegExp(`retired generation ${generation2.procId}: .*deferred`))).length}`
  );
  await endedOnceIdle(generation1, "generation 1");

  // ── 3. A server no keeper holds and no record names
  const generation3 = await active();
  await fleet.stop("agent");
  await fleet.stop("sessiond", "SIGKILL");
  assert.ok(runs(generation3.pid), "generation 3 runs on, its keeper gone");
  await Promise.all((await recordFiles()).map((file) => rm(join(cawco, file))));
  console.log(
    `generation 3 (${name(generation3)}) left running with no keeper; record files deleted`
  );
  // An `opencode serve` of the same HOME that CawCo did not start.
  const lease = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const strangerPort = lease.port as number;
  await lease.stop(true);
  stranger = Bun.spawn(
    ["opencode", "serve", "--hostname=127.0.0.1", `--port=${strangerPort}`],
    { cwd: fleet.workdir, env: fleet.env, stdout: "ignore", stderr: "ignore" }
  );
  await until(
    "the stranger server answering",
    () =>
      fetch(`http://127.0.0.1:${strangerPort}/session/status`).then(
        (response) => response.ok
      ),
    Boolean,
    60_000
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("agent");
  await fleet.agentUp();
  const swept = await until(
    "generation 3 swept and ended",
    () =>
      agentLines(
        new RegExp(
          `stray server ${generation3.pid} |retired? opencode-server-stray-${generation3.pid}-`
        )
      ),
    (lines) => lines.some((line) => line.includes("exit confirmed")),
    180_000
  );
  assert.ok(!runs(generation3.pid), "generation 3's process is gone");
  show("generation 3 swept:", swept);
  assert.ok(
    runs(stranger.pid),
    "the opencode serve CawCo did not start still runs"
  );
  const strays = await agentLines(/stray server \d+ /);
  assert.ok(
    strays.every((line) => !line.includes(`stray server ${stranger?.pid} `)),
    "the stranger was never taken for a stray"
  );
  console.log(
    `the stranger (pid ${stranger.pid}, port ${strangerPort}) still runs; stray lines: ${strays.length}`
  );
  console.log("opencode-retirement-proofs-pass");
} finally {
  stranger?.kill("SIGKILL");
  await fleet.close();
  await fleet.clean(keep);
}
