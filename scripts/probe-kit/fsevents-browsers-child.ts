/**
 * fsevents-scope's child: the daemon's browser watch (browsers.ts
 * `watchBrowsers`) in a process of its own, on the data dir its parent
 * names (XDG_DATA_HOME) and a gate port of its own, with a local browser's
 * record and a profile written as a running Chromium writes it.
 *
 * Before the watch starts, the browser is as an agent before 2026-10-20
 * left it: its profile (a cookie file) and its log beside its record, and
 * its Chromium (a stand-in `sleep` in a group of its own, by its identity)
 * running from them. It says what the watch's start made of those, where
 * the records and the profile are, then stops the watch when its parent
 * writes `stop` and exits on `exit`, so the parent reads the process's
 * FSEvents streams (fsevents.ts) while it watches and after.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { watchBrowsers } from "../../packages/agent/src/browser/browsers";
import { profileDir } from "../../packages/agent/src/browser/local-host";
import {
  browserDir,
  browsersDir,
  chromiumDir,
  recordFor,
  writeBrowser,
} from "../../packages/agent/src/browser/state";
import { bootId, processStart } from "../../packages/core/src/process-identity";

const say = (word: object): void => {
  process.stdout.write(`${JSON.stringify(word)}\n`);
};

const key = "project:probe-fsevents";
const kept = await recordFor(key, "probe", "local");
const old = browserDir(key);
const cookie = randomBytes(16).toString("hex");
await mkdir(join(old, "profile", "Default"), { recursive: true });
await writeFile(join(old, "profile", "Default", "Cookies"), cookie);
await writeFile(join(old, "chromium.log"), `log ${cookie}\n`);
const chromium = spawn("sleep", ["600"], { detached: true, stdio: "ignore" });
let chromiumEnded = false;
chromium.once("exit", () => {
  chromiumEnded = true;
});
const pid = chromium.pid ?? 0;
const [procStart, boot] = await Promise.all([processStart(pid), bootId()]);
await writeBrowser({
  ...kept,
  local: { pid, procStart: procStart ?? "", ...(boot ? { bootId: boot } : {}) },
});

// A build whose watch answers no stop answers nothing here.
const stop: unknown = await watchBrowsers();
const record = await recordFor(key, "probe", "local");
const profile = profileDir(record);
const read = (path: string) => readFile(path, "utf8").catch(() => undefined);
const moved = {
  cookie: (await read(join(profile, "Default", "Cookies"))) === cookie,
  log:
    (await read(join(chromiumDir(key), "chromium.log"))) === `log ${cookie}\n`,
  oldLeft: ["profile", "chromium.log"].filter((file) =>
    existsSync(join(old, file))
  ),
  chromiumEnded,
};
if (!chromiumEnded) {
  chromium.kill("SIGKILL");
}
await mkdir(profile, { recursive: true });
// What a running Chromium does to its profile, many times a second.
for (let write = 0; write < 20; write += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: one write after another, as Chromium's journal goes
  await writeFile(join(profile, "Cookies-journal"), String(write));
}
say({
  phase: "watching",
  records: browsersDir(),
  profile,
  moved,
  stoppable: typeof stop === "function",
});
for await (const line of console) {
  if (line === "stop") {
    if (typeof stop === "function") {
      stop();
    }
    say({ phase: "stopped" });
  } else if (line === "exit") {
    process.exit(0);
  }
}
