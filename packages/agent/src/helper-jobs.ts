/**
 * The update helper's jobs (`cawco binary-apply`) under the machine's service
 * manager, so each outlives the restarts it performs: a transient systemd user
 * unit `cawco-binary-apply-<ms>`, or a launchd job
 * `dev.cawco.binary-apply.<ms>` from a plist in the binary root. A helper's
 * first act is to take `apply.lock` (binary-apply.ts `takeLock`); until it
 * has, it has done nothing, and it is given {@link HELPER_START_MS} to.
 */
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { binaryRoot, helperIsLive } from "@cawco/core/binary-installation";
import { launchdState } from "./keeper-jobs";

/** How long a launched helper has to take its lock; one that holds none after it has gone. */
export const HELPER_START_MS = 10_000;

const PLIST_PREFIX = "dev.cawco.binary-apply.";

/** One helper's job, as the agent launched it. */
export interface HelperJob {
  /** Its launchd label, on macOS. */
  readonly label?: string;
  /** Its name in the service manager, for the state and the log. */
  readonly name: string;
  /** Its transient systemd unit, on Linux. */
  readonly unit?: string;
}

/**
 * The forwarded environment: CawCo's own settings, and the PATH, HOME and XDG
 * directories a one-shot job would otherwise lack. The same set the wrapper's
 * resume path forwards (binary-wrapper.ts `forwarded`): the helper rewrites
 * the keeper's unit (`cawco binary-units`), whose path and text come from
 * XDG_CONFIG_HOME, XDG_DATA_HOME and PATH as the installer saw them.
 */
function helperEnvironment(): [string, string][] {
  return Object.entries(process.env).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined &&
      (entry[0].startsWith("CAWCO_") ||
        entry[0].startsWith("XDG_") ||
        entry[0] === "PATH" ||
        entry[0] === "HOME")
  );
}

/**
 * Starts `argv` (an update helper: a build's executable, by its own folder,
 * then its `binary-apply` arguments) as a one-shot job of the service manager.
 * Throws the service manager's own words when it refuses the job.
 */
export async function launchHelper(
  argv: readonly string[]
): Promise<HelperJob> {
  const forwarded = helperEnvironment();
  if (process.platform === "linux") {
    const unit = `cawco-binary-apply-${Date.now()}`;
    const child = Bun.spawn(
      [
        "systemd-run",
        "--user",
        "--collect",
        `--unit=${unit}`,
        "--property=Type=exec",
        ...forwarded.map(([key, value]) => `--setenv=${key}=${value}`),
        ...argv,
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    if ((await child.exited) !== 0) {
      throw new Error(
        `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
      );
    }
    return { unit, name: `systemd (--user ${unit}.service)` };
  }
  const label = `${PLIST_PREFIX}${Date.now()}`;
  const plist = join(binaryRoot(), `${label}.plist`);
  const text = (value: string) =>
    `<string>${value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</string>`;
  await Bun.write(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key>${text(label)}
<key>ProgramArguments</key><array>${argv.map(text).join("")}</array>
<key>EnvironmentVariables</key><dict>${forwarded.map(([key, value]) => `<key>${key}</key>${text(value)}`).join("")}</dict>
<key>RunAtLoad</key><true/>
</dict></plist>
`
  );
  const child = Bun.spawn(
    ["launchctl", "bootstrap", `gui/${process.getuid?.()}`, plist],
    { stdout: "pipe", stderr: "pipe" }
  );
  if ((await child.exited) !== 0) {
    throw new Error(
      `The update helper could not start: ${(await new Response(child.stderr).text()).trim()}`
    );
  }
  return { label, name: `launchd (gui/${process.getuid?.()}/${label})` };
}

/**
 * What the service manager says of a helper's job that holds no lock: how it
 * ended, that it still runs, or where its own record is. A systemd unit is
 * collected once it ends, so its journal is what says how.
 */
export async function helperJobSays(job: HelperJob): Promise<string> {
  if (job.unit) {
    return `journalctl --user -u ${job.unit} says how it ended`;
  }
  if (!job.label) {
    return "it ended";
  }
  const state = await launchdState(job.label);
  if (state === undefined) {
    return "launchd has no such job loaded";
  }
  if (state.pid !== undefined) {
    return `its process ${state.pid} still runs`;
  }
  return state.ended ?? "launchd never ran it";
}

/**
 * A finished one-shot macOS job and its file are removed on the updater's next
 * pass. The helper restarts the agent itself mid-update, so while any helper
 * holds the lock nothing is removed: booting its job out would kill it
 * half-way. Nor is a job removed that launchd still runs, or that was written
 * less than {@link HELPER_START_MS} ago: a helper launched a moment before
 * holds no lock yet, and a pass that runs right after the one that launched
 * it (Install now's own, after the pass it waited on) would end it before it
 * began.
 */
export async function removeFinishedHelpers(): Promise<void> {
  if (process.platform !== "darwin" || (await helperIsLive())) {
    return;
  }
  const files = (await readdir(binaryRoot())).filter(
    (name) => name.startsWith(PLIST_PREFIX) && name.endsWith(".plist")
  );
  await Promise.all(
    files.map(async (name) => {
      const label = name.slice(0, -".plist".length);
      const path = join(binaryRoot(), name);
      const written = await stat(path).then(
        (found) => found.mtimeMs,
        () => undefined
      );
      if (
        written === undefined ||
        Date.now() - written < HELPER_START_MS ||
        (await launchdState(label))?.pid !== undefined
      ) {
        return;
      }
      await Bun.spawn(
        ["launchctl", "bootout", `gui/${process.getuid?.()}/${label}`],
        { stdout: "ignore", stderr: "ignore" }
      ).exited;
      await rm(path, { force: true });
    })
  );
}
