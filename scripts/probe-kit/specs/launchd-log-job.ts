/**
 * A CawCo launchd job's log under launchd itself: capped as it runs, and
 * gone with the job. Host only: a workspace reaches no service manager
 * (`launchctl list`: "Operation not permitted").
 *
 * In a scratch HOME (so its plist, start record and log are the scratch
 * HOME's, none of the person's), a keeper job `dev.cawco.sessiond-logprobe-
 * <pid>` is written as cli service.ts writes one (`launchdProgram`, its
 * `StandardOutPath` and `StandardErrorPath` core launchd.ts `launchdLog`)
 * and bootstrapped into this user's GUI domain. It appends numbered lines
 * past the 10 MB cap; then:
 *
 * - `capLaunchdLogs` copies the log to `.1` and cuts it, and the job writes
 *   on at the new end (launchd opened it `O_APPEND`);
 * - the keeper's own removal path (agent keeper-jobs.ts `keeperJob(…).remove`)
 *   boots it out, and its log and `.1` are gone.
 *
 * Cleanup boots out the probe's label by name, whatever happened.
 *
 *   bun scripts/probe-kit/run.ts launchd-log-job
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { keeperJob } from "../../../packages/agent/src/keeper-jobs";
import { keeperService } from "../../../packages/core/src/keepers";
import {
  capLaunchdLogs,
  forgetLaunchdStart,
  launchdJobs,
  launchdLog,
  launchdLogsDir,
  launchdProgram,
} from "../../../packages/core/src/launchd";
import { type Kit, OWN_HOME_ENV, type Spec } from "../kit";
import { checkRotation, pastCap, WRITER } from "../log-writer";

const xml = (value: string): string =>
  value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const spec: Spec = {
  group: "The hub and machines",
  name: "launchd-log-job",
  host: "it bootstraps a launchd job into this user's GUI domain, which a workspace cannot reach",
  ownHome: "the job's plist, start record and log live under a HOME of its own",
  run: async (kit: Kit) => {
    const keeper = {
      kind: "build",
      version: `logprobe-${process.pid}`,
    } as const;
    const service = keeperService(keeper);
    const label = `dev.cawco.${service}`;
    const domain = `gui/${process.getuid?.()}`;
    const agents = join(homedir(), "Library", "LaunchAgents");
    const plist = join(agents, `${label}.plist`);
    const log = launchdLog(service);
    kit.check(
      "the job's log is the scratch HOME's",
      log.startsWith(process.env[OWN_HOME_ENV] ?? "\0"),
      log
    );
    await mkdir(agents, { recursive: true });
    await mkdir(launchdLogsDir(), { recursive: true });
    await writeFile(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${launchdProgram(label, WRITER)
  .map((argument) => `    <string>${xml(argument)}</string>`)
  .join("\n")}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xml(log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(log)}</string>
</dict>
</plist>
`
    );
    try {
      const loaded = Bun.spawnSync(["launchctl", "bootstrap", domain, plist]);
      if (
        !kit.check(
          `launchctl bootstrap ${domain} ${label}`,
          loaded.exitCode === 0,
          loaded.stderr.toString().trim()
        )
      ) {
        return;
      }
      const pid = (await launchdJobs()).get(label)?.pid;
      const size = await pastCap(log);
      console.log(`  ${log}: ${size} bytes, job pid ${pid}`);
      const rotated = await capLaunchdLogs(launchdLogsDir());
      await checkRotation(kit, log, rotated);
      const still = (await launchdJobs()).get(label)?.pid;
      kit.check(
        "the job is the same process, still running under launchd",
        still !== undefined && still === pid,
        `pid ${pid} → ${still}`
      );

      const job = keeperJob(keeper);
      if (
        !kit.check(
          "the keeper's job is launchd's on this Mac",
          job !== undefined
        )
      ) {
        return;
      }
      await job?.remove({ children: [] });
      const gone = [log, `${log}.1`, plist];
      const left = (
        await Promise.all(
          gone.map(async (path) =>
            (await Bun.file(path).exists()) ? [path] : []
          )
        )
      ).flat();
      kit.check(
        "its removal took its log, its .1 and its plist with it",
        left.length === 0,
        left.join(", ") || "none left"
      );
      kit.check(
        "launchd no longer has the job",
        !(await launchdJobs()).has(label)
      );
    } finally {
      Bun.spawnSync(["launchctl", "bootout", `${domain}/${label}`]);
      await forgetLaunchdStart(label);
    }
  },
};

export default spec;
