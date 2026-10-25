/**
 * The machine's heavy-work slots hold merge checks and `bun run check` to
 * what the machine has room for (core heavy-slots.ts). Under a scratch HOME,
 * so the pool is the spec's own (`~/.cawco/workspace-cache/heavy-slots/`
 * there) with the machine's own count, and no real run is held up.
 *
 * - (a) The machine's slots plus three merge checks, each through the
 *   agent's runner (hub-command.ts `runHubCommand`, a run naming its
 *   `gate`, as the hub sends a gate step), started 30 ms apart, each a
 *   2 s command printing when it starts and ends: every one runs and exits
 *   0; their own start and end times never overlap past the slot count and
 *   do reach it; the spec's own reading of the slot files (every 50 ms)
 *   never finds more held; exactly the three past the count tell the hub a
 *   `heavy` wait naming the holders, then its end, and they start in the
 *   order they came; each command's environment names its lease.
 * - (b) A merge check waiting for a slot, cancelled as the hub cancels one
 *   (CONTROL_CANCEL_COMMAND, `cancelCommand`): it answers `cancelled` at
 *   once, never having run.
 * - (c) `bun run check` with every slot held by other runs: it says it
 *   waits (the queue marker, naming the holders) and starts nothing until
 *   one lets go, then takes the slot, and sizes its parallelism to its
 *   share of the machine's cores (`golar tsc --builders`, checks at once).
 * - (d) `bun run check` as a merge check runs it (under the runner's
 *   lease, every other slot held): it takes no slot of its own and waits
 *   for none.
 * - (e) What a merge check runs is in the background: a child its command
 *   starts reads nice 10 (`ps -o nice=`) and, on Linux, the idle I/O class
 *   (`ionice -p`), where the spec's own process and a plain command's
 *   child read the machine's default; `bun run check` that took its own
 *   slot in (c) reads the same. run.ts starts this spec's process without
 *   lowering it (slot.ts `probeSlot(false)`), so the reading is the runner's
 *   doing.
 *
 *   bun scripts/probe-kit/run.ts heavy-slots
 */
import { existsSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import {
  cancelCommand,
  runHubCommand,
  setCommandQueue,
} from "../../../packages/agent/src/hub-command";
import {
  openLockFile,
  tryLock,
  unlock,
} from "../../../packages/core/src/flock";
import {
  type CommandQueueFrame,
  type CommandResult,
  type CommandRun,
  queueWords,
} from "../../../packages/core/src/harness";
import {
  HEAVY_NICE,
  HEAVY_SLOT_ENV,
  machinePlace,
  type SlotPlace,
} from "../../../packages/core/src/heavy-slots";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const CHILD = join(import.meta.dir, "..", "slot-child.ts");
/** A merge check's command: when it starts (ms), its lease, 2 s of work, when it ends. */
const NOW_MS = `perl -MTime::HiRes=time -e 'printf "%.0f", time*1000'`;
const WORK = `echo "START $(${NOW_MS}) $${HEAVY_SLOT_ENV}"; sleep 2; echo "END $(${NOW_MS})"`;
const START = /^START (\d+) (.*)$/m;
const END = /^END (\d+)$/m;

/** A process's nice (`ps -o nice=`) and, on Linux, its I/O class (`ionice -p`, "idle" or "none: prio 4"). */
const priorityOf = (pid: number): { io: string; nice: number } => ({
  nice: Number(
    Bun.spawnSync(["ps", "-o", "nice=", "-p", String(pid)])
      .stdout.toString()
      .trim()
  ),
  io:
    process.platform === "linux"
      ? Bun.spawnSync(["ionice", "-p", String(pid)])
          .stdout.toString()
          .trim()
      : "idle",
});

/** In the background: {@link HEAVY_NICE} and the idle I/O class. */
const inBackground = ({ io, nice }: { io: string; nice: number }): boolean =>
  nice === HEAVY_NICE && io === "idle";

/** How many of `place`'s slot files some process holds now. */
function heldNow(place: SlotPlace): number {
  let held = 0;
  for (let i = 0; i < place.count; i += 1) {
    let fd: number;
    try {
      fd = openLockFile(join(place.dir, `slot-${i}`), false);
    } catch {
      continue;
    }
    if (!tryLock(fd)) {
      held += 1;
    }
    unlock(fd);
  }
  return held;
}

/** The most of `spans` running at one moment. */
const mostAtOnce = (spans: { end: number; start: number }[]): number =>
  Math.max(
    0,
    ...spans.map(
      ({ start }) =>
        spans.filter((one) => one.start <= start && start < one.end).length
    )
  );

/** The environment of a process the spec starts: none of an enclosing run's lease. */
const ownEnv = (): Record<string, string | undefined> => {
  const env = { ...process.env };
  delete env[HEAVY_SLOT_ENV];
  return env;
};

/** A process's output as it comes, and its end. */
interface Started {
  ended: Promise<number>;
  out: () => string;
  proc: Bun.Subprocess;
}

function startProcess(argv: string[], cwd = ROOT): Started {
  const proc = Bun.spawn(argv, {
    cwd,
    env: ownEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
  let text = "";
  const read = async (stream: ReadableStream<Uint8Array>) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      text += decoder.decode(chunk);
    }
  };
  const reading = Promise.all([
    read(proc.stdout as ReadableStream<Uint8Array>),
    read(proc.stderr as ReadableStream<Uint8Array>),
  ]);
  return {
    proc,
    out: () => text,
    ended: Promise.all([proc.exited, reading]).then(([code]) => code),
  };
}

/** Waits until `look` answers true, at most `ms`. */
async function until(look: () => boolean, ms = 20_000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (look()) {
      return true;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling a condition
    await Bun.sleep(50);
  }
  return look();
}

/** `count` slot-child.ts runs each holding one of `place`'s slots until killed. */
async function holders(place: SlotPlace, count: number): Promise<Started[]> {
  const held = Array.from({ length: count }, (_, k) =>
    startProcess([
      process.execPath,
      CHILD,
      place.dir,
      String(place.count),
      `holder-${k + 1}`,
      "forever",
      "60000",
      "100",
    ])
  );
  await until(() => heldNow(place) >= count);
  return held;
}

const endAll = async (runs: Started[]): Promise<void> => {
  for (const run of runs) {
    run.proc.kill("SIGKILL");
  }
  await Promise.all(runs.map((run) => run.ended));
};

/** Each run's queue frames, by run id. */
const frames = new Map<string, CommandQueueFrame["queue"][]>();

const mergeCheck = (
  id: string,
  cmd: string,
  gate: string
): Promise<CommandResult> => {
  const run: CommandRun = { id, queueMaxMs: 60_000, gate };
  return runHubCommand(ROOT, cmd, 120_000, undefined, run);
};

async function inLine(kit: Kit, place: SlotPlace): Promise<void> {
  const { count } = place;
  const total = count + 3;
  let most = 0;
  const reader = setInterval(() => {
    most = Math.max(most, heldNow(place));
  }, 50);
  const runs: Promise<CommandResult>[] = [];
  for (let k = 0; k < total; k += 1) {
    runs.push(mergeCheck(`a-${k}`, WORK, `merge check ${k + 1}`));
    // biome-ignore lint/performance/noAwaitInLoops: each run comes 30 ms after the last
    await Bun.sleep(30);
  }
  const results = await Promise.all(runs);
  clearInterval(reader);
  const spans = results.map((result) => ({
    start: Number(START.exec(result.stdout)?.[1] ?? 0),
    end: Number(END.exec(result.stdout)?.[1] ?? 0),
  }));
  kit.check(
    `(a) ${total} merge checks on ${count} slots all run and exit 0`,
    results.every((result) => result.exitCode === 0) &&
      spans.every((span) => span.start > 0 && span.end > span.start),
    `exits ${results.map((result) => result.exitCode).join(", ")}`
  );
  const atOnce = mostAtOnce(spans);
  kit.check(
    `(a) never more than ${count} run at once, and ${count} do`,
    atOnce === count,
    `the most running at one moment, from their own start and end times: ${atOnce}`
  );
  kit.check(
    `(a) the slot files never show more than ${count} held`,
    most === count,
    `the most held at one 50 ms reading: ${most}`
  );
  const waited = [...frames.entries()]
    .filter(([id, told]) => id.startsWith("a-") && told.length > 0)
    .map(([id]) => Number(id.slice(2)))
    .sort((a, b) => a - b);
  const first = frames.get(`a-${waited[0]}`)?.[0];
  kit.check(
    "(a) exactly the three past the count tell the hub they wait for a heavy-work slot, naming its holders, and then that they wait no more",
    waited.join(",") === [count, count + 1, count + 2].join(",") &&
      waited.every((k) => {
        const told = frames.get(`a-${k}`) ?? [];
        return (
          told[0]?.slot === "heavy" &&
          told[0].holders.startsWith(
            `${count} of ${count} held by merge check`
          ) &&
          told.at(-1) === null
        );
      }),
    `${waited.map((k) => `merge check ${k + 1}`).join(", ")} waited; the hub's words: ${first ? queueWords(first) : "(none)"}`
  );
  const late = waited.map((k) => spans[k]?.start ?? 0);
  kit.check(
    "(a) the waiting checks start in the order they came, each once a holder ended",
    late.every((at, i) => i === 0 || at >= (late[i - 1] ?? 0)) &&
      late.every((at) =>
        spans.slice(0, count).some((span) => span.end <= at + 50)
      ),
    `they started ${late.map((at) => `+${at - Math.min(...spans.map((span) => span.start))} ms`).join(", ")} after the first`
  );
  const leases = results.map((result) => START.exec(result.stdout)?.[2] ?? "");
  kit.check(
    "(a) each command runs under its lease, its environment naming it",
    leases.every((words, k) =>
      new RegExp(`^slot \\d+ of ${count}, merge check ${k + 1}$`).test(words)
    ),
    leases.slice(-2).join(" | ")
  );
}

async function cancelWhileWaiting(kit: Kit, place: SlotPlace): Promise<void> {
  const held = await holders(place, place.count);
  const run = mergeCheck("b-0", WORK, "merge check cancelled");
  const told = await until(() => (frames.get("b-0")?.length ?? 0) > 0);
  const asked = Date.now();
  const running = cancelCommand("b-0");
  const result = await run;
  const took = Date.now() - asked;
  await endAll(held);
  kit.check(
    "(b) a merge check cancelled while it waits answers cancelled at once, never having run",
    told &&
      running &&
      result.cancelled === true &&
      !result.stdout.includes("START") &&
      took < 1500,
    `told the hub it waited: ${told}; cancel found it: ${running}; answered ${JSON.stringify({ cancelled: result.cancelled, exitCode: result.exitCode })} ${took} ms after the cancel`
  );
}

const SHARE_LINE =
  /check: (\d+) checks at once, golar tsc --builders (\d+): (\d+) core\(s\)/;

async function checkWaits(kit: Kit, place: SlotPlace): Promise<void> {
  const held = await holders(place, place.count);
  const check = startProcess([
    process.execPath,
    "scripts/check.ts",
    "--base",
    "HEAD",
  ]);
  const waits = await until(() =>
    check
      .out()
      .includes(
        `CAWCO-QUEUE wait heavy: ${place.count} of ${place.count} held by holder-`
      )
  );
  await Bun.sleep(2000);
  const startedEarly = check.out().includes("check: ");
  const freedAt = Date.now();
  held[0]?.proc.kill("SIGKILL");
  const took = await until(() =>
    check.out().includes("CAWCO-QUEUE held heavy")
  );
  const tookAfter = Date.now() - freedAt;
  await until(() => check.out().includes("check: "));
  const lowered = priorityOf(check.proc.pid);
  const code = await check.ended;
  await endAll(held);
  const out = check.out();
  const waitLine =
    out.split("\n").find((line) => line.startsWith("CAWCO-QUEUE wait")) ?? "";
  kit.check(
    "(c) `bun run check` with every slot held says it waits, naming the holders, and starts nothing",
    waits && !startedEarly,
    `${waitLine.slice(0, 160)}…; a scope line within 2 s of waiting: ${startedEarly}`
  );
  const share = SHARE_LINE.exec(out);
  const expected = Math.max(1, Math.floor(cpus().length / place.count));
  kit.check(
    "(c) once a holder ends it takes the slot, and sizes its parallelism to its share of the machine",
    took &&
      tookAfter < 2000 &&
      Number(share?.[3]) === expected &&
      Number(share?.[2]) === Math.min(8, expected),
    `held ${tookAfter} ms after the holder ended; ${share?.[0] ?? "(no share line)"}; check exited ${code}`
  );
  kit.check(
    "(e) `bun run check` that took its own slot runs at nice 10 in the idle I/O class",
    inBackground(lowered),
    `bun run check (pid ${check.proc.pid}): nice ${lowered.nice}, I/O ${lowered.io}`
  );
}

/** Starts `cmd` with `run`, and reads the priority of the child it writes the pid of, while it runs. */
async function childPriority(
  kit: Kit,
  name: string,
  run: CommandRun | undefined
): Promise<{ io: string; nice: number; pid: number }> {
  const file = join(kit.out, `${name}.pid`);
  const ran = runHubCommand(
    ROOT,
    `sleep 3 & echo $! > ${file}; wait`,
    30_000,
    undefined,
    run
  );
  await until(
    () => existsSync(file) && readFileSync(file, "utf8").trim() !== ""
  );
  const pid = Number(readFileSync(file, "utf8").trim());
  const read = { ...priorityOf(pid), pid };
  await ran;
  return read;
}

async function background(kit: Kit): Promise<void> {
  const own = priorityOf(process.pid);
  const plain = await childPriority(kit, "plain", undefined);
  const merge = await childPriority(kit, "merge", {
    id: "e-0",
    queueMaxMs: 60_000,
    gate: "merge check reading its priority",
  });
  kit.check(
    "(e) a merge check's child runs at nice 10 in the idle I/O class, where the spec and a plain command's child do not",
    !inBackground(own) &&
      own.nice < HEAVY_NICE &&
      !inBackground(plain) &&
      inBackground(merge),
    `the spec: nice ${own.nice}, I/O ${own.io}; a plain command's child: nice ${plain.nice}, I/O ${plain.io}; the merge check's child (pid ${merge.pid}): nice ${merge.nice}, I/O ${merge.io}`
  );
}

async function checkUnderMergeCheck(kit: Kit, place: SlotPlace): Promise<void> {
  const held = await holders(place, place.count - 1);
  const result = await mergeCheck(
    "d-0",
    "bun scripts/check.ts --base HEAD",
    "merge check running bun run check"
  );
  await endAll(held);
  const under = result.stdout
    .split("\n")
    .find((line) => line.startsWith("check: runs under"));
  kit.check(
    "(d) `bun run check` as a merge check runs it takes no slot of its own and waits for none",
    Boolean(under?.includes("merge check running bun run check")) &&
      !result.stdout.includes("CAWCO-QUEUE wait") &&
      (frames.get("d-0")?.length ?? 0) === 0,
    `${under ?? "(no line saying whose slot it runs under)"}; exit ${result.exitCode}`
  );
}

const spec: Spec = {
  name: "heavy-slots",
  ownHome:
    "its heavy-work slots are a pool of its own under a scratch HOME, so no real run on the machine is held up and none holds it up",
  run: async (kit) => {
    setCommandQueue((frame) => {
      frames.set(frame.runId, [
        ...(frames.get(frame.runId) ?? []),
        frame.queue,
      ]);
    });
    const place = machinePlace();
    kit.check(
      "the spec's pool is under its scratch HOME, with the machine's count",
      place.dir.startsWith(process.env.HOME ?? "/nowhere") && place.count >= 1,
      `${place.count} slots at ${place.dir}`
    );
    await background(kit);
    await inLine(kit, place);
    await cancelWhileWaiting(kit, place);
    await checkWaits(kit, place);
    await checkUnderMergeCheck(kit, place);
  },
};

export default spec;
