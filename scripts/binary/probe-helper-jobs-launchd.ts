/**
 * The update helper's launchd jobs, proved on a Mac against launchd itself,
 * with nothing of the machine's own CawCo touched: a scratch binary root
 * (XDG_DATA_HOME under /tmp), and jobs under the helper's own label scheme,
 * launched and swept by the agent's own code (packages/agent/src/helper-jobs.ts),
 * each running a stand-in for the helper that ends by itself.
 *
 *   bun scripts/binary/probe-helper-jobs-launchd.ts
 *
 * The case is the owner's Mac on 2026-10-13: Install now waited on the update
 * pass already running, which launched the helper; Install now's own pass then
 * began, and its sweep booted that helper's job out before the helper had
 * taken its lock, so the machine said installing with nothing applying it.
 * Each step prints one line ending in PASS or FAIL; the last line counts them,
 * and the exit status is 0 only when none failed. Everything it made is removed
 * at the end, whatever happened.
 */
import { lstat, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  HELPER_START_MS,
  type HelperJob,
  helperJobSays,
  launchHelper,
  removeFinishedHelpers,
} from "../../packages/agent/src/helper-jobs";
import { launchdState } from "../../packages/agent/src/keeper-jobs";
import { binaryRoot } from "../../packages/core/src/binary-installation";

if (process.platform !== "darwin") {
  throw new Error(
    "Usage, on macOS: bun scripts/binary/probe-helper-jobs-launchd.ts"
  );
}
const scratch = await Bun.$`mktemp -d /tmp/hj.XXXXXX`
  .text()
  .then((t) => t.trim());
// The binary root every call below reads: the scratch one, never the machine's.
process.env.XDG_DATA_HOME = join(scratch, "data");

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
const present = (path: string): Promise<boolean> =>
  lstat(path).then(
    () => true,
    () => false
  );
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
const plistOf = (job: HelperJob): string =>
  join(binaryRoot(), `${job.label}.plist`);
/** Waits out what is left of a job's start window, from its launch at `at`. */
const pastStartWindow = (at: number): Promise<void> =>
  Bun.sleep(Math.max(0, at + HELPER_START_MS + 1000 - Date.now()));
/**
 * A stand-in for a helper: it holds nothing for its first `quiet` seconds,
 * as a helper starting up holds no lock yet, then marks that it took over,
 * runs `runs` seconds more and marks that it ended.
 */
const standIn = (name: string, quiet: number, runs: number): string[] => [
  "/bin/sh",
  "-c",
  `sleep ${quiet}; touch "$0/${name}.took-over"; sleep ${runs}; touch "$0/${name}.ended"`,
  scratch,
];
const marked = (name: string) => () => present(join(scratch, name));

const launched: HelperJob[] = [];
try {
  await mkdir(binaryRoot(), { recursive: true });

  // 1. A helper is launched, and an update pass begins at once, as Install now's own pass does after the pass it
  // waited on: its sweep finds no lock (the helper has not started its work) and must leave the job be.
  const first = await launchHelper(standIn("first", 2, 3));
  const firstAt = Date.now();
  launched.push(first);
  await removeFinishedHelpers();
  step(
    "a sweep right after a helper's launch leaves its job loaded and its plist in place",
    (await launchdState(first.label ?? "")) !== undefined &&
      (await present(plistOf(first))),
    first.name
  );
  step(
    "the helper launched before that sweep runs on and takes over",
    await until(marked("first.took-over"), 15_000)
  );
  await until(marked("first.ended"), 15_000);
  const said = await until(
    async () => (await helperJobSays(first)) === "it exited with code 0",
    10_000
  );
  step(
    "launchd says how the helper's job ended",
    said,
    await helperJobSays(first)
  );

  // 2. Once it has ended and its start window has passed, the next sweep removes its job and plist.
  await pastStartWindow(firstAt);
  await removeFinishedHelpers();
  step(
    "a helper's job that ended is booted out, and its plist removed, by the next sweep",
    (await launchdState(first.label ?? "")) === undefined &&
      !(await present(plistOf(first)))
  );

  // 3. A helper still running past its start window, holding no lock, is not ended by a sweep.
  const second = await launchHelper(standIn("second", 0, 14));
  const secondAt = Date.now();
  launched.push(second);
  await until(marked("second.took-over"), 15_000);
  await pastStartWindow(secondAt);
  await removeFinishedHelpers();
  const running = await launchdState(second.label ?? "");
  step(
    "a helper launchd still runs past its start window is left running by a sweep",
    running?.pid !== undefined && (await present(plistOf(second))),
    running?.pid === undefined ? "no process" : `pid ${running.pid}`
  );
  step(
    "that helper runs to its own end",
    await until(marked("second.ended"), 20_000)
  );
  await until(
    async () => (await launchdState(second.label ?? ""))?.pid === undefined,
    10_000
  );
  await removeFinishedHelpers();
  step(
    "once it has ended, the next sweep removes its job and plist",
    (await launchdState(second.label ?? "")) === undefined &&
      !(await present(plistOf(second)))
  );
} catch (error) {
  step(
    "the probe ran to its end",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  await Promise.all(
    launched.map(
      (job) =>
        Bun.spawn(
          ["launchctl", "bootout", `gui/${process.getuid?.()}/${job.label}`],
          { stdout: "ignore", stderr: "ignore" }
        ).exited
    )
  );
  await rm(scratch, { recursive: true, force: true });
}
console.log(`${passed} PASS, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
