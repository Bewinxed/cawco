/**
 * The agent's care of CawCo's launchd logs on macOS (core launchd.ts), in a
 * scratch HOME's `Library/Logs`, with no launchd: what runs anywhere.
 *
 * - The start-up sweep (`sweepLaunchdLogs`): a retired keeper's
 *   `cawco-sessiond-<old>.log` and its `.1`, and a hub log on a machine
 *   with no hub plist, go; the agent's log, whose plist is there, stays; a
 *   file that is not CawCo's beside them stays.
 * - The cap (`capLaunchdLogs`): a writer appending through a shell's `>>`
 *   (the open launchd makes, `O_WRONLY|O_CREAT|O_APPEND`) past 10 MB; its
 *   log copied to `.1` and cut, and the writer on at the new end.
 *
 * The same rotation under launchd itself, and a job's log going with the
 * job, is `launchd-log-job` (host).
 *
 *   bun scripts/probe-kit/run.ts launchd-log-care
 */
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  capLaunchdLogs,
  cawcoLaunchdServices,
  launchdLog,
  launchdLogsDir,
  sweepLaunchdLogs,
} from "../../../packages/core/src/launchd";
import { type Kit, OWN_HOME_ENV, type Spec } from "../kit";
import { checkRotation, pastCap, WRITER } from "../log-writer";

const spec: Spec = {
  name: "launchd-log-care",
  ownHome: "it writes CawCo's logs and plists under a HOME of its own",
  run: async (kit: Kit) => {
    const logs = launchdLogsDir();
    const agents = join(homedir(), "Library", "LaunchAgents");
    await mkdir(logs, { recursive: true });
    await mkdir(agents, { recursive: true });
    kit.check(
      "the logs folder is the scratch HOME's",
      logs.startsWith(process.env[OWN_HOME_ENV] ?? "\0"),
      logs
    );

    // The sweep.
    await writeFile(join(agents, "dev.cawco.agent.plist"), "<plist/>");
    const files = [
      "cawco-agent.log",
      "cawco-sessiond-0.1.11-nightly.2442.log",
      "cawco-sessiond-0.1.11-nightly.2442.log.1",
      "cawco-hub.log",
      "other.log",
      "cawco-notes.txt",
      "com.example.thing.log",
    ];
    await Promise.all(
      files.map((name) => writeFile(join(logs, name), `${name}\n`))
    );
    console.log(`  before: ${(await readdir(logs)).sort().join(", ")}`);
    // No launchd here: the loaded jobs are none, the plists are the scratch HOME's.
    const swept = await sweepLaunchdLogs(
      () => cawcoLaunchdServices(agents, async () => new Map()),
      logs
    );
    const left = (await readdir(logs)).sort();
    console.log(`  swept:  ${swept.sort().join(", ")}`);
    console.log(`  after:  ${left.join(", ")}`);
    kit.check(
      "the stray keeper's log and its .1, and the hub's, are gone",
      [
        "cawco-hub.log",
        "cawco-sessiond-0.1.11-nightly.2442.log",
        "cawco-sessiond-0.1.11-nightly.2442.log.1",
      ].every((name) => !left.includes(name)),
      left.join(", ")
    );
    kit.check(
      "the live agent's log and every file that is not CawCo's stay",
      [
        "cawco-agent.log",
        "other.log",
        "cawco-notes.txt",
        "com.example.thing.log",
      ].every((name) => left.includes(name)),
      left.join(", ")
    );

    // The cap.
    const log = launchdLog("agent");
    const writer = Bun.spawn([
      "/bin/sh",
      "-c",
      'exec "$@" >> "$0" 2>&1',
      log,
      ...WRITER,
    ]);
    try {
      const size = await pastCap(log);
      console.log(`  ${log}: ${size} bytes, writer pid ${writer.pid}`);
      const rotated = await capLaunchdLogs(logs);
      await checkRotation(kit, log, rotated);
      kit.check(
        "the writer is the same process, still running",
        writer.exitCode === null,
        `pid ${writer.pid}`
      );
      const again = await capLaunchdLogs(logs);
      kit.check(
        "a log under its cap is left alone",
        again.length === 0,
        again.join(", ")
      );
    } finally {
      writer.kill();
      await writer.exited;
    }
  },
};

export default spec;
