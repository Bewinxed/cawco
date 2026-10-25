/**
 * Checks run at once, each in its own process, each with a time limit: what
 * `bun run check` (check.ts) is made of. What each printed comes out whole
 * when it ends, and the run fails when any one failed, timed out, or could
 * not start. A check with `after` starts only once the check it names has
 * ended, whatever its verdict. A check with `stamp` adds to it when it
 * passes: the key of the inputs it passed on, which check.ts reads to skip
 * it on inputs it passed on (the last few kept).
 */
import {
  type Pid,
  signalGroup,
  spawnedPid,
} from "../../packages/core/src/signal";

/** Past this a check is stopped and fails; the slowest takes about 15 s on a loaded machine. */
const TIMEOUT_MS = 240_000;
/** Grace between asking a timed-out check to stop and killing it. */
const KILL_GRACE_MS = 5000;

export interface Check {
  /** A check, earlier in the list, that ends before this one starts. */
  after?: string;
  argv: string[];
  dir: string;
  /** Environment over this process's. */
  env?: Record<string, string>;
  name: string;
  /** Written when the check passes: `key` into `file`. */
  stamp?: { file: string; key: string };
}

interface Outcome {
  check: Check;
  ok: boolean;
  output: string;
  seconds: number;
  why: string;
}

/**
 * Each check runs as its own process group (`detached`: `setsid()`), so a stop
 * reaches everything it started: `bun run` hands the work to a shell and its
 * children, which hold the output pipes open past their parent's end.
 */
const groups = new Set<Pid>();

const run = async (check: Check): Promise<Outcome> => {
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  let child: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    child = Bun.spawn(check.argv, {
      cwd: check.dir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
      env: check.env ? { ...process.env, ...check.env } : undefined,
    });
  } catch (error) {
    return {
      check,
      ok: false,
      why: `did not start: ${error instanceof Error ? error.message : String(error)}`,
      seconds: seconds(),
      output: "",
    };
  }
  const pid = spawnedPid(child);
  if (pid === undefined) {
    return {
      check,
      ok: false,
      why: "did not start: its spawn made no process",
      seconds: seconds(),
      output: "",
    };
  }
  groups.add(pid);
  let timedOut = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    signalGroup(pid, "SIGTERM");
    grace = setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS);
  }, TIMEOUT_MS);
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  clearTimeout(grace);
  // Whatever the check left running goes with it.
  signalGroup(pid, "SIGKILL");
  groups.delete(pid);
  let why = "ok";
  if (timedOut) {
    why = `timed out after ${TIMEOUT_MS / 1000}s`;
  } else if (code !== 0) {
    why = `exit ${code}`;
  }
  if (why === "ok" && check.stamp) {
    await keepPass(check.stamp.file, check.stamp.key);
  }
  return {
    check,
    ok: why === "ok",
    why,
    seconds: seconds(),
    output: `${out}${err}`.trim(),
  };
};

/** How many passes a stamp keeps: a change undone finds the pass before it. */
const PASSES_KEPT = 16;

/** Adds `key` to the passes `file` keeps, newest last. */
const keepPass = async (file: string, key: string): Promise<void> => {
  const stamp = Bun.file(file);
  const kept = (await stamp.exists())
    ? (await stamp.text()).split("\n").filter((line) => line && line !== key)
    : [];
  await Bun.write(file, [...kept, key].slice(-PASSES_KEPT).join("\n"));
};

const report = (outcome: Outcome): void => {
  const status = outcome.ok ? "ok" : `FAILED: ${outcome.why}`;
  console.log(
    `── ${outcome.check.name} · ${outcome.seconds.toFixed(1)}s · ${status}`
  );
  if (outcome.output) {
    console.log(outcome.output);
  }
};

/**
 * Runs `checks`, at most `atOnce` at a time in the order given, and exits:
 * 0 when every one passed, 1 when any did not. `what` names the run in its
 * last line.
 */
export const runChecks = async (
  what: string,
  checks: Check[],
  atOnce: number,
  /** Printed after the verdict line's count. */
  tail = ""
): Promise<never> => {
  // Out of the terminal's process group, a check no longer hears Ctrl-C itself.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      for (const pid of groups) {
        signalGroup(pid, "SIGKILL");
      }
      process.exit(130);
    });
  }
  const started = performance.now();
  const ended = new Map<string, Promise<Outcome>>();
  const outcomes: Outcome[] = [];
  let slots = atOnce;
  const waiting: (() => void)[] = [];
  const slot = async (): Promise<void> => {
    if (slots > 0) {
      slots -= 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
  };
  const free = (): void => {
    const next = waiting.shift();
    if (next) {
      next();
    } else {
      slots += 1;
    }
  };
  for (const check of checks) {
    const before = check.after ? ended.get(check.after) : undefined;
    if (check.after && !before) {
      throw new Error(
        `${check.name} runs after ${check.after}, no check before it`
      );
    }
    ended.set(
      check.name,
      (async () => {
        await before;
        await slot();
        try {
          const outcome = await run(check);
          outcomes.push(outcome);
          report(outcome);
          return outcome;
        } finally {
          free();
        }
      })()
    );
  }
  await Promise.all(ended.values());

  const failed = outcomes.filter((outcome) => !outcome.ok);
  const wall = ((performance.now() - started) / 1000).toFixed(1);
  if (failed.length > 0) {
    console.error(
      `${what}: ${failed.length} of ${checks.length} checks failed in ${wall}s: ${failed.map((outcome) => outcome.check.name).join(", ")}`
    );
    process.exit(1);
  }
  console.log(`${what}: ${checks.length} checks passed in ${wall}s${tail}`);
  process.exit(0);
};
