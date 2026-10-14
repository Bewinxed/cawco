import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cawcoDataDir } from "@cawco/core/paths";

/**
 * The wake-ups a Claude session has scheduled for itself, as its last turn
 * ended (its `Stop` hook's `session_crons`): `all` of them, and the `once`
 * among them that fire a single time (`recurring: false`). A resume brings
 * back the recurring ones and not every one-shot: "When you resume a session
 * with `claude --resume` or `claude --continue`, Claude Code restores the
 * tasks scheduled with CronCreate, except recurring tasks that have expired
 * and one-shot tasks whose scheduled time has passed. A self-paced `/loop`
 * isn't restored" (code.claude.com/docs/en/scheduled-tasks), and a
 * self-paced wake-up (`ScheduleWakeup`) is a one-shot that the list can't
 * tell apart from CronCreate's.
 */
export interface Wakeups {
  all: number;
  once: number;
}

/**
 * Each live Claude session's scheduled wake-ups as its last turn ended, kept
 * on disk for as long as its process runs: an agent that attaches to the
 * process after a restart reads them here when the keeper's ring no longer
 * holds that turn's end, so a session at rest is still known to be at rest,
 * and sleeps or moves like any other.
 */
const dir = (): string => join(cawcoDataDir(), "session-wakeups");

const fileOf = (instanceId: string): string => join(dir(), instanceId);

/** Keeps `wakeups` for `instanceId`'s process. */
export const keepWakeups = async (
  instanceId: string,
  wakeups: Wakeups
): Promise<void> => {
  await mkdir(dir(), { recursive: true });
  await writeFile(fileOf(instanceId), JSON.stringify(wakeups));
};

const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0;

/** The wake-ups kept for `instanceId`'s process; undefined when none were. */
export const keptWakeups = async (
  instanceId: string
): Promise<Wakeups | undefined> => {
  try {
    const kept = JSON.parse(await readFile(fileOf(instanceId), "utf8")) as {
      all?: unknown;
      once?: unknown;
    };
    return isCount(kept.all) && isCount(kept.once)
      ? { all: kept.all, once: kept.once }
      : undefined;
  } catch {
    return undefined;
  }
};

/** Its process ended: what was kept for it goes (a new one schedules its own). */
export const forgetWakeups = (instanceId: string): Promise<void> =>
  rm(fileOf(instanceId), { force: true });

/** When `file` was last written, epoch ms; undefined when it is not there. */
export const writtenAt = async (file: string): Promise<number | undefined> => {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return undefined;
  }
};
