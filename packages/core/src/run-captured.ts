/**
 * One command run to its end with both of its output streams read whole:
 * the shape every short call (git, systemctl, launchctl, ps, a harness's
 * own CLI) takes before its caller reads the answer its way.
 */

import { lstat } from "node:fs/promises";
import type { Subprocess } from "bun";
import { Effect, Fiber } from "effect";
import { isGone } from "./absent";
import {
  BEAT_MS,
  type Bounded,
  QUIET_MS,
  readWhileLive,
  readWithin,
} from "./bounded";
import { lastOutput } from "./output-tail";
import { treeCpuTimes } from "./process-identity";
import { hostEnvironment } from "./session-env";
import { type Pid, signalGroup, spawnedPid } from "./signal";
import { spawnTethered, untether } from "./tether";
import { secondsOf } from "./time";
import { unhandled } from "./unhandled";
import { updatesWords } from "./words/updates";
import { systemProgram } from "./workspace-needs";

/** A command that ran to its end: its exit code, what it wrote, and the signal that ended it, if one did. */
export interface Ran {
  code: number;
  signalCode: Subprocess["signalCode"];
  stderr: string;
  stdout: string;
}

/** `spawn`'s child; a spawn of `program` that failed because folder `cwd` is not there throws naming the folder. */
const spawnedIn = async <T>(
  program: string | undefined,
  cwd: string | undefined,
  spawn: () => T
): Promise<T> => {
  try {
    return spawn();
  } catch (error) {
    if (cwd && isGone(error) && !(await lstat(cwd).catch(() => undefined))) {
      throw new Error(
        `${program} did not start: no folder is at ${cwd}, where it was to run`,
        {
          cause: error,
        }
      );
    }
    throw error;
  }
};

/**
 * Runs `argv` with `env`, `input` its stdin, and reads both streams to their
 * end. A `signal` abort kills it with `killSignal`. `env` is the caller's to
 * name: a Bun spawn without one gets the environment its process started
 * with (scripts/lint/spawn-names-env.grit). A `cwd` that is not there fails
 * naming the folder: Bun's own error names only the program (`ENOENT: no
 * such file or directory, posix_spawn 'git'`), which read as a git the
 * machine lacks when it was a `~/.worktrees` not made yet.
 */
export const runCaptured = async (
  argv: readonly string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    /** What it reads on stdin; none, it reads nothing. */
    input?: string;
    killSignal?: NodeJS.Signals;
    signal?: AbortSignal;
  }
): Promise<Ran> => {
  const { input, env, ...spawned } = options;
  const child = await spawnedIn(argv[0], spawned.cwd, () =>
    Bun.spawn([...argv], {
      ...spawned,
      env,
      stdin: input === undefined ? "ignore" : Buffer.from(input),
      stdout: "pipe",
      stderr: "pipe",
    })
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, signalCode: child.signalCode, stdout, stderr };
};

/**
 * How long a system tool is given to end: 120 s. The longest one waits by
 * design is a `systemctl --user start|stop` on its job, which systemd ends
 * at the unit's start or stop timeout (SIGKILL on a stop); no CawCo unit
 * sets one, so it is the user manager's default, 90 s
 * (https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html:
 * "DefaultTimeoutStartSec= and DefaultTimeoutStopSec= default to 90 s in the
 * system manager and 90 s in the user manager"). Every other call (launchctl
 * bootstrap, bootout, kickstart, list; systemd-run; lsof; a 3 s sample)
 * answers well inside it. The update helper's own service calls take the
 * same bound (cli binary-apply.ts `SERVICE_TIMEOUT_MS`).
 */
const SYSTEM_TOOL_MS = 120_000;

/**
 * A command as a failure names it: every argument but those that set a value
 * (`--setenv=KEY=value`, `--unit=…`), so what it was handed (an environment's
 * secrets among it) never reaches a log or a machine's row.
 */
const named = (argv: readonly string[]): string =>
  argv.filter((arg) => !arg.includes("=")).join(" ");

/**
 * Runs a system tool in the host's environment and the C locale, so the words
 * it prints parse the same on every machine, given {@link SYSTEM_TOOL_MS} to
 * end. One that has not is stopped, and the call throws naming it: a service
 * manager that does not answer never holds its caller (an update helper's
 * launch, a keeper's handover) for good.
 */
export const runInC = async (argv: readonly string[]): Promise<Ran> => {
  const ran = await readWithin(SYSTEM_TOOL_MS, (signal) =>
    runCaptured(argv, { env: { ...hostEnvironment(), LC_ALL: "C" }, signal })
  );
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(
        updatesWords.didNotEnd(named(argv), secondsOf(ran.after))
      );
    default:
      unhandled("read", ran);
  }
};

