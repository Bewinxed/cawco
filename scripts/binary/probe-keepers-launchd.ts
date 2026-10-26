/**
 * The keeper handover's macOS half, proved on a Mac against launchd itself,
 * with nothing of the machine's own CawCo touched: a scratch binary root and
 * keeper directory under /tmp, and one launchd job under a scratch label,
 * `dev.cawco.sessiond-0.0.0-probe.2`, from a plist the build writes itself.
 *
 *   bun build scripts/binary/probe-keepers-launchd.ts --target=bun --outfile probe.js
 *   (on the Mac) BUN_BE_BUN=1 ./cawco probe.js /absolute/path/to/cawco
 *
 * where `cawco` is a darwin build of this tree whose version is
 * `0.0.0-probe.2`, signed (`codesign --force --sign -`). A second scratch
 * job, `dev.cawco.sessiond-0.0.0-probe.3`, loaded from a plist in the scratch
 * directory and never run at load, proves a job that never ran from one that
 * ran and exited 0, its program `true` through the keeper's launchd wrapper
 * (launchd states status 0 for both; its start record, as every job CawCo
 * writes has, tells them apart). Each step prints one
 * line ending in PASS or FAIL; the last line counts them. Everything it made
 * is removed at the end, whatever happened.
 */
import { openSync } from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  keeperJob,
  keeperJobsHere,
} from "../../packages/agent/src/keeper-jobs";
import { KeeperPool } from "../../packages/agent/src/keepers";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import { EXECUTABLE_IN_VERSION } from "../../packages/core/src/binary-installation";
import {
  keeperEndpoint,
  keeperEndpoints,
  publishKeeper,
} from "../../packages/core/src/keepers";
import {
  launchdJob,
  launchdProgram,
  launchdStartPath,
} from "../../packages/core/src/launchd";
import { isAlive, listedPid, signal } from "../../packages/core/src/signal";
import { systemProgram } from "../../packages/core/src/workspace-needs";
import { welcomed } from "../lib/keeper-dial";

const VERSION = "0.0.0-probe.2";
const CHECKOUT = "0.0.0-checkout";
const SERVICE = `sessiond-${VERSION}`;
const LABEL = `dev.cawco.${SERVICE}`;
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG = join(homedir(), "Library", "Logs", `cawco-sessiond-${VERSION}.log`);
/** The job that never runs at load, for the never-ran and exited-0 steps. */
const QUIET = "0.0.0-probe.3";
const QUIET_SERVICE = `sessiond-${QUIET}`;
const QUIET_LABEL = `dev.cawco.${QUIET_SERVICE}`;
/** How long the update helper waits for a keeper's welcome (binary-apply.ts `HEALTH_MS`): an exit reads well inside it. */
const HEALTH_MS = 45_000;

const [, , given] = Bun.argv;
if (!given?.startsWith("/") || process.platform !== "darwin") {
  throw new Error(
    "Usage, on macOS: BUN_BE_BUN=1 ./cawco probe.js /absolute/path/to/cawco"
  );
}
const scratch = await Bun.$`mktemp -d /tmp/kp.XXXXXX`
  .text()
  .then((t) => t.trim());
const data = join(scratch, "data");
const root = join(data, "cawco", "binary");
const run = join(scratch, "run");
const machine = join(run, "sessiond.sock");
// Where the build's own `binary-units` names it: inside its bundle (binary-installation.ts).
const binary = join(root, "versions", VERSION, EXECUTABLE_IN_VERSION);
// The probe runs as `BUN_BE_BUN=1 ./cawco`; a `cawco` it starts with that set
// is bun, not CawCo (`cawco sessiond`: `Script not found "sessiond"`, exit 1).
// Nothing it starts gets it.
const { BUN_BE_BUN: _runner, ...inherited } = process.env;
delete process.env.BUN_BE_BUN;
const env = {
  ...inherited,
  XDG_DATA_HOME: data,
  CAWCO_SESSIOND_ENDPOINT: machine,
};
process.env.XDG_DATA_HOME = data;
process.env.CAWCO_SESSIOND_ENDPOINT = machine;
const checkoutLog = join(scratch, "checkout-keeper.log");
/** The last of what a file says, for a failure's detail. */
const tail = async (path: string): Promise<string> =>
  (
    await Bun.file(path)
      .text()
      .catch(() => "")
  )
    .trim()
    .slice(-800);

