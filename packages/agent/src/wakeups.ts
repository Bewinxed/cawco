import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { sessionWakeupsDir } from "@cawco/core/paths";
import {
  DamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import { z } from "zod";

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
const WakeupsSchema = z.object({
  all: z.int().nonnegative(),
  once: z.int().nonnegative(),
});
export type Wakeups = z.infer<typeof WakeupsSchema>;

const fileOf = (instanceId: string): string =>
  join(sessionWakeupsDir(), instanceId);

/** Keeps `wakeups` for `instanceId`'s process. */
export const keepWakeups = async (
  instanceId: string,
  wakeups: Wakeups
): Promise<void> => {
  await mkdir(sessionWakeupsDir(), { recursive: true });
  await writeStateFile(fileOf(instanceId), JSON.stringify(wakeups));
};

/**
 * The wake-ups kept for `instanceId`'s process; undefined when none were. A
 * record that is there and is not two counts is a {@link DamagedRecord}.
 */
export const keptWakeups = async (
  instanceId: string
): Promise<Wakeups | undefined> => {
  const file = fileOf(instanceId);
  return await readRecord(file, WakeupsSchema);
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
