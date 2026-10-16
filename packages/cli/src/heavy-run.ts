/**
 * `cawco heavy-run <command>`: runs `command` under `/bin/sh -c` as one of
 * the machine's heavy runs (core heavy-run.ts). It starts only while a slot
 * is free and the machine has room, measured now, and holds the slot until
 * the command has ended; the command and everything it starts take none of
 * their own (`CAWCO_HEAVY_RUN_HELD`). While it waits it says what holds it
 * on stderr, in the queue marker's words, so a caller that reads that marker
 * shows it and stands its clock.
 *
 * Stopped the runner's way (TERM to its process group, then KILL), it ends
 * at once while it waits; once the command runs, it stays until the command
 * has ended, so the slot is held as long as any of the run is.
 */
import { spawn } from "node:child_process";
import { constants } from "node:os";
import {
  HEAVY_RUN_HELD_ENV,
  heavyWhere,
  releaseHeavySlot,
  takeHeavySlot,
} from "@cawco/core/heavy-run";

/** The shell's exit code for a child ended by `signal`, as sh reports it. */
const signalled = (signal: NodeJS.Signals | null): number =>
  128 + (signal ? (constants.signals[signal] ?? 0) : 0);

export async function heavyRun(command: string): Promise<number> {
  const taken = process.env[HEAVY_RUN_HELD_ENV]
    ? undefined
    : await takeHeavySlot({
        pid: process.pid,
        where: heavyWhere(),
        command,
      });
  const child = spawn("/bin/sh", ["-c", command], {
    stdio: "inherit",
    env: { ...process.env, [HEAVY_RUN_HELD_ENV]: "1" },
  });
  // The command hears its group's signals itself; this holder outlasts it.
  for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
    process.on(signal, () => undefined);
  }
  const code = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      process.stderr.write(
        `cawco heavy-run: /bin/sh did not start: ${error.message}\n`
      );
      resolve(127);
    });
    child.on("close", (exit, signal) => resolve(exit ?? signalled(signal)));
  });
  if (taken) {
    releaseHeavySlot(taken.fd);
  }
  return code;
}
