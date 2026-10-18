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
 */
import { constants } from "node:os";
import { hostEnvironment } from "./session-env";

/** One loaded job, as its row in `launchctl list` states it. */
export interface LaunchdJob {
  /**
   * Its last exit status: negative, the signal that stopped it. `0` is both a
   * job that never ran and one that exited 0; the column does not tell them apart.
   */
  readonly lastExit: number;
  /** Its process while one runs. */
  readonly pid?: number;
}

/** Every job loaded in this user's launchd domain, by label. Throws launchctl's own words when it fails. */
export async function launchdJobs(): Promise<Map<string, LaunchdJob>> {
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
  const jobs = new Map<string, LaunchdJob>();
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

/** The job `label` as launchd states it; undefined when launchd has no such job loaded. */
export async function launchdJob(
  label: string
): Promise<LaunchdJob | undefined> {
  const jobs = await launchdJobs();
  return jobs.has(label) ? jobs.get(label) : undefined;
}

/**
 * How a job with no process last ended, in words, when its status says it
 * failed: a nonzero code, or the signal that stopped it. Undefined for a job
 * that runs, or whose status is `0`.
 */
export const launchdEnded = (job: LaunchdJob): string | undefined => {
  if (job.pid !== undefined || job.lastExit === 0) {
    return;
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