/*
 * A CHILD RUN WHILE IT LIVES. A command that may start others (an
 * installer's download and its script, a launcher's native binary, git and
 * its helpers) runs as the leader of a process group of its own under the
 * tether (tether.ts `spawnTethered`), so it ends with this process however
 * this process ends, and its whole group is ended when it goes quiet or
 * its caller lets go (signal.ts `signalGroup`). Ending the leader alone
 * left what it started running, holding its output open: `sh -c "curl … &&
 * bash install.sh"` signalled at its pid leaves `bash` and `curl` to
 * finish. An answer is given only once the whole group has gone, so what
 * runs next (an update's put-back) never runs beside it.
 */

/**
 * How long a group asked to end (SIGTERM) has before it is killed: one
 * quiet spell. Its own clean-up (an installer's, a launcher passing the
 * signal on, a `cawco binary-pins` ending its own installs) shows no sign
 * this could wait on that a process spinning past the signal would not
 * show too, so it is given the spell anything is given to show life.
 */
const KILL_AFTER_MS = QUIET_MS;

/** Each group this process leads that still runs, by its leader: what it ends when it is asked to end ({@link endEveryGroup}). */
const liveGroups = new Map<
  Pid,
  { readonly end: () => void; readonly gone: Fiber.Fiber<unknown> }
>();

