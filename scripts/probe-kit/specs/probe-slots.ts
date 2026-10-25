/**
 * The machine's heavy-work slots (slot.ts): runs past the slots wait in line and
 * then run, a dead holder's slot is taken at once, a wait that runs out
 * fails saying who held every slot. Each run is a process of its own
 * (slot-child.ts) on a slot folder of the spec's own, so the machine's own
 * slots and the runs holding them are never touched; the code is the one
 * every probe run takes its slot with.
 *
 * - (a) Four runs on two slots, started 300 ms apart, each holding 2.5 s:
 *   the spec's own reading of the slot files (every 50 ms, the slots it can't
 *   lock) never finds more than two held and finds two; the third and
 *   fourth each print `waiting for a heavy-work slot: 2 of 2 held by …`, naming
 *   both holders, then take a slot in the order they came, the third saying
 *   how long it waited; each holder runs at nice 10, and a child it starts
 *   takes no slot of its own (INHERITED) and runs at nice 10 too.
 * - (b) A holder SIGKILLed while another waits on its one slot: the waiter
 *   named it while it lived, and takes the slot within a second of the kill.
 * - (c) A waiter SIGKILLed in line holds up nobody behind it: once the
 *   holder ends, the run behind the dead one takes the slot.
 * - (d) A wait that runs out: the run ends with `no heavy-work slot came free in
 *   2s for … : 1 of 1 held by …`.
 * - (e) The machine's own count, from its cores and memory.
 *
 *   bun scripts/probe-kit/run.ts probe-slots
 */
import { mkdir, rm } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import {
  openLockFile,
  tryLock,
  unlock,
} from "../../../packages/core/src/flock";
import {
  HEAVY_NICE,
  HEAVY_SLOT_ENV,
  machineSlots,
} from "../../../packages/core/src/heavy-slots";
import type { Kit, Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "slot-child.ts");
const POLL_MS = 200;
/** A run's line once it holds a slot of two. */
const SLOT_TAKEN = /heavy-work slot \d of 2 /;
const TOOK_AFTER_WAITING =
  /heavy-work slot \d of 2 taken by third@\S+ after waiting \ds/;
const RAN_OUT =
  /no heavy-work slot came free in 2s for late@\S+: 1 of 1 held by hog@\S+ \(\ds\)/;
/** A run's nice, from its TAKEN or INHERITED line. */
const NICE = / nice (\d+)/;
const niceOf = (line: string): number => Number(NICE.exec(line)?.[1] ?? -1);

/** A run of slot-child.ts: its lines as they come, and its process. */
interface Child {
  ended: Promise<number>;
  lines: string[];
  name: string;
  proc: Bun.Subprocess;
}

function start(
  dir: string,
  count: number,
  name: string,
  hold: number | "forever",
  waitMs = 60_000
): Child {
  const env = { ...process.env };
  delete env[HEAVY_SLOT_ENV];
  const proc = Bun.spawn(
    [
      process.execPath,
      CHILD,
      dir,
      String(count),
      name,
      String(hold),
      String(waitMs),
      String(POLL_MS),
    ],
    { env, stdout: "pipe", stderr: "inherit" }
  );
  const lines: string[] = [];
  const reading = (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
      rest += decoder.decode(chunk);
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      lines.push(...parts.filter(Boolean));
    }
  })();
  return {
    name,
    proc,
    lines,
    ended: Promise.all([proc.exited, reading]).then(([code]) => code),
  };
}

/** The time (ms) of `child`'s first line holding `text`, or null. */
const at = (child: Child, text: string): number | null => {
  const line = child.lines.find((one) => one.includes(text));
  return line ? Number(line.split(" ")[0]) : null;
};

/** Waits until `child` has said `text`, at most `ms`. */
async function said(child: Child, text: string, ms = 20_000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (at(child, text) !== null) {
      return true;
    }
    // biome-ignore lint/performance/noAwaitInLoops: polling a child's output
    await Bun.sleep(50);
  }
  return false;
}

/** How many of `dir`'s `count` slot files another process holds now. */
function heldNow(dir: string, count: number): number {
  let held = 0;
  for (let i = 0; i < count; i += 1) {
    let fd: number;
    try {
      fd = openLockFile(join(dir, `slot-${i}`), false);
    } catch {
      continue;
    }
    if (tryLock(fd)) {
      unlock(fd);
    } else {
      unlock(fd);
      held += 1;
    }
  }
  return held;
}

const lineOf = (child: Child, text: string): string =>
  child.lines.find((one) => one.includes(text)) ??
  `(${child.name} never said "${text}")`;

