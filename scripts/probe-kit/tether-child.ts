/**
 * The tether spec's own processes (specs/tether.ts), each spawning the
 * tether (core tether.ts) `detached`, as the hub spawns an SSH master (hub
 * ssh-tunnels.ts `master`).
 *
 * - `caller`: spawns one over a `sleep` as the hub does (stdin a pipe it
 *   never writes, stderr a pipe), prints `{"tether":<pid>}` once its reader
 *   stands, and stays up until it is killed.
 * - `reuse`: run in a PID namespace of its own (`unshare --map-root-user
 *   --pid --mount-proc`) under a shell as its pid 1, which reaps what the
 *   namespace leaves it; the namespace's root may set its last pid
 *   (`/proc/sys/kernel/ns_last_pid`). The tether's stdin is a FIFO whose
 *   writer is a `sleep` of its own, so the reader waits past the command's
 *   end for as long as that writer lives (a runtime's own pipe it closes as
 *   it reaps the child: Bun and node both). It SIGKILLs the process it
 *   spawned and reaps it, sets the last pid to the one before it, and
 *   starts another `sleep`: which pid that one takes and whether any task
 *   has the spawned pid. Then the writer ends, the pipe's end: whether the
 *   reader's signal ended its group and left that `sleep` running. Then,
 *   the group reaped, the same last pid again and a third `sleep`, which
 *   takes the spawned pid: the namespace hands out the pid it was asked for
 *   once nothing holds it. Printed as one JSON line.
 *
 *   bun scripts/probe-kit/tether-child.ts caller|reuse
 */
import {
  closeSync,
  existsSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { processTable } from "../../packages/core/src/process-identity";
import { listedPid, signal } from "../../packages/core/src/signal";
import { tetherArgs } from "../../packages/core/src/tether";
import { systemProgram } from "../../packages/core/src/workspace-needs";

/** How long the reader has to stand, and the group to go. Ours: each takes milliseconds. */
const WAIT_MS = 5000;
const LAST_PID = "/proc/sys/kernel/ns_last_pid";

/** The tether over a `sleep`, `detached`, its stdin `stdin`. */
const spawnTether = (stdin: "pipe" | number) =>
  Bun.spawn(
    [systemProgram("sh"), ...tetherArgs([systemProgram("sleep"), "600"])],
    {
      env: process.env,
      stdin,
      stdout: "ignore",
      stderr: "pipe",
      detached: true,
    }
  );

/** A `sleep` of this process's own. */
const sleeper = () =>
  Bun.spawn([systemProgram("sleep"), "600"], {
    env: process.env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });

/** The processes of group `pgid` that run now (a zombie has ended). */
const running = async (pgid: number) =>
  (await processTable()).filter(
    (row) => row.pgid === pgid && !row.state.startsWith("Z")
  );

/** Waits until `test` holds, or {@link WAIT_MS} passes: whether it held. */
const within = async (test: () => Promise<boolean>): Promise<boolean> => {
  const from = performance.now();
  while (performance.now() - from <= WAIT_MS) {
    if (await test()) {
      return true;
    }
    await Bun.sleep(10);
  }
  return false;
};

/** The tether's group stands: the spawned process, its reader and the reader's cat. */
const stands = (pid: number) =>
  within(async () => (await running(pid)).length >= 3);

const mode = process.argv.at(-1);

if (mode === "caller") {
  const tether = spawnTether("pipe");
  await stands(tether.pid);
  console.log(JSON.stringify({ tether: tether.pid }));
  setInterval(() => undefined, 60_000);
} else if (mode === "reuse") {
  const dir = mkdtempSync(join(tmpdir(), "tether-reuse-"));
  const fifo = join(dir, "pipe");
  Bun.spawnSync([systemProgram("mkfifo"), fifo], { env: process.env });
  // The pipe's writer: its open waits for the reader's, and its end is the pipe's.
  const writer = Bun.spawn(
    [
      systemProgram("sh"),
      "-c",
      'exec "$2" 600 > "$1"',
      "sh",
      fifo,
      systemProgram("sleep"),
    ],
    { env: process.env, stdin: "ignore", stdout: "ignore", stderr: "ignore" }
  );
  const readEnd = openSync(fifo, "r");
  const tether = spawnTether(readEnd);
  closeSync(readEnd);
  await stands(tether.pid);
  const spawned = tether.pid;
  signal(listedPid(spawned), "SIGKILL");
  await tether.exited;
  // Reaped: the spawned pid runs no process now. The next one asked for is it.
  writeFileSync(LAST_PID, String(spawned - 1));
  const lastPid = Number(readFileSync(LAST_PID, "utf8").trim());
  const next = sleeper();
  // /proc/<id> answers for any task, a thread too, listed or not.
  const taken = existsSync(`/proc/${spawned}/stat`);
  const heldBy = (await running(spawned)).map((row) => row.pid);
  writer.kill("SIGKILL");
  const groupGone = await within(
    async () => (await running(spawned)).length === 0
  );
  await Bun.sleep(200);
  const nextRuns = next.exitCode === null && next.signalCode === null;
  // Reaped by the namespace's pid 1: no member of the group is left, a zombie neither.
  await within(async () =>
    (await processTable()).every((row) => row.pgid !== spawned)
  );
  writeFileSync(LAST_PID, String(spawned - 1));
  const control = sleeper();
  console.log(
    JSON.stringify({
      spawned,
      lastPid,
      next: next.pid,
      taken,
      heldBy,
      groupGone,
      nextRuns,
      control: control.pid,
    })
  );
  for (const one of [next, control]) {
    one.kill("SIGKILL");
  }
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}