/** Every process in `leader`'s group ended: asked, then killed {@link KILL_AFTER_MS} later if any of it still runs. Never throws. */
const endWholeGroup = (leader: Pid): void => {
  const send = (sig: NodeJS.Signals): void => {
    try {
      signalGroup(leader, sig);
    } catch (error) {
      console.warn(
        `[run] the process group ${leader} could not be sent ${sig}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  send("SIGTERM");
  setTimeout(() => send("SIGKILL"), KILL_AFTER_MS).unref();
};

/**
 * Waits for `gone`, a group's own end: its kill comes {@link KILL_AFTER_MS}
 * after it was asked, and its pipes close then, unless something it
 * started left the group holding them; that one is not waited on past a
 * second spell.
 */
const awaitGone = async (gone: Fiber.Fiber<unknown>): Promise<void> => {
  await readWithin(2 * KILL_AFTER_MS, () =>
    Effect.runPromise(Fiber.await(gone))
  );
};

/**
 * Calls `alive` each beat that a process `times` names (pid to CPU time
 * used) has spent CPU time since the beat before, or a process is there
 * that was not then: work silent by nature is alive while it works. Looks
 * once now, then each `BEAT_MS`; stops when `signal` aborts.
 */
export const watchCpu = (
  times: () => Promise<ReadonlyMap<number, number>>,
  alive: () => void,
  signal: AbortSignal
): void => {
  let last: ReadonlyMap<number, number> = new Map();
  const look = async (): Promise<void> => {
    const now = await times().catch(() => new Map<number, number>());
    for (const [pid, used] of now) {
      const before = last.get(pid);
      if (before === undefined || used > before) {
        alive();
        break;
      }
    }
    last = now;
  };
  const beat = setInterval(() => {
    look().catch(() => undefined);
  }, BEAT_MS);
  beat.unref();
  look().catch(() => undefined);
  signal.addEventListener("abort", () => clearInterval(beat), { once: true });
};

/**
 * Calls `alive` each beat that `leader`'s group or a process it started
 * has spent CPU time since the beat before, or a process is there that was
 * not then ({@link watchCpu}): a worker silent by nature (`git status` on a
 * large tree, a repack, an upload, an install a child runs in a group of
 * its own) is alive while it works. Stops when `signal` aborts.
 */
export const watchTreeCpu = (
  leader: number,
  alive: () => void,
  signal: AbortSignal
): void => watchCpu(() => treeCpuTimes(leader), alive, signal);

/** The environment variable a run's stdin text rides to the shell that pipes it in ({@link runLive}). */
const INPUT_VARIABLE = "CAWCO_RUN_INPUT";

/** A stream read to its end, `heard` told of each chunk and `line` of each line as they come, kept whole or as its tail. */
const readHeard = async (
  stream: ReadableStream<Uint8Array>,
  heard: () => void,
  keep: "whole" | "tail",
  line: ((text: string) => void) | undefined
): Promise<string> => {
  const decoder = new TextDecoder();
  let kept = "";
  let partial = "";
  const take = (text: string): void => {
    kept = keep === "tail" ? lastOutput(kept + text) : kept + text;
    if (!line) {
      return;
    }
    const lines = (partial + text).split("\n");
    partial = lastOutput(lines.pop() ?? "");
    for (const one of lines) {
      line(one);
    }
  };
  for await (const chunk of stream) {
    heard();
    take(decoder.decode(chunk, { stream: true }));
  }
  take(decoder.decode());
  if (line && partial) {
    line(partial);
  }
  return kept;
};

/**
 * Runs `argv` as its process group's leader with `env` (and `cwd`), both
 * output streams read, for as long as it lives (bounded.ts
 * `readWhileLive`): alive at each chunk it writes and, each `BEAT_MS`,
 * when its group or a process it started has spent CPU time. Quiet for `QUIET_MS`, it answers
 * `unanswered`; let go by `signal`, the abort is thrown on. Either way its
 * whole group is ended (SIGTERM, then SIGKILL {@link KILL_AFTER_MS} later)
 * and gone before the answer: nothing it started runs on past it.
 *
 * `input` is what it reads on stdin (none, it reads nothing); `keep`
 * "tail" keeps the last `OUTPUT_TAIL_KEPT` characters of each stream,
 * "whole" (the default) all of it; `line` hears each line of either stream
 * as it comes.
 */
export const runLive = async (
  argv: readonly string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    input?: string;
    keep?: "whole" | "tail";
    line?: (text: string) => void;
    signal?: AbortSignal;
  }
): Promise<Bounded<Ran>> => {
  const { input, keep = "whole", line } = options;
  // Ends once the group's run has settled, however it ended; none ran yet.
  let gone: Fiber.Fiber<unknown> = Effect.runFork(Effect.void);
  const read = (signal: AbortSignal, alive: () => void): Promise<Ran> => {
    // The tether holds stdin, so text for it is piped in by a shell of the
    // group's own, from a variable the command it runs does not see.
    const fed =
      input === undefined
        ? argv
        : [
            systemProgram("sh"),
            "-c",
            `printf '%s' "$${INPUT_VARIABLE}" | { unset ${INPUT_VARIABLE}; exec "$@"; }`,
            "sh",
            ...argv,
          ];
    const child = spawnTethered(fed, {
      env:
        input === undefined
          ? options.env
          : { ...options.env, [INPUT_VARIABLE]: input },
      ...(options.cwd ? { cwd: options.cwd } : {}),
      stdout: "pipe",
      stderr: "pipe",
    });
    const leader = spawnedPid(child);
    const watching = new AbortController();
    if (leader) {
      watchTreeCpu(leader, alive, watching.signal);
    }
    const end = (): void => {
      if (leader) {
        endWholeGroup(leader);
      }
      untether(child.stdin);
    };
    const work = Promise.all([
      readHeard(child.stdout, alive, keep, line),
      readHeard(child.stderr, alive, keep, line),
      child.exited,
    ]).finally(() => {
      watching.abort();
      signal.removeEventListener("abort", end);
      untether(child.stdin);
      if (leader) {
        liveGroups.delete(leader);
      }
    });
    // The run's settling, waited on and never failing: its outcome is the caller's.
    const settled = Effect.runFork(Effect.exit(Effect.promise(() => work)));
    gone = settled;
    if (leader) {
      liveGroups.set(leader, { end, gone: settled });
    }
    if (signal.aborted) {
      end();
    } else {
      signal.addEventListener("abort", end, { once: true });
    }
    return work.then(([stdout, stderr, code]) => {
      // Ended by the caller's let-go: its abort, not what the group said as
      // it was killed (readWhileLive throws it on; a quiet spell's is its own).
      signal.throwIfAborted();
      return { code, signalCode: child.signalCode, stdout, stderr };
    });
  };
  try {
    const ran = await readWhileLive(
      read,
      options.signal ? { signal: options.signal } : {}
    );
    if (ran.kind === "unanswered") {
      await awaitGone(gone);
    }
    return ran;
  } catch (error) {
    await awaitGone(gone);
    throw error;
  }
};

/**
 * Ends every group this process leads that still runs, and waits until
 * each has gone: what a `cawco binary-pins` asked to end does before it
 * exits (cli.ts), so the installs it started end with it, not after it.
 */
export const endEveryGroup = async (): Promise<void> => {
  const running = [...liveGroups.values()];
  for (const group of running) {
    group.end();
  }
  await Promise.all(running.map((group) => awaitGone(group.gone)));
};
