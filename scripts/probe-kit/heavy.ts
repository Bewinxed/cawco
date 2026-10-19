/**
 * Heavy runs a spec starts on the machine's gate (core heavy-run.ts), each
 * a real `bash` that takes a slot through scripts/lib/heavy-run.sh, as a
 * leaf's run or, with `gate`, as a landing gate's step (`CAWCO_HEAVY_GATE`).
 * It prints `TOOK <name> <ns>` once it holds the slot, then holds it while
 * its hold file is there. Its process group is its own, so a spec stops it
 * the runner's way (core signal.ts `signalGroup`).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { HEAVY_GATE_ENV } from "../../packages/core/src/harness";
import { HEAVY_RUN_HELD_ENV } from "../../packages/core/src/heavy-run";
import { type Pid, spawnedPid } from "../../packages/core/src/signal";

/** This checkout, whose scripts/lib/heavy-run.sh the runs source. */
const REPO = join(import.meta.dir, "..", "..");

/** The line a heavy run prints once it holds its slot. */
export const TOOK = /^TOOK (\S+) (\d+)$/m;

/** What a heavy run started by {@link startHeavy} has said, and how to end it. */
export interface HeavyProbe {
  exited: Promise<number>;
  /** Its process group's leader. */
  group: Pid;
  /** Lets its slot go: its hold file removed. */
  release: () => void;
  /** Everything it wrote on stderr so far: the gate's `CAWCO-QUEUE` lines. */
  said: () => string;
  /** When it took its slot (`date +%s%N`), once it has. */
  took: () => bigint | undefined;
}

/**
 * Starts heavy run `name` in `dir` (its output and hold file live there)
 * with `env`, which names the slots' home (`HOME`, so the workspaces' cache)
 * and the ceiling; `gate`, the words of the landing gate it is a step of.
 * `hold`: it keeps its slot until {@link HeavyProbe.release}; otherwise it
 * lets it go as soon as it took it.
 */
export const startHeavy = (
  dir: string,
  env: Record<string, string | undefined>,
  name: string,
  options: { gate?: string; hold?: boolean } = {}
): HeavyProbe => {
  const holdFile = join(dir, `${name}.hold`);
  const out = join(dir, `${name}.out`);
  const err = join(dir, `${name}.err`);
  if (options.hold) {
    writeFileSync(holdFile, "");
  }
  writeFileSync(out, "");
  writeFileSync(err, "");
  const runEnv: Record<string, string | undefined> = { ...env };
  delete runEnv[HEAVY_RUN_HELD_ENV];
  delete runEnv[HEAVY_GATE_ENV];
  if (options.gate) {
    runEnv[HEAVY_GATE_ENV] = options.gate;
  }
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      'source "$1/scripts/lib/heavy-run.sh" && heavy_run "probe heavy run $2" && printf "TOOK %s %s\\n" "$2" "$(date +%s%N)" && while [ -e "$3" ]; do sleep 0.1; done',
      "heavy-probe",
      REPO,
      name,
      holdFile,
    ],
    {
      env: runEnv,
      stdin: "ignore",
      stdout: Bun.file(out),
      stderr: Bun.file(err),
      // A group of its own, which a spec signals as the runner does.
      detached: true,
    }
  );
  const group = spawnedPid(child);
  if (group === undefined) {
    throw new Error(`heavy run ${name} did not start`);
  }
  return {
    group,
    release: () => rmSync(holdFile, { force: true }),
    said: () => (existsSync(err) ? readFileSync(err, "utf8") : ""),
    took: () => {
      const found = TOOK.exec(readFileSync(out, "utf8"));
      return found?.[2] ? BigInt(found[2]) : undefined;
    },
    exited: child.exited,
  };
};

/** The landing gates' tickets in a slots dir (core heavy-run.ts `gate-<arrival>-<pid>`). */
export const ticketsIn = (slots: string): string[] =>
  existsSync(slots)
    ? readdirSync(slots).filter((name) => name.startsWith("gate-"))
    : [];