let passed = 0;
let failed = 0;
const step = (name: string, ok: boolean, detail = ""): void => {
  if (ok) {
    passed += 1;
  } else {
    failed += 1;
  }
  console.log(
    `${name}${detail ? ` (${detail})` : ""}: ${ok ? "PASS" : "FAIL"}`
  );
};
/** A keeper's connection on `path`; undefined when it refused or gave no welcome in time (the step that asked says so). */
const dial = async (path: string): Promise<SessiondClient | undefined> => {
  const read = await SessiondClient.connect(path).catch(() => undefined);
  switch (read?.kind) {
    case undefined:
    case "unanswered":
      return;
    case "answered":
      return read.value;
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};
/** Whether anything is at `path`, a socket file included. */
const present = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  );
/** Whether a keeper gives its welcome on `path`; the connection is closed. */
const welcomes = async (path: string): Promise<boolean> => {
  const client = await dial(path);
  client?.close();
  return client !== undefined;
};
const until = async (
  ok: () => Promise<boolean>,
  ms: number
): Promise<boolean> => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll; each look must follow the one before
    if (await ok()) {
      return true;
    }
    await Bun.sleep(250);
  }
  return false;
};
const launchctl = async (...args: string[]) => {
  const ran = Bun.spawn(["launchctl", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(ran.stdout).text(),
    new Response(ran.stderr).text(),
    ran.exited,
  ]);
  return { code, out, err };
};

