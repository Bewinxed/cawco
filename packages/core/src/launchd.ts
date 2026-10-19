/**
 * What launchd states of the jobs in this user's domain, read from the one
 * `launchctl` output it documents a format for: `launchctl list` with no
 * arguments, "all of the jobs loaded into launchd in three columns. The first
 * column displays the PID of the job if it is running. The second column
 * displays the last exit status of the job. If the number in this column is
 * negative, it represents the negative of the signal which stopped the job"
 * (launchctl(1)). Its CAVEATS: the legacy subcommands' output "should match
 * their output on previous OS X releases", while `print`'s "is NOT API in any
 * sense at all", so nothing here reads `print`.
 *
 * The column says `0` both for a job that never ran and for one whose process
 * exited 0, and launchctl(1) documents nothing that tells them apart. So every
 * launchd job CawCo writes starts through {@link launchdProgram}: a shell that
 * writes the job's start record (its pid, the machine's boot, the time) and
 * then execs the job's own command, the same process. A job with no process,
 * status 0 and a start record since the machine booted ran and exited 0; with
 * none it never ran. Whatever bootstraps or starts a job that is not running
 * forgets its record first ({@link forgetLaunchdStart}), so the record is only
 * ever its current run's.
 */
import { rm } from "node:fs/promises";
import { constants, homedir } from "node:os";
import { join } from "node:path";
import { bootId } from "./process-identity";
import { hostEnvironment } from "./session-env";
import { isDamagedRecord, readRecord } from "./state-file";

/** One loaded job, as its row in `launchctl list` states it. */
export interface LaunchdRow {
  /**
   * Its last exit status: negative, the signal that stopped it. `0` is both a
   * job that never ran and one that exited 0; the column does not tell them apart.
   */
  readonly lastExit: number;
  /** Its process while one runs. */
  readonly pid?: number;
}

/** One loaded job: its row, and whether its process ran since it was last started (its start record). */
export interface LaunchdJob extends LaunchdRow {
  readonly ran: boolean;
}

/** A job's start record, as {@link launchdProgram}'s shell writes it. */
interface LaunchdStart {
  bootId?: string;
  pid?: number;
  startedAt?: number;
}

/** Where the job `label`'s start record is. */
export const launchdStartPath = (label: string): string =>
  join(homedir(), ".cawco", "launchd", `${label}.start.json`);

/**
 * The shell every job CawCo writes starts in: its start record written whole
 * (a temporary file, then a rename) beside where {@link launchdStartPath}
 * names it, then `exec` of the job's command, which keeps the shell's pid.
 * A record it cannot write is said on the job's stderr, and the command runs.
 * `$(sysctl -n kern.boottime)` is what {@link bootId} reads on macOS.
 */
const START_SCRIPT = [
  'record="$1"; shift',
  'if mkdir -p "$(dirname "$record")" && printf \'{"pid":%s,"bootId":"%s","startedAt":%s000}\\n\' "$$" "$(sysctl -n kern.boottime)" "$(date +%s)" > "$record.$$" && mv -f "$record.$$" "$record"; then :; else echo "cawco: no start record at $record" >&2; fi',
  'exec "$@"',
].join("\n");

/**
 * {@link START_SCRIPT} as a plist `<string>` holds it, for the update
 * wrapper's own resume job (binary-wrapper.ts), which writes its plist in
 * shell: its arguments after the script are `cawco-launchd-start`, the
 * record's path and the command, as {@link launchdProgram} gives them.
 */
export const LAUNCHD_START_XML = START_SCRIPT.replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

/** The ProgramArguments of the job `label` that runs `argv`: its start record first, then `argv` itself. */
export const launchdProgram = (
  label: string,
  argv: readonly string[]
): string[] => [
  "/bin/sh",
  "-c",
  START_SCRIPT,
  "cawco-launchd-start",
  launchdStartPath(label),
  ...argv,
];

/** Takes the job's start record away: before it is bootstrapped or started while not running, and with the job. */
export const forgetLaunchdStart = (label: string): Promise<void> =>
  rm(launchdStartPath(label), { force: true });

/** Whether the job's process ran since it was last started: a start record written since the machine booted. */
const ranSinceStart = async (label: string): Promise<boolean> => {
  const record = await readRecord<LaunchdStart>(launchdStartPath(label)).catch(
    (error: unknown): LaunchdStart => {
      // Written whole: a damaged one is a crash's, from a run that began.
      if (isDamagedRecord(error)) {
        return {};
      }
      throw error;
    }
  );
  if (!record) {
    return false;
  }
  return record.bootId === undefined || record.bootId === (await bootId());
};

/** Every job loaded in this user's launchd domain, by label. Throws launchctl's own words when it fails. */
export async function launchdJobs(): Promise<Map<string, LaunchdRow>> {
  const child = Bun.spawn(["launchctl", "list"], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...hostEnvironment(), LC_ALL: "C" },
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `launchctl list exited ${code}: ${stderr.trim() || stdout.trim()}`
    );
  }
  const jobs = new Map<string, LaunchdRow>();
  for (const line of stdout.split("\n")) {
    const [pid, status, label] = line.split("\t");
    // The columns' heading, `PID	Status	Label`, is no job.
    if (!label || pid === "PID") {
      continue;
    }
    const running = Number(pid);
    jobs.set(label.trim(), {
      lastExit: Number(status) || 0,
      ...(Number.isInteger(running) && running > 0 ? { pid: running } : {}),
    });
  }
  return jobs;
}

/** The job `label` as launchd states it, with its start record; undefined when launchd has no such job loaded. */
export async function launchdJob(
  label: string
): Promise<LaunchdJob | undefined> {
  const row = (await launchdJobs()).get(label);
  return row ? { ...row, ran: await ranSinceStart(label) } : undefined;
}

/**
 * How a job with no process last ended, in words: a nonzero code, the signal
 * that stopped it, or code 0 when its start record says it ran. Undefined for
 * a job that runs, or that never ran since it was last started.
 */
export const launchdEnded = (job: LaunchdJob): string | undefined => {
  if (job.pid !== undefined) {
    return;
  }
  if (job.lastExit === 0) {
    return job.ran ? "it exited with code 0" : undefined;
  }
  if (job.lastExit > 0) {
    return `it exited with code ${job.lastExit}`;
  }
  const signal = -job.lastExit;
  const name = Object.entries(constants.signals).find(
    ([, number]) => number === signal
  )?.[0];
  return `it was ended by ${name ?? `signal ${signal}`}`;
};
