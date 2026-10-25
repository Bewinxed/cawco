/**
 * The agent's loop, watched from a thread of its own (loop-watch.ts
 * `startWatchdog`): what the loop's own watch cannot say, because it
 * runs on the loop it watches.
 *
 * The loop's own tick says a stall once it has ended. Two never end and so
 * were never said: on 2026-10-25 obelisk's agent stopped at 12:35 and at
 * 13:48, its last line an ordinary one, nothing more until it was killed 45
 * and 67 minutes later, its thread on the CPU throughout, SIGTERM unheard.
 * The host forbids ptrace (kernel.yama.ptrace_scope 1), so no stack of it
 * could be taken from outside.
 *
 * From here, each second, two things are read: the loop's beat, the time
 * its last tick wrote into memory both threads share, and its answer to a
 * byte this thread sends it over a loopback socket every
 * {@link ECHO_EVERY_MS}. A beat {@link SAY_MS} old is a loop held; a beat
 * that keeps time with no echo for as long is a loop that runs its timers
 * but takes in nothing (no socket, no file, no signal). Either is said at
 * {@link SAY_AT_S} and each minute after, while it lasts, with what the
 * process says of its main thread (Linux `/proc`: on the CPU, and how much
 * of it, or asleep in the kernel and where), the agent's phase, the work in
 * flight and the marked section entered last, as the loop last posted them,
 * and the process's memory. Its end is said once.
 */

import { readFile } from "node:fs/promises";
import { loopWords } from "@cawco/core/words/loop";
import { BEAT, LEFT, SECTION, type WatchdogMessage } from "./loop-watch-shared";

declare const self: Worker;

/** How often the loop is looked at from here. */
const LOOK_MS = 1000;
/** How often a byte goes to the loop's echo. */
const ECHO_EVERY_MS = 5000;
/** A beat or an echo this late is a stall worth saying. Ours: ten of the loop's own late ticks. */
const SAY_MS = 10_000;
/** When, in seconds of a stall, it is said; then every minute. */
const SAY_AT_S = [10, 30, 60];
/** Linux's clock ticks per second, in which `/proc` counts CPU time (`getconf CLK_TCK`). */
const CLOCK_TICKS = 100;

let shared: Float64Array | undefined;
const sections = new Map<number, string>();
let phase = "starting";
let flying = "nothing counted";
/** When the byte the loop owes an echo for went (ms epoch); none owed between. */
let owed: number | undefined;

/** The main thread's CPU time (ticks) and when it was read, for its share since. */
let lastCpu: { at: number; ticks: number } | undefined;

/** The main thread as `/proc` says it: its state, its CPU share since the last read, where it sleeps. Empty off Linux. */
const mainThread = async (): Promise<string> => {
  if (process.platform !== "linux") {
    return "";
  }
  const task = `/proc/self/task/${process.pid}`;
  try {
    const [stat, wchan] = await Promise.all([
      readFile(`${task}/stat`, "utf8"),
      readFile(`${task}/wchan`, "utf8").catch(() => ""),
    ]);
    // After the command's closing paren: state, then 10 fields to utime and stime.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const state = fields[0] ?? "?";
    const ticks = Number(fields[11]) + Number(fields[12]);
    const at = Date.now();
    const share =
      lastCpu && at > lastCpu.at
        ? Math.round(
            ((ticks - lastCpu.ticks) /
              CLOCK_TICKS /
              ((at - lastCpu.at) / 1000)) *
              100
          )
        : undefined;
    lastCpu = { at, ticks };
    const where = wchan.trim() && wchan.trim() !== "0" ? wchan.trim() : "";
    if (state === "R") {
      return loopWords.onCpu(share);
    }
    if (state === "D") {
      return loopWords.onDisk(where);
    }
    return loopWords.asleep(state, where, share);
  } catch {
    return "";
  }
};

