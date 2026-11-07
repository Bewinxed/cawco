/**
 * THE PLATFORM'S HOLD ON IDLE SLEEP, as a child tied to one process's life:
 * the one primitive the agent's live-work hold (awake.ts) and an update's
 * trial (cli binary-apply.ts, the helper that decides it) take. Its argv and
 * the sources for each platform's rule are awake.ts's header.
 */
import { spawn } from "node:child_process";
import { type Pid, signalGroup, spawnedPid } from "@cawco/core/signal";
import { findProgram } from "@cawco/core/workspace-needs";
import { resolveBin, toolEnv } from "./tools";

/** The most of the work's words logind's listing carries; the log line has them whole. */
const WHY_MAX = 200;

/** The argv that holds idle sleep off while `why` runs, for as long as `pid` lives, or why this machine has none. */
export const holdCommand = (
  why: string,
  pid: number
): string[] | { none: string } => {
  if (process.platform === "darwin") {
    const caffeinate = findProgram("caffeinate");
    return caffeinate
      ? [caffeinate, "-i", "-w", String(pid)]
      : { none: "caffeinate is not on CawCo's PATH" };
  }
  if (process.platform === "linux") {
    const inhibit = resolveBin("systemd-inhibit");
    const tail = resolveBin("tail");
    if (!(inhibit && tail)) {
      return {
        none: `${inhibit ? "tail" : "systemd-inhibit"} is not on this agent's PATH`,
      };
    }
    const plasma = resolveBin("kde-inhibit");
    return [
      inhibit,
      "--what=idle:sleep",
      "--mode=block-weak",
      "--who=CawCo",
      `--why=${why.length > WHY_MAX ? `${why.slice(0, WHY_MAX - 1)}…` : why}`,
      ...(plasma ? [plasma, "--power"] : []),
      tail,
      `--pid=${pid}`,
      "-f",
      "/dev/null",
    ];
  }
  return { none: `${process.platform} has neither caffeinate nor logind` };
};

/** Ends a hold's whole process group. */
export const endGroup = (leader: Pid): void => {
  try {
    signalGroup(leader, "SIGTERM");
  } catch (error) {
    console.warn(
      `[awake] the hold ${leader} could not be ended: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * Holds idle sleep off for this process while `why` runs: the release, or
 * nothing to release when the machine has no hold (said through `say`). The
 * hold goes with this process however it ends.
 */
export const holdAwake = async (
  why: string,
  say: (line: string) => Promise<void>
): Promise<() => void> => {
  const argv = holdCommand(why, process.pid);
  if (!Array.isArray(argv)) {
    await say(`this computer is not kept awake through ${why}: ${argv.none}`);
    return () => undefined;
  }
  const [file = "", ...args] = argv;
  const child = spawn(file, args, {
    detached: true,
    env: toolEnv(),
    stdio: "ignore",
  });
  const refused = new Promise<string | undefined>((resolve) => {
    child.once("error", (failure) => resolve(failure.message));
    child.once("spawn", () => resolve(undefined));
  });
  const error = await refused;
  const leader = spawnedPid(child);
  if (error || !leader) {
    await say(
      `this computer is not kept awake through ${why}: ${file} could not start${error ? ` (${error})` : ""}`
    );
    return () => undefined;
  }
  child.unref();
  await say(`keeping this computer awake through ${why}`);
  return () => endGroup(leader);
};
