/**
 * The tether (core tether.ts) as the hub spawns an SSH master with it (hub
 * ssh-tunnels.ts `master`: `detached`, stdin a pipe it never writes, stderr
 * a pipe it reads to its end, then its exit, then `untether`). Its shell
 * `exec`s the command, and its reader signals the command's process group,
 * never a pid. The agent's sleep listener is the other caller
 * (sleep-listener).
 *
 * 1. The process the caller spawned runs the command itself; the tether's
 *    reader (`sh -c`) and the reader's `cat` stand in its group.
 * 2. That process SIGKILLed, and nothing else: the caller's read of its
 *    stderr ends and its exit is seen within {@link GONE_MS}, the end the
 *    hub reads as its connection's (ssh-tunnels.ts `connect`), and the
 *    command is gone with it. Bun lets the pipe go as it reaps the child
 *    (node too), and the reader ends what is left of the group: every
 *    process of it gone within {@link GONE_MS}, `untether` then nothing.
 * 3. The caller SIGKILLed (tether-child.ts `caller`): the command, the
 *    reader and its `cat` are gone within {@link GONE_MS}.
 * 4. Spawned in its caller's process group, not detached: the tether exits
 *    `TETHER_UNLED` with its words, and its command never runs.
 * 5. Linux, where a user namespace may be made (the host): in a PID
 *    namespace of its own (tether-child.ts `reuse`), the spawned process
 *    SIGKILLed and reaped while its reader waits on a pipe whose writer
 *    lives on, the namespace asked for that pid next (`ns_last_pid`) hands
 *    it to no process; the reader's signal at the pipe's end leaves the
 *    process started then running and ends its group; and once the group
 *    is reaped the same ask is given that pid.
 *
 *   bun scripts/probe-kit/run.ts tether
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { LineSplitter } from "../../../packages/core/src/lines";
import {
  commandLine,
  processTable,
} from "../../../packages/core/src/process-identity";
import { listedPid, signal } from "../../../packages/core/src/signal";
import {
  TETHER_UNLED,
  tetherArgs,
  untether,
} from "../../../packages/core/src/tether";
import { tetherWords } from "../../../packages/core/src/words/tether";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import { BOUNDARY_INSIDE, type Kit, type Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "tether-child.ts");
/** How long the tether's processes have to be gone: sleep-listener's bar. */
const GONE_MS = 1000;
/** How long the reader has to stand. Ours: it stands in milliseconds. */
const STAND_MS = 5000;
/** What the command says on stderr once it runs. */
const UP = "tethered command up";
/** The command: says {@link UP} on stderr, then idles until it is ended. */
const COMMAND = [
  process.execPath,
  "-e",
  `console.error(${JSON.stringify(UP)}); setInterval(() => undefined, 60_000);`,
];

/** The processes of group `pgid` that run now (a zombie has ended), each with its command line. */
const group = async (pgid: number): Promise<{ args: string; pid: number }[]> =>
  Promise.all(
    (await processTable())
      .filter((row) => row.pgid === pgid && !row.state.startsWith("Z"))
      .map(async ({ pid }) => ({ pid, args: (await commandLine(pid)) ?? "" }))
  );

/** Waits until `test` holds, or `ms` passes: how long it took, or undefined. */
const holdsWithin = async (
  test: () => Promise<boolean>,
  ms: number
): Promise<number | undefined> => {
  const from = performance.now();
  while (performance.now() - from <= ms) {
    if (await test()) {
      return Math.round(performance.now() - from);
    }
    await Bun.sleep(10);
  }
};

const named = (rows: { args: string; pid: number }[]): string =>
  rows
    .map(({ pid, args }) => `${pid} ${args.replaceAll("\n", " ").slice(0, 60)}`)
    .join("; ") || "none";

/** Reads `stream` to its end, as the hub reads its master's stderr (ssh-tunnels.ts `eachLine`): each line to `lines` as it comes. */
const readAll = async (
  stream: ReadableStream<Uint8Array>,
  lines: string[]
): Promise<void> => {
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  for await (const chunk of stream) {
    lines.push(...splitter.push(decoder.decode(chunk, { stream: true })));
  }
  lines.push(...splitter.push(decoder.decode()));
  if (splitter.pending) {
    lines.push(splitter.end());
  }
};

/** 1 and 2: as the hub spawns it, then that process SIGKILLed alone. */
async function spawnedKilled(kit: Kit): Promise<void> {
  const { check } = kit;
  const child = Bun.spawn([systemProgram("sh"), ...tetherArgs(COMMAND)], {
    env: process.env,
    stdin: "pipe",
    stdout: "ignore",
    stderr: "pipe",
    detached: true,
  });
  const lines: string[] = [];
  const reading = readAll(child.stderr, lines);
  await holdsWithin(
    async () => lines.includes(UP) && (await group(child.pid)).length >= 3,
    STAND_MS
  );
  const standing = await group(child.pid);
  const runsCommand = (await commandLine(child.pid))?.startsWith(
    process.execPath
  );
  check(
    "1: the process the caller spawned runs the command itself, its reader (sh) and the reader's cat in its group",
    runsCommand === true &&
      standing.some(({ args }) =>
        args.startsWith(`${systemProgram("sh")} -c`)
      ) &&
      standing.some(({ args }) => args === "cat"),
    named(standing)
  );

  signal(listedPid(child.pid), "SIGKILL");
  const from = performance.now();
  // The hub's `connect`: its read of the master's stderr to the end, then its exit.
  const ended =
    (await readWithin(GONE_MS, () => Promise.all([reading, child.exited])))
      .kind === "answered";
  const took = Math.round(performance.now() - from);
  const pidRuns = (await processTable()).some((row) => row.pid === child.pid);
  check(
    `2: the spawned process SIGKILLed alone, the caller's read of its stderr ends and its exit is seen within ${GONE_MS} ms, and the command is gone with it`,
    ended && child.signalCode === "SIGKILL" && lines.includes(UP) && !pidRuns,
    `${ended ? `ended in ${took} ms` : `not ended after ${GONE_MS} ms`}, by ${child.signalCode}; stderr ${JSON.stringify(lines)}; pid ${child.pid} ${pidRuns ? "still listed" : "listed by none"}`
  );
  const gone = await holdsWithin(
    async () => (await group(child.pid)).length === 0,
    GONE_MS
  );
  untether(child.stdin);
  check(
    `2: its exit seen, the pipe let go as Bun reaps the child, the reader ends what is left of the group: every process of it gone within ${GONE_MS} ms`,
    gone !== undefined,
    gone === undefined
      ? `still running: ${named(await group(child.pid))}`
      : `gone ${gone} ms after the exit was seen`
  );
}

