/**
 * A command that may start others (an installer's download and its
 * script, a launcher's native binary), run to its end within a bound, and
 * never outliving it: the leader of a process group of its own under the
 * tether (core tether.ts `spawnTethered`), so it ends with this process
 * however this process ends, and the whole group is ended when the bound
 * runs out or the caller lets go (core signal.ts `signalGroup`, as
 * awake-hold.ts ends its hold). Ending the leader alone left what it
 * started running, holding its output open: `sh -c "curl … && bash
 * install.sh"` signalled at its pid leaves `bash` and `curl` to finish.
 * An answer is given only once the whole group has gone, so what runs
 * next (an update's put-back) never runs beside it.
 */

import { type Bounded, readWhileHeard, readWithin } from "@cawco/core/bounded";
import { boundedRead } from "@cawco/core/effect/bounded";
import type { Ran } from "@cawco/core/run-captured";
import { type Pid, signalGroup, spawnedPid } from "@cawco/core/signal";
import { spawnTethered, untether } from "@cawco/core/tether";
import { Effect, Fiber } from "effect";
import { runFork, runPromise } from "./daemon-runtime";
import { fromPromise } from "./rejected";

/**
 * How long a group asked to end (SIGTERM) is given before it is killed:
 * an installer's own clean-up, a launcher passing the signal on, a
 * `cawco binary-pins` ending its own installs ({@link endEveryGroup}).
 */
const GROUP_GRACE_MS = 5000;

/** Each group this process leads that still runs, by its leader: what it ends when it is asked to end ({@link endEveryGroup}). */
const liveGroups = new Map<
  Pid,
  { readonly end: () => void; readonly gone: Fiber.Fiber<unknown> }
>();

/** Every process in `leader`'s group ended: asked, then killed `graceMs` later if any of it still runs. Never throws. */
const endWholeGroup = (leader: Pid, graceMs: number): void => {
  const send = (sig: NodeJS.Signals): void => {
    try {
      signalGroup(leader, sig);
    } catch (error) {
      console.warn(
        `[tools] the process group ${leader} could not be sent ${sig}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
  send("SIGTERM");
  setTimeout(() => send("SIGKILL"), graceMs).unref();
};

/** Waits for `gone`, a group's own end, as long as its ending can take: its grace and as long again. */
const awaitGone = (
  gone: Fiber.Fiber<unknown>,
  graceMs: number
): Promise<void> =>
  // The promise edge of the wait (runGroupWithin, endEveryGroup).
  runPromise(
    boundedRead(graceMs * 2, Fiber.await(gone)).pipe(
      Effect.asVoid,
      Effect.catchTag("Unanswered", () => Effect.void)
    )
  );

/**
 * Runs `argv` as its group's leader with `env` (and `cwd`), both output
 * streams read whole, given `ms` of this machine's awake time (core
 * bounded.ts `readWithin`) or until `signal` aborts, as one
 * `readWithin` answers: `unanswered` when the bound ran out, the abort of
 * `signal` thrown on. Either way its whole group is ended, and gone,
 * before the answer: nothing it started runs on past it. `graceMs`: how
 * long it is given between SIGTERM and SIGKILL ({@link GROUP_GRACE_MS}
 * unless said). `quiet`: `ms` counts from the last line it wrote rather
 * than its start (core bounded.ts `readWhileHeard`), for a command made of
 * steps each bounded on its own and said as it begins.
 */
export const runGroupWithin = async (
  argv: readonly string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    graceMs?: number;
    ms: number;
    quiet?: boolean;
    signal?: AbortSignal;
  }
): Promise<Bounded<Ran>> => {
  const graceMs = options.graceMs ?? GROUP_GRACE_MS;
  // Ends once the group's run has settled, however it ended; none ran yet.
  let gone: Fiber.Fiber<unknown> = runFork(Effect.void);
  const read = (signal: AbortSignal, heard?: () => void): Promise<Ran> => {
    const child = spawnTethered(argv, {
      env: options.env,
      ...(options.cwd ? { cwd: options.cwd } : {}),
      stdout: "pipe",
      stderr: "pipe",
    });
    const leader = spawnedPid(child);
    const end = (): void => {
      if (leader) {
        endWholeGroup(leader, graceMs);
      }
      untether(child.stdin);
    };
    const work = Promise.all([
      readLines(child.stdout, heard),
      readLines(child.stderr, heard),
      child.exited,
    ]).finally(() => {
      signal.removeEventListener("abort", end);
      untether(child.stdin);
      if (leader) {
        liveGroups.delete(leader);
      }
    });
    // The run's settling, waited on and never failing: its outcome is the caller's.
    const settled = runFork(Effect.exit(fromPromise(() => work)));
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
      // it was killed (readWithin throws it on; a deadline's is its own).
      signal.throwIfAborted();
      return { code, signalCode: child.signalCode, stdout, stderr };
    });
  };
  try {
    const asked = options.signal ? { signal: options.signal } : {};
    const ran = await (options.quiet
      ? readWhileHeard(options.ms, read, asked)
      : readWithin(options.ms, (signal) => read(signal), asked));
    if (ran.kind === "unanswered") {
      await awaitGone(gone, graceMs);
    }
    return ran;
  } catch (error) {
    await awaitGone(gone, graceMs);
    throw error;
  }
};

/**
 * Ends every group this process leads that still runs, and waits until
 * each has gone or its grace has run out twice: what a `cawco binary-pins`
 * asked to end does before it exits (cli.ts), so the installs it started
 * end with it, not after it.
 */
export const endEveryGroup = async (): Promise<void> => {
  const running = [...liveGroups.values()];
  for (const group of running) {
    group.end();
  }
  await Promise.all(
    running.map((group) => awaitGone(group.gone, GROUP_GRACE_MS))
  );
};

/** A stream read whole, `onLine` told of each line as it comes when one is given. */
const readLines = async (
  stream: ReadableStream<Uint8Array>,
  onLine: ((line: string) => void) | undefined
): Promise<string> => {
  if (!onLine) {
    return await new Response(stream).text();
  }
  const decoder = new TextDecoder();
  let whole = "";
  let partial = "";
  for await (const chunk of stream) {
    const text = decoder.decode(chunk, { stream: true });
    whole += text;
    const lines = (partial + text).split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines) {
      onLine(line);
    }
  }
  const rest = decoder.decode();
  whole += rest;
  if (partial + rest) {
    onLine(partial + rest);
  }
  return whole;
};
