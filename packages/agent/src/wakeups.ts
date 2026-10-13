import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cawcoDataDir } from "@cawco/core/paths";

/**
 * Each live Claude session's scheduled wake-ups as its last turn ended (its
 * `Stop` hook's `session_crons`), kept on disk for as long as its process
 * runs: an agent that attaches to the process after a restart reads them
 * here when the keeper's ring no longer holds that turn's end, so a session
 * at rest is still known to be at rest, and sleeps or moves like any other.
 */
const dir = (): string => join(cawcoDataDir(), "session-wakeups");

const fileOf = (instanceId: string): string => join(dir(), instanceId);

/** Keeps `count` for `instanceId`'s process. */
export const keepWakeups = async (
  instanceId: string,
  count: number
): Promise<void> => {
  await mkdir(dir(), { recursive: true });
  await writeFile(fileOf(instanceId), String(count));
};

/** The wake-ups kept for `instanceId`'s process; undefined when none were. */
export const keptWakeups = async (
  instanceId: string
): Promise<number | undefined> => {
  try {
    const count = Number(await readFile(fileOf(instanceId), "utf8"));
    return Number.isInteger(count) && count >= 0 ? count : undefined;
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