async function inLine(kit: Kit, root: string): Promise<void> {
  const dir = join(root, "a");
  await mkdir(dir, { recursive: true });
  let most = 0;
  const reader = setInterval(() => {
    most = Math.max(most, heldNow(dir, 2));
  }, 50);
  const runs: Child[] = [];
  for (const name of ["first", "second", "third", "fourth"]) {
    runs.push(start(dir, 2, name, 2500));
    // biome-ignore lint/performance/noAwaitInLoops: each run comes 300 ms after the last
    await Bun.sleep(300);
  }
  const codes = await Promise.all(runs.map((run) => run.ended));
  clearInterval(reader);
  const [first, , third, fourth] = runs as [Child, Child, Child, Child];
  kit.check(
    "(a) four runs on two slots all run and end",
    codes.every((code) => code === 0) &&
      runs.every((run) => at(run, "TAKEN") !== null),
    `exits ${codes.join(", ")}`
  );
  kit.check(
    "(a) never more than two hold a slot, and two do",
    most === 2,
    `the most held at one reading: ${most}`
  );
  for (const run of [third, fourth]) {
    const waiting = lineOf(run, "waiting for a heavy-work slot");
    kit.check(
      `(a) the ${run.name} run waits with a line naming both holders before it runs`,
      waiting.includes("waiting for a heavy-work slot: 2 of 2 held by") &&
        waiting.includes("first@") &&
        waiting.includes("second@") &&
        (at(run, "waiting for a heavy-work slot") ?? 0) <
          (at(run, "TAKEN") ?? 0),
      waiting.slice(14)
    );
  }
  kit.check(
    "(a) the waiting runs take a slot in the order they came, once a holder lets go",
    (at(third, "TAKEN") ?? 0) < (at(fourth, "TAKEN") ?? 0) &&
      (at(third, "TAKEN") ?? 0) >=
        (at(first, "RELEASED") ?? Number.POSITIVE_INFINITY),
    `first let go at +${(at(first, "RELEASED") ?? 0) - (at(first, "TAKEN") ?? 0)} ms; third took at +${(at(third, "TAKEN") ?? 0) - (at(first, "TAKEN") ?? 0)}, fourth at +${(at(fourth, "TAKEN") ?? 0) - (at(first, "TAKEN") ?? 0)}`
  );
  const took =
    third.lines.find((one) => SLOT_TAKEN.test(one)) ?? "(third said no slot)";
  kit.check(
    "(a) a run that waited says it took its slot and how long it waited",
    TOOK_AFTER_WAITING.test(took),
    took.slice(14)
  );
  kit.check(
    `(a) each holder runs at nice ${HEAVY_NICE} or more, and a child it starts takes no slot and runs at the same nice`,
    runs.every(
      (run) =>
        niceOf(lineOf(run, "TAKEN")) >= HEAVY_NICE &&
        niceOf(lineOf(run, "INHERITED")) === niceOf(lineOf(run, "TAKEN"))
    ),
    runs
      .map(
        (run) =>
          `${lineOf(run, "TAKEN").slice(14)}; ${lineOf(run, "INHERITED").slice(14)}`
      )
      .join(" | ")
  );
}

async function deadHolder(kit: Kit, root: string): Promise<void> {
  const dir = join(root, "b");
  await mkdir(dir, { recursive: true });
  const holder = start(dir, 1, "doomed", "forever");
  await said(holder, "TAKEN");
  const waiter = start(dir, 1, "patient", 1000);
  const waited = await said(
    waiter,
    "waiting for a heavy-work slot: 1 of 1 held by doomed@"
  );
  const killedAt = Date.now();
  holder.proc.kill("SIGKILL");
  await holder.ended;
  await said(waiter, "TAKEN", 10_000);
  await waiter.ended;
  const tookAfter =
    (at(waiter, "TAKEN") ?? Number.POSITIVE_INFINITY) - killedAt;
  kit.check(
    "(b) a run waiting on a holder names it, and takes its slot within a second of the holder's SIGKILL",
    waited && tookAfter >= 0 && tookAfter < 1000,
    `${lineOf(waiter, "waiting").slice(14)}; took it ${tookAfter} ms after the kill`
  );
}

async function deadWaiter(kit: Kit, root: string): Promise<void> {
  const dir = join(root, "c");
  await mkdir(dir, { recursive: true });
  const holder = start(dir, 1, "holder", 2000);
  await said(holder, "TAKEN");
  const gone = start(dir, 1, "gone", 0);
  await said(gone, "waiting for a heavy-work slot");
  const behind = start(dir, 1, "behind", 0);
  const queued = await said(behind, "1 run(s) ahead in line");
  gone.proc.kill("SIGKILL");
  await gone.ended;
  await holder.ended;
  const took = await said(behind, "TAKEN", 10_000);
  await behind.ended;
  kit.check(
    "(c) a run killed while it waits in line holds up nobody behind it",
    queued &&
      took &&
      (at(behind, "TAKEN") ?? 0) - (at(holder, "RELEASED") ?? 0) < 1000,
    `${lineOf(behind, "ahead in line").slice(14)}; took the slot ${(at(behind, "TAKEN") ?? 0) - (at(holder, "RELEASED") ?? 0)} ms after the holder let go`
  );
}

async function waitRunsOut(kit: Kit, root: string): Promise<void> {
  const dir = join(root, "d");
  await mkdir(dir, { recursive: true });
  const holder = start(dir, 1, "hog", "forever");
  await said(holder, "TAKEN");
  const late = start(dir, 1, "late", 0, 2000);
  const code = await late.ended;
  holder.proc.kill("SIGKILL");
  await holder.ended;
  const timeout = lineOf(late, "TIMEOUT");
  kit.check(
    "(d) a wait that runs out ends the run, saying who held every slot",
    code === 4 && RAN_OUT.test(timeout),
    timeout.slice(14)
  );
}

const spec: Spec = {
  name: "probe-slots",
  run: async (kit) => {
    const root = join(kit.out, "slots");
    await rm(root, { recursive: true, force: true });
    try {
      await inLine(kit, root);
      await deadHolder(kit, root);
      await deadWaiter(kit, root);
      await waitRunsOut(kit, root);
      const cores = cpus().length;
      const gib = Math.round(totalmem() / 1024 ** 3);
      kit.check(
        "(e) the machine's slots come from its cores and memory",
        machineSlots() >= 1,
        `${machineSlots()} slots: ${cores} cores at 6 a slot, ${gib} GiB at 16 a slot, the fewer`
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
