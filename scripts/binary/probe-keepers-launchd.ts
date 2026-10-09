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
 * `0.0.0-probe.2`, signed (`codesign --force --sign -`). Each step prints one
 * line ending in PASS or FAIL; the last line counts them. Everything it made
 * is removed at the end, whatever happened.
 */
import { copyFile, lstat, mkdir, readlink, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { keeperJob } from "../../packages/agent/src/keeper-jobs";
import { KeeperPool } from "../../packages/agent/src/keepers";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import {
  keeperEndpoint,
  keeperEndpoints,
  publishKeeper,
} from "../../packages/core/src/keepers";

const VERSION = "0.0.0-probe.2";
const LEGACY = "0.0.0-legacy";
const LABEL = `dev.cawco.sessiond-${VERSION}`;
const PLIST = join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
const LOG = join(homedir(), "Library", "Logs", `cawco-sessiond-${VERSION}.log`);

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
const binary = join(root, "versions", VERSION, "cawco");
const env = {
  ...process.env,
  XDG_DATA_HOME: data,
  CAWCO_SESSIOND_ENDPOINT: machine,
};
process.env.XDG_DATA_HOME = data;
process.env.CAWCO_SESSIOND_ENDPOINT = machine;

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
const dial = (path: string): Promise<SessiondClient | undefined> =>
  SessiondClient.connect(path).catch(() => undefined);
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
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const build = { kind: "build", version: VERSION } as const;
const job = keeperJob(build);
const own = keeperEndpoint(build, machine);
let legacy: ReturnType<typeof Bun.spawn> | undefined;
try {
  await mkdir(join(root, "versions", VERSION), { recursive: true });
  await mkdir(run, { recursive: true, mode: 0o700 });
  await copyFile(given, binary);
  await Bun.$`chmod 700 ${binary}`;
  await Bun.$`ln -s versions/${LEGACY} ${join(root, "keeper")}`;
  if (!job) {
    throw new Error("no launchd job for a keeper on this machine");
  }

  // 1. A legacy keeper, from before keepers ran side by side: on the machine's endpoint itself, holding a child.
  legacy = Bun.spawn([binary, "sessiond"], {
    env,
    stdout: "ignore",
    stderr: "ignore",
  });
  const before = await until(() => welcomes(machine), 20_000);
  const held = await SessiondClient.connect(machine);
  await held.spawnProc("held-1", { command: "sleep", args: ["300"] });
  const child = (await held.list()).procs.find(
    (p) => p.procId === "held-1" && p.alive
  );
  step(
    "a legacy keeper on the machine's endpoint holds a child",
    before && Boolean(child)
  );

  // 2. The build writes its own keeper's plist, under its own label.
  const units = Bun.spawn([binary, "binary-units"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const unitsCode = await units.exited;
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
    `exit ${unitsCode}, ${PLIST}`
  );

  // 3. Its job starts beside the legacy keeper and answers on its own endpoint; the legacy one is untouched.
  await job.start();
  const up = await until(() => welcomes(own), 45_000);
  const pid = await job.pid();
  step(
    "launchd starts the build's keeper beside it, answering on its own endpoint",
    up && pid !== undefined,
    `pid ${pid}`
  );
  step(
    "it does not take the machine's endpoint by itself while a legacy keeper holds it",
    !(await lstat(machine)).isSymbolicLink()
  );

  // 4. The switch: the legacy socket moves to its legacy name (a rename on this file system), the endpoint names the build's keeper.
  await publishKeeper(own, LEGACY);
  const named = await readlink(machine).catch(() => "");
  const current = await dial(machine);
  const currentList = current ? await current.list() : undefined;
  current?.close();
  step(
    "the machine's endpoint names the build's keeper",
    named === `sessiond-${VERSION}.sock` && currentList?.procs.length === 0,
    `-> ${named}`
  );
  const legacyName = keeperEndpoint(
    { kind: "legacy", version: LEGACY },
    machine
  );
  const viaLegacy = await dial(legacyName);
  const legacyList = viaLegacy ? await viaLegacy.list() : undefined;
  viaLegacy?.close();
  step(
    "the legacy keeper answers on the name it was set aside under, holding its child",
    Boolean(legacyList?.procs.some((p) => p.procId === "held-1" && p.alive))
  );
  step(
    "the connection open to the legacy keeper before the switch still works",
    (await held.list()).procs.some((p) => p.procId === "held-1" && p.alive)
  );
  const found = (await keeperEndpoints(machine)).map(
    (f) => `${f.keeper.kind}:${f.keeper.version}${f.current ? "*" : ""}`
  );
  step(
    "every keeper is found, the current one first",
    found.join(" ") === `build:${VERSION}* legacy:${LEGACY}`,
    found.join(" ")
  );

  // 5. The agent's view: new work to the current keeper, the child found on the legacy one, a relaunch killing it there.
  const pool = new KeeperPool();
  const fresh = await pool.current();
  step(
    "new work goes to the current keeper",
    fresh.epoch === currentList?.epoch
  );
  const holder = await pool.holding("held-1");
  step(
    "the child is found on the keeper that holds it",
    holder?.epoch === legacyList?.epoch
  );
  await pool.replaceElsewhere("held-1", fresh);
  const killed = await until(
    async () => child !== undefined && !alive(child.pid),
    10_000
  );
  step(
    "a relaunch on the current keeper kills the one the retiring keeper held",
    killed
  );
  pool.close();

  // 6. A keeper started on the machine's endpoint now (a legacy job launchd starts again) is not wanted, and exits 0.
  const stray = Bun.spawn([binary, "sessiond"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const strayCode = await stray.exited;
  step(
    "a keeper started on the machine's endpoint, a symlink now, exits 0",
    strayCode === 0 &&
      (await readlink(machine).catch(() => "")) === `sessiond-${VERSION}.sock`,
    `exit ${strayCode}`
  );

  // 7. Retired: its plist goes, so it does not load at the next login, and its job runs on.
  await job.retire();
  step(
    "a retired keeper's plist is gone and its job runs on",
    !(await present(PLIST)) &&
      (await job.pid()) === pid &&
      (await welcomes(own))
  );

  // 8. The legacy keeper, empty now, is killed outright: the machine's endpoint is untouched.
  held.close();
  legacy.kill("SIGKILL");
  await legacy.exited;
  step(
    "killing the legacy keeper outright leaves the machine's endpoint naming the current one",
    await welcomes(machine)
  );

  // 9. A build's keeper removed (bootout: SIGTERM, its own drain): it removes its own endpoint only.
  await job.remove();
  const goneBuild =
    pid !== undefined && (await until(async () => !alive(pid), 15_000));
  step(
    "a build's keeper removed through launchd ends, its own endpoint gone, the machine's endpoint left as it was",
    goneBuild &&
      !(await present(own)) &&
      (await readlink(machine).catch(() => "")) ===
        `sessiond-${VERSION}.sock` &&
      (await launchctl("print", `gui/${process.getuid?.()}/${LABEL}`)).code !==
        0
  );

  // 10. The legacy removal's own sequence on a launchd job (the probe's label, never the machine's): its pid, as
  // launchctl prints it, killed outright, then booted out; nothing drains, so its endpoint file stays.
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
    process.kill(second, "SIGKILL");
  }
  const killedOutright =
    second !== undefined && (await until(async () => !alive(second), 10_000));
  await launchctl("bootout", `gui/${process.getuid?.()}/${LABEL}`);
  step(
    "a launchd keeper killed by its pid then booted out never drains (its endpoint file stays) and its job is gone",
    killedOutright &&
      (await present(own)) &&
      (await launchctl("print", `gui/${process.getuid?.()}/${LABEL}`)).code !==
        0,
    `pid ${second}`
  );
} catch (error) {
  step(
    "the probe ran to its end",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  legacy?.kill("SIGKILL");
  await launchctl("bootout", `gui/${process.getuid?.()}/${LABEL}`);
  await rm(PLIST, { force: true });
  await rm(LOG, { force: true });
  await rm(scratch, { recursive: true, force: true });
}
console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
