/**
 * fsevents-scope's child: the daemon's browser watch (browsers.ts
 * `watchBrowsers`) in a process of its own, on the data dir its parent
 * names (XDG_DATA_HOME) and a gate port of its own, with a local browser's
 * record and a profile written as a running Chromium writes it. It says
 * where the records and the profile are, then stops the watch when its
 * parent writes `stop` and exits on `exit`, so the parent reads the
 * process's FSEvents streams (fsevents.ts) while it watches and after.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { watchBrowsers } from "../../packages/agent/src/browser/browsers";
import { profileDir } from "../../packages/agent/src/browser/local-host";
import { browsersDir, recordFor } from "../../packages/agent/src/browser/state";

const say = (word: object): void => {
  process.stdout.write(`${JSON.stringify(word)}\n`);
};

// A build whose watch answers no stop answers nothing here.
const stop: unknown = await watchBrowsers();
const record = await recordFor("project:probe-fsevents", "probe", "local");
const profile = profileDir(record);
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
