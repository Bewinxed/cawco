/**
 * THE MACHINE'S DAMAGED RECORDS: every record this agent found on disk that
 * does not parse ({@link DamagedRecord}), with what it belongs to, said once
 * in the log and on every heartbeat to the hub, which marks the workspace's
 * or session's row with the file and the way out.
 *
 * A record is one workspace's when it is in that workspace's state dir
 * (`~/.cawco/workspaces/<id>/`), one session's when it is that session's
 * wake-ups (`session-wakeups/<instance>`), and the machine's otherwise.
 * Whatever reads it skips it and the rest proceed: the workspace does not
 * start a boundary, a session reads its wake-ups as not known until its next
 * turn ends, and nothing guesses what the record held.
 *
 * An entry stays until its file is gone (the workspace archived, the session
 * ended) or written again (a turn's end keeps its wake-ups afresh, whole,
 * through the one atomic writer): each beat looks at the file once more.
 *
 * {@link sweepRecords} reads every record once as the agent starts, so the
 * damage a crash left shows at once, not at the next spawn; it also removes
 * the temporary files a write the crash cut short left beside them.
 */
import { readdir, rm, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { DamagedRecordReport } from "@cawco/core";
import {
  accountsRoot,
  sessionWakeupsDir,
  workspacesDir,
} from "@cawco/core/paths";
import {
  type DamagedRecord,
  isDamagedRecord,
  isStrayTemporary,
  readRecord,
  readTextRecord,
} from "@cawco/core/state-file";

interface Known extends DamagedRecordReport {
  /** When the file was last written as the damage was found: written since, it is read again. */
  writtenAt: number;
}

const known = new Map<string, Known>();

const inside = (root: string, file: string): string[] | undefined => {
  const rel = relative(root, file);
  return rel.startsWith("..") || rel.startsWith(sep)
    ? undefined
    : rel.split(sep);
};

/** What `file` is a record of: a workspace, a session, or the machine. */
const ownerOf = (
  file: string
): Pick<DamagedRecordReport, "workspaceId" | "instanceId"> => {
  const workspace = inside(workspacesDir(), file);
  if (workspace && workspace.length >= 2 && workspace[0]) {
    return { workspaceId: workspace[0] };
  }
  const session = inside(sessionWakeupsDir(), file);
  if (session?.length === 1 && session[0]) {
    return { instanceId: session[0] };
  }
  return {};
};

const writtenAt = async (file: string): Promise<number | undefined> =>
  (await stat(file).catch(() => undefined))?.mtimeMs;

/**
 * Records `damage`, and says it in the log the first time it is found:
 * the file, why, and what does not run until it is removed.
 */
export const reportDamaged = async (damage: DamagedRecord): Promise<void> => {
  const at = await writtenAt(damage.file);
  if (at === undefined) {
    return;
  }
  const held = known.get(damage.file);
  if (held && held.writtenAt === at && held.reason === damage.reason) {
    return;
  }
  const owner = ownerOf(damage.file);
  known.set(damage.file, {
    file: damage.file,
    reason: damage.reason,
    writtenAt: at,
    ...owner,
  });
  console.warn(
    `[records] ${damage.file} is damaged (${damage.reason}): ${consequence(owner)}`
  );
};

/** What a damaged record of `owner`'s stops, in the log's words. */
const consequence = (
  owner: Pick<DamagedRecordReport, "workspaceId" | "instanceId">
): string => {
  if (owner.workspaceId) {
    return `workspace ${owner.workspaceId} does not run until it is archived`;
  }
  if (owner.instanceId) {
    return `session ${owner.instanceId}'s wake-ups are not known until its next turn ends or it is ended`;
  }
  return "it is skipped";
};

/**
 * Every damaged record still as it was found, for the beat: one whose file
 * is gone, or was written since, is dropped (a reader that finds it damaged
 * again reports it again).
 */
export const damagedRecords = async (): Promise<DamagedRecordReport[]> => {
  const reports: DamagedRecordReport[] = [];
  for (const [file, entry] of known) {
    // biome-ignore lint/performance/noAwaitInLoops: a stat per damaged file, of which there are none or a few
    if ((await writtenAt(file)) !== entry.writtenAt) {
      known.delete(file);
      continue;
    }
    const { writtenAt: _at, ...report } = entry;
    reports.push(report);
  }
  return reports;
};

/** Reads one record; a damaged one is reported, a missing one or one that cannot be read at all is left. */
const check = async (
  file: string,
  read: (file: string) => Promise<unknown>
): Promise<void> => {
  try {
    await read(file);
  } catch (error) {
    if (isDamagedRecord(error)) {
      await reportDamaged(error);
      return;
    }
    console.warn(
      `[records] ${file} could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const namesIn = (dir: string): Promise<string[]> =>
  readdir(dir).catch(() => [] as string[]);

/**
 * Removes what a write cut short left in `dir`, and answers the names of
 * its records: never a dot-name, which is a write still under way or none.
 */
const withoutTemporaries = async (dir: string): Promise<string[]> => {
  const names = await namesIn(dir);
  const stray = names.filter(isStrayTemporary);
  await Promise.all(stray.map((name) => rm(join(dir, name), { force: true })));
  if (stray.length > 0) {
    console.info(
      `[records] removed ${stray.length} unfinished write(s) in ${dir}: ${stray.join(", ")}`
    );
  }
  return names.filter((name) => !name.startsWith("."));
};

/** A workspace's records: what it was cut as, its boundary, its accounts, its policy, and each older boundary still recorded. */
const WORKSPACE_RECORD =
  /^(create|boundary|accounts|policy|retiring-[^/]+)\.json$/;
/** A workspace's text records: the gate an executor waits at. */
const WORKSPACE_TEXT = /^gate$/;

/**
 * Reads every record this agent keeps once, as it starts, and reports each
 * damaged one ({@link reportDamaged}): each workspace's, each session's
 * wake-ups, each account's credential and login marker.
 */
export const sweepRecords = async (): Promise<void> => {
  const checks: Promise<void>[] = [];
  for (const id of await namesIn(workspacesDir())) {
    const dir = join(workspacesDir(), id);
    for (const name of await withoutTemporaries(dir)) {
      if (WORKSPACE_RECORD.test(name)) {
        checks.push(check(join(dir, name), readRecord));
      } else if (WORKSPACE_TEXT.test(name)) {
        checks.push(check(join(dir, name), readTextRecord));
      }
    }
  }
  for (const name of await withoutTemporaries(sessionWakeupsDir())) {
    checks.push(check(join(sessionWakeupsDir(), name), readRecord));
  }
  for (const account of await namesIn(accountsRoot())) {
    const dir = join(accountsRoot(), account);
    for (const name of await withoutTemporaries(dir)) {
      if (name === "credential.json" || name === "login.pid") {
        checks.push(check(join(dir, name), readRecord));
      }
    }
  }
  await Promise.all(checks);
  const found = await damagedRecords();
  console.info(
    found.length === 0
      ? "[records] every record on this machine reads whole"
      : `[records] ${found.length} damaged record(s) on this machine: ${found.map((one) => one.file).join(", ")}`
  );
};