const build = { kind: "build", version: VERSION } as const;
const job = keeperJob(build);
const quiet = { kind: "build", version: QUIET } as const;
const quietJob = keeperJob(quiet);
const own = keeperEndpoint(build, machine);
let checkout: ReturnType<typeof Bun.spawn> | undefined;
try {
  await mkdir(dirname(binary), { recursive: true });
  await mkdir(run, { recursive: true, mode: 0o700 });
  await copyFile(given, binary);
  await Bun.$`chmod 700 ${binary}`;
  await Bun.$`ln -s versions/${CHECKOUT} ${join(root, "keeper")}`;
  if (!job) {
    throw new Error("no launchd job for a keeper on this machine");
  }

  // 1. A source checkout's keeper: on the machine's endpoint itself, holding a child.
  const said = openSync(checkoutLog, "w");
  checkout = Bun.spawn([binary, "sessiond"], {
    env,
    stdout: said,
    stderr: said,
  });
  const started = checkout;
  const before = await until(
    async () => started.exitCode === null && (await welcomes(machine)),
    60_000
  );
  if (!before) {
    throw new Error(
      `the checkout keeper never answered on ${machine} (${started.exitCode === null ? "still running" : `exited ${started.exitCode}`}): ${await tail(checkoutLog)}`
    );
  }
  const held = welcomed(machine, await SessiondClient.connect(machine));
  await held.spawnProc("held-1", { command: "sleep", args: ["300"] });
  const child = (await held.list()).procs.find(
    (p) => p.procId === "held-1" && p.alive
  );
  step(
    "a checkout keeper on the machine's endpoint holds a child",
    before && Boolean(child)
  );

  // 2. The build writes its own keeper's plist, under its own label.
  const units = Bun.spawn([binary, "binary-units"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [unitsSaid, unitsCode] = await Promise.all([
    new Response(units.stderr).text(),
    units.exited,
  ]);
  const plist = await Bun.file(PLIST)
    .text()
    .catch(() => "");
  step(
    "binary-units writes the build's keeper plist",
    unitsCode === 0 &&
      plist.includes(`<string>${LABEL}</string>`) &&
      plist.includes(`<string>${binary}</string>`) &&
      plist.includes(`<string>${own}</string>`) &&
      plist.includes("<string>Interactive</string>"),
    `exit ${unitsCode}, ${PLIST}${unitsCode === 0 ? "" : `: ${unitsSaid.trim().slice(-800)}`}`
  );

  // 3. Its job starts beside the checkout keeper and answers on its own endpoint; the checkout one is untouched.
  await job.start();
  const up = await until(() => welcomes(own), 45_000);
  const pid = await job.pid();
  step(
    "launchd starts the build's keeper beside it, answering on its own endpoint",
    up && pid !== undefined,
    up && pid !== undefined
      ? `pid ${pid}`
      : `pid ${pid}; its log ${LOG}: ${await tail(LOG)}`
  );
  step(
    "it does not take the machine's endpoint by itself while a checkout keeper holds it",
    !(await lstat(machine)).isSymbolicLink()
  );
  const runningExit = await job.exited();
  step(
    "a keeper launchd runs has not exited",
    runningExit === undefined,
    runningExit ?? ""
  );
  const loaded = (await keeperJobsHere()).map((one) => one.service);
  step(
    "the build's keeper job is among the keeper jobs on this machine",
    loaded.includes(SERVICE),
    loaded.join(" ")
  );

  // 4. The switch: the checkout socket moves to its checkout name (a rename on this file system), the endpoint names the build's keeper.
  await publishKeeper(own, CHECKOUT);
  const named = await readlink(machine).catch(() => "");
  const current = await dial(machine);
  const currentList = current ? await current.list() : undefined;
  current?.close();
  step(
    "the machine's endpoint names the build's keeper",
    named === `sessiond-${VERSION}.sock` && currentList?.procs.length === 0,
    `-> ${named}`
  );
  const checkoutName = keeperEndpoint(
    { kind: "checkout", version: CHECKOUT },
    machine
  );
  const viaCheckout = await dial(checkoutName);
  const checkoutList = viaCheckout ? await viaCheckout.list() : undefined;
  viaCheckout?.close();
  step(
    "the checkout keeper answers on the name it was set aside under, holding its child",
    Boolean(checkoutList?.procs.some((p) => p.procId === "held-1" && p.alive))
  );
  step(
    "the connection open to the checkout keeper before the switch still works",
    (await held.list()).procs.some((p) => p.procId === "held-1" && p.alive)
  );
  const found = (await keeperEndpoints(machine)).map(
    (f) => `${f.keeper.kind}:${f.keeper.version}${f.current ? "*" : ""}`
  );
  step(
    "every keeper is found, the current one first",
    found.join(" ") === `build:${VERSION}* checkout:${CHECKOUT}`,
    found.join(" ")
  );

  // 5. The agent's view: new work to the current keeper, the child found on the checkout one, a relaunch killing it there.
  const pool = new KeeperPool();
  const fresh = await pool.current();
  step(
    "new work goes to the current keeper",
    fresh.epoch === currentList?.epoch
  );
  const holder = await pool.holding("held-1");
  step(
    "the child is found on the keeper that holds it",
    holder?.epoch === checkoutList?.epoch
  );
  await pool.replaceElsewhere("held-1", fresh);
  const killed = await until(
    async () => child !== undefined && !isAlive(listedPid(child.pid)),
    10_000
  );
  step(
    "a relaunch on the current keeper kills the one the retiring keeper held",
    killed
  );
  pool.close();

  // 6. A job loaded and never run reads as not exited; one run and exited 0
  // reads so at once, by the start record its launchd program wrote, though
  // launchd states status 0 for both. Its program is `true` through the
  // keeper's own launchd wrapper (launchdProgram): the start record is the
  // wrapper's, whatever it then runs.
  if (!quietJob) {
    throw new Error("no launchd job for the quiet keeper on this machine");
  }
  const quietLog = join(scratch, "quiet-keeper.log");
  const quietPlist = join(scratch, `${QUIET_LABEL}.plist`);
  await writeFile(
    quietPlist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${QUIET_LABEL}</string>
<key>ProgramArguments</key><array>${launchdProgram(QUIET_LABEL, [
      systemProgram("true"),
    ])
      .map(
        (argument) =>
          `<string>${argument.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</string>`
      )
      .join("")}</array>
<key>EnvironmentVariables</key><dict>
<key>XDG_DATA_HOME</key><string>${data}</string>
</dict>
<key>RunAtLoad</key><false/>
<key>StandardOutPath</key><string>${quietLog}</string>
<key>StandardErrorPath</key><string>${quietLog}</string>
</dict></plist>
`
  );
  await rm(launchdStartPath(QUIET_LABEL), { force: true });
  const loadedQuiet = await launchctl(
    "bootstrap",
    `gui/${process.getuid?.()}`,
    quietPlist
  );
  const neverRan = await launchdJob(QUIET_LABEL);
  const neverRanExit = await quietJob.exited();
  step(
    "a keeper job loaded and never run (no process, status 0) has not exited",
    loadedQuiet.code === 0 &&
      neverRan?.pid === undefined &&
      neverRan?.lastExit === 0 &&
      neverRanExit === undefined,
    `bootstrap ${loadedQuiet.code} ${loadedQuiet.err.trim()}; listed ${JSON.stringify(neverRan)}; exited ${neverRanExit ?? "nothing"}`
  );
  const kicked = Date.now();
  await quietJob.start();
  let quietExit: string | undefined;
  await until(async () => {
    quietExit = await quietJob.exited();
    return quietExit !== undefined;
  }, HEALTH_MS);
  const readIn = Date.now() - kicked;
  const ranQuiet = await launchdJob(QUIET_LABEL);
  step(
    "a keeper job run and exited 0 reads as exited with code 0 well inside the helper's wait",
    quietExit === "it exited with code 0" &&
      ranQuiet?.lastExit === 0 &&
      readIn < HEALTH_MS / 3 &&
      (await present(launchdStartPath(QUIET_LABEL))),
    `${quietExit ?? "nothing"} after ${readIn} ms; listed ${JSON.stringify(ranQuiet)}; its log: ${await tail(quietLog)}`
  );
  await launchctl("bootout", `gui/${process.getuid?.()}/${QUIET_LABEL}`);

  // 7. Retired: its plist goes, so it does not load at the next login, and its job runs on.
  await job.retire();
  step(
    "a retired keeper's plist is gone and its job runs on",
    !(await present(PLIST)) &&
      (await job.pid()) === pid &&
      (await welcomes(own))
  );

  // 7. The checkout keeper, empty now, is killed outright: the machine's endpoint is untouched.
  held.close();
  checkout.kill("SIGKILL");
  await checkout.exited;
  step(
    "killing the checkout keeper outright leaves the machine's endpoint naming the current one",
    await welcomes(machine)
  );

  // 8. A build's keeper removed (bootout: SIGTERM, its own drain): it removes its own endpoint only.
  // Empty, it lists no child; launchd has no cgroup to read.
  await job.remove({ children: [] });
  const goneBuild =
    pid !== undefined && (await until(async () => !isAlive(pid), 15_000));
  step(
    "a build's keeper removed through launchd ends, its own endpoint gone, the machine's endpoint left as it was",
    goneBuild &&
      !(await present(own)) &&
      (await readlink(machine).catch(() => "")) ===
        `sessiond-${VERSION}.sock` &&
      (await launchctl("print", `gui/${process.getuid?.()}/${LABEL}`)).code !==
        0 &&
      !(await keeperJobsHere()).some((one) => one.service === SERVICE)
  );

  // 9. A launchd keeper that ends by itself (the probe's label, never the machine's): its pid, as launchctl prints
  // it, killed outright, and its job says how it ended.
  const again = Bun.spawn([binary, "binary-units"], {
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  await again.exited;
  await job.start();
  await until(() => welcomes(own), 45_000);
  const second = await job.pid();
  if (second !== undefined) {
    signal(second, "SIGKILL");
  }
  const killedOutright =
    second !== undefined && (await until(async () => !isAlive(second), 10_000));
  // Ended, and loaded still (KeepAlive waits out its throttle before it starts it again): the job says how.
  const killedExit = await job.exited();
  step(
    "a launchd keeper that ended says how, as its job's exit",
    killedOutright && killedExit !== undefined,
    `pid ${second}: ${killedExit ?? "nothing"}`
  );
} catch (error) {
  step(
    "the probe ran to its end",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  checkout?.kill("SIGKILL");
  await launchctl("bootout", `gui/${process.getuid?.()}/${LABEL}`);
  await launchctl("bootout", `gui/${process.getuid?.()}/${QUIET_LABEL}`);
  await rm(launchdStartPath(LABEL), { force: true });
  await rm(launchdStartPath(QUIET_LABEL), { force: true });
  await rm(PLIST, { force: true });
  await rm(LOG, { force: true });
  await rm(scratch, { recursive: true, force: true });
}
console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
