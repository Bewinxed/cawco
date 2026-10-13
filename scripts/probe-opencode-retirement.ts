/**
 * Every `opencode serve` a CawCo agent starts ends once nothing needs it, on
 * a scratch fleet (its own hub, agent and sessiond, CAWCO_NO_MDNS):
 *
 * 1. A generation whose keeper is gone (sessiond killed under it, the server
 *    left running) while a turn runs in it is retired and refused while the
 *    turn runs, then ended once it is idle. Before, its birth was read
 *    through keeper custody, so its activity was never known and it was
 *    deferred on every try for as long as it ran.
 * 2. A server this agent started that no keeper holds and no record names
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
const fleet = await scratchFleet({
  name: "oc-retire",
  respond: (seen) =>
    seen.tools && seen.last.includes(LONG)
      ? { everyMs: 500, words: Array.from({ length: 60 }, (_, n) => `w${n} `) }
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

const cawco = join(fleet.home, ".cawco");
const RECORD_FILE = /^opencode-server-[0-9a-f]{16}(-account-.+)?\.json$/;
const recordFiles = async () =>
  (await readdir(cawco)).filter((file) => RECORD_FILE.test(file));
const machineRecord = async (): Promise<ServerRecord> => {
  const [file] = (await recordFiles()).filter(
    (name) => !name.includes("-account-")
  );
  assert.ok(file, "the machine's server record exists");
  return (await Bun.file(join(cawco, file)).json()) as ServerRecord;
};
const runs = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const agentLines = async (pattern: RegExp) =>
  (await fleet.logs("agent")).split("\n").filter((line) => pattern.test(line));
const show = (label: string, lines: string[]) =>
  console.log(`${label}\n${lines.map((line) => `  ${line}`).join("\n")}`);

// OpenCode installs its plugin package into its config dir as it boots: from
// inside a workspace boundary the registry is reached only through its proxy.
for (const name of [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
]) {
  const value = process.env[name];
  if (value) {
    fleet.env[name] = value;
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

  // ── 1. A keeper-gone generation: refused while its turn runs, ended once idle
  const first = await fleet.spawn("opencode", "retirement probe");
  const generation1 = (await machineRecord()).active;
  assert.ok(generation1, "a generation is active");
  console.log(
    `generation 1: ${generation1.procId} pid ${generation1.pid} at ${generation1.url}`
  );
  await fleet.send(first, `${LONG} please`);
  await until(
    "the long turn reaching the mock",
    () => fleet.seen.find((seen) => seen.tools && seen.last.includes(LONG)),
    Boolean,
    60_000
  );
  await fleet.stop("sessiond", "SIGKILL");
  assert.ok(runs(generation1.pid), "generation 1 runs on, its keeper gone");
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  // The agent restarts, as on the Mac: it finds the active generation held by
  // no keeper, starts another and retires the first, inherited.
  await fleet.stop("agent");
  fleet.launch("agent");
  await fleet.agentUp();
  const record = await until(
    "generation 1 retired",
    () => machineRecord(),
    (row) => row.retired.some((one) => one.procId === generation1.procId),
    120_000
  );
  console.log(
    `generation 2: ${record.active?.procId} pid ${record.active?.pid}; retired: ${record.retired.map((one) => `${one.procId}/${one.pid}`).join(", ")}`
  );
  const busy = await fetch(
    `${generation1.url}/session/status?directory=${encodeURIComponent(fleet.workdir)}`
  ).then((response) => response.text());
  const deferred = await until(
    "generation 1's retirement refused while its turn runs",
    () =>
      agentLines(
        new RegExp(`retired generation ${generation1.procId}: .*deferred`)
      ),
    (lines) => lines.length > 0,
    60_000
  );
  assert.ok(runs(generation1.pid), "generation 1 still runs during its turn");
  console.log(`generation 1's own status while refused: ${busy}`);
  show("refusal while the turn runs:", deferred.slice(0, 2));
  const ended = await until(
    "generation 1 ended once idle",
    () =>
      agentLines(
        new RegExp(`retired? ${generation1.procId}/${generation1.pid}`)
      ),
    (lines) => lines.some((line) => line.includes("exit confirmed")),
    180_000
  );
  assert.ok(!runs(generation1.pid), "generation 1's process is gone");
  show("generation 1 ended:", ended);
  console.log(
    `refusals logged for generation 1: ${(await agentLines(new RegExp(`retired generation ${generation1.procId}: .*deferred`))).length}`
  );

  // ── 2. A server no keeper holds and no record names
  const generation2 = (await machineRecord()).active;
  assert.ok(generation2, "generation 2 is active");
  await fleet.stop("agent");
  await fleet.stop("sessiond", "SIGKILL");
  assert.ok(runs(generation2.pid), "generation 2 runs on, its keeper gone");
  await Promise.all((await recordFiles()).map((file) => rm(join(cawco, file))));
  console.log(
    `generation 2 (pid ${generation2.pid}) left running with no keeper; record files deleted`
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
    "generation 2 swept and ended",
    () =>
      agentLines(
        new RegExp(
          `stray server ${generation2.pid} |retired? opencode-server-stray-${generation2.pid}-`
        )
      ),
    (lines) => lines.some((line) => line.includes("exit confirmed")),
    180_000
  );
  assert.ok(!runs(generation2.pid), "generation 2's process is gone");
  show("generation 2 swept:", swept);
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