/** 3: the caller SIGKILLed. */
async function callerKilled(kit: Kit): Promise<void> {
  const caller = Bun.spawn([process.execPath, CHILD, "caller"], {
    env: process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const reader = caller.stdout.getReader();
  const { value } = await reader.read();
  reader.releaseLock();
  const said = new TextDecoder().decode(value).trim();
  const tether = Number(
    (JSON.parse(said || "{}") as { tether?: number }).tether
  );
  const standing = Number.isInteger(tether) ? await group(tether) : [];
  caller.kill("SIGKILL");
  await caller.exited;
  const gone = await holdsWithin(
    async () => (await group(tether)).length === 0,
    GONE_MS
  );
  kit.check(
    `3: the caller SIGKILLed, the command, the reader and its cat are gone within ${GONE_MS} ms`,
    standing.length >= 3 && gone !== undefined,
    `standing: ${named(standing)}; ${gone === undefined ? `still running: ${named(await group(tether))}` : `gone ${gone} ms after the caller`}`
  );
}

/** 4: spawned in its caller's group, it refuses before its command runs. */
async function unled(kit: Kit): Promise<void> {
  const marker = join(
    process.env.TMPDIR ?? "/tmp",
    `tether-unled-${crypto.randomUUID()}`
  );
  const child = Bun.spawn(
    [
      systemProgram("sh"),
      ...tetherArgs([
        process.execPath,
        "-e",
        `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "")`,
      ]),
    ],
    { env: process.env, stdin: "pipe", stdout: "ignore", stderr: "pipe" }
  );
  const [code, said] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  kit.check(
    `4: spawned in its caller's process group, the tether exits ${TETHER_UNLED} saying so, and its command never runs`,
    code === TETHER_UNLED &&
      said.includes(tetherWords.unled) &&
      !existsSync(marker),
    `exit ${code}; said ${JSON.stringify(said.trim())}; the command ${existsSync(marker) ? "ran" : "never ran"}`
  );
}

/** 5: no process takes the command's pid while the reader holds its group. */
async function pidHeld(kit: Kit): Promise<void> {
  if (process.platform !== "linux") {
    kit.note("5: a PID namespace's last pid is Linux's alone; read on Linux");
    return;
  }
  if (process.env.CAWCO_WORKSPACE) {
    kit.note(
      `5 (a PID namespace of its own) runs on the host: ${BOUNDARY_INSIDE}; bun scripts/probe-kit/run.ts tether`
    );
    return;
  }
  const unshare = Bun.which("unshare");
  if (!kit.check("5: the host has unshare", unshare !== null, "not on PATH")) {
    return;
  }
  const ran = Bun.spawn(
    [
      unshare as string,
      "--map-root-user",
      "--pid",
      "--mount-proc",
      "--fork",
      "--kill-child",
      "--",
      systemProgram("sh"),
      "-c",
      // pid 1 of the namespace: its `wait` reaps what the namespace leaves it.
      '"$@" & wait "$!"',
      "sh",
      process.execPath,
      CHILD,
      "reuse",
    ],
    { env: process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" }
  );
  const [out, err, code] = await Promise.all([
    new Response(ran.stdout).text(),
    new Response(ran.stderr).text(),
    ran.exited,
  ]);
  const line = out.trim().split("\n").at(-1) ?? "";
  const read = (line.startsWith("{") ? JSON.parse(line) : {}) as {
    control?: number;
    groupGone?: boolean;
    heldBy?: number[];
    lastPid?: number;
    next?: number;
    nextRuns?: boolean;
    spawned?: number;
    taken?: boolean;
  };
  kit.check(
    "5: in a PID namespace of its own, the spawned process SIGKILLed and reaped, its pid asked for next goes to no process while the reader waits; the reader's signal leaves the process started then running and ends its group; reaped, the same ask gets that pid",
    code === 0 &&
      read.spawned !== undefined &&
      read.lastPid === read.spawned - 1 &&
      read.next !== read.spawned &&
      read.taken === false &&
      (read.heldBy?.length ?? 0) >= 1 &&
      read.groupGone === true &&
      read.nextRuns === true &&
      read.control === read.spawned,
    `exit ${code}; ${line || "said nothing"}${err.trim() ? `; stderr ${err.trim().slice(0, 300)}` : ""}`
  );
}

const spec: Spec = {
  group: "The hub and machines",
  name: "tether",
  async run(kit: Kit) {
    await spawnedKilled(kit);
    await callerKilled(kit);
    await unled(kit);
    await pidHeld(kit);
  },
};

export default spec;