/** The process's resident memory and swap, as `/proc` says; empty off Linux. */
const memory = async (): Promise<string> => {
  if (process.platform !== "linux") {
    return "";
  }
  const status = await readFile("/proc/self/status", "utf8").catch(() => "");
  const kb = (key: string): number | undefined => {
    const found = new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(status)?.[1];
    return found === undefined ? undefined : Number(found);
  };
  const size = (value: number | undefined) => {
    if (value === undefined) {
      return "?";
    }
    return value >= 1024 * 1024
      ? `${(value / 1024 / 1024).toFixed(1)} GB`
      : `${Math.round(value / 1024)} MB`;
  };
  return `resident ${size(kb("VmRSS"))}, swapped ${size(kb("VmSwap"))}`;
};

/** The marked section entered last, and whether it was left. */
const lastSection = (): string => {
  if (!shared || shared[SECTION] === -1) {
    return "no marked section entered yet";
  }
  const name = sections.get(shared[SECTION] as number) ?? "an unnamed section";
  return loopWords.lastSection(name, shared[LEFT] === 1);
};

/** One stall, as it is said: which kind, since when, and how far its saying has got. */
let stall: { kind: "held" | "deaf"; since: number; said: number } | undefined;

const say = async (kind: "held" | "deaf", ms: number): Promise<void> => {
  const what =
    kind === "held"
      ? loopWords.heldNow(Math.round(ms / 1000))
      : loopWords.deafNow(Math.round(ms / 1000));
  const parts = [
    thread,
    `phase: ${phase}`,
    `in flight: ${flying}`,
    lastSection(),
    await memory(),
  ].filter(Boolean);
  console.warn(`[loop] ${what}; ${parts.join("; ")}`);
};

/** The main thread as the last look read it: read each look, so its CPU share spans one second. */
let thread = "";

const look = async (): Promise<void> => {
  if (!shared) {
    return;
  }
  thread = await mainThread();
  const now = Date.now();
  const held = now - (shared[BEAT] as number);
  const deaf = owed === undefined ? 0 : now - owed;
  let kind: "held" | "deaf" | undefined;
  if (held >= SAY_MS) {
    kind = "held";
  } else if (deaf >= SAY_MS) {
    kind = "deaf";
  }
  if (!kind) {
    if (stall && stall.said > 0) {
      console.warn(
        loopWords.answersAgain(Math.round((now - stall.since) / 1000))
      );
    }
    stall = undefined;
    return;
  }
  const ms = kind === "held" ? held : deaf;
  if (stall?.kind !== kind) {
    stall = { kind, since: now - ms, said: 0 };
  }
  const due =
    SAY_AT_S[stall.said] ??
    (SAY_AT_S.at(-1) as number) + 60 * (stall.said - SAY_AT_S.length + 1);
  if (ms >= due * 1000) {
    stall.said += 1;
    await say(kind, ms);
  }
};

/** Sends the loop's echo a byte every {@link ECHO_EVERY_MS}, one owed at a time. */
const echo = async (port: number): Promise<void> => {
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      data() {
        owed = undefined;
      },
      close() {
        owed = undefined;
      },
    },
  });
  setInterval(() => {
    if (owed === undefined) {
      owed = Date.now();
      socket.write("·");
    }
  }, ECHO_EVERY_MS);
};

self.onmessage = (event: MessageEvent<WatchdogMessage>) => {
  const message = event.data;
  switch (message.kind) {
    case "start":
      shared = new Float64Array(message.beat);
      echo(message.port).catch((error: unknown) =>
        console.warn(
          `[loop] the loop's watch from its own thread reads only the loop's beat: its echo did not connect (${error instanceof Error ? error.message : String(error)})`
        )
      );
      setInterval(() => {
        look().catch(() => undefined);
      }, LOOK_MS);
      return;
    case "section":
      sections.set(message.id, message.name);
      return;
    case "state":
      ({ phase, flying } = message);
      return;
    default: {
      const unhandled: never = message;
      throw new Error(`unhandled message: ${JSON.stringify(unhandled)}`);
    }
  }
};
