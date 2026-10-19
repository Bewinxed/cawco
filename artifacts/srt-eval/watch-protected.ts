/**
 * Prototype: the host-side watch that closes the window runner-exec.sh's
 * per-command check leaves. srt protects `.git/config` and `.git/hooks` with
 * read-only binds; a host-side rename or unlink of either (any `git config` on
 * the host) detaches the bind inside the sandbox, and from then on a process
 * already running there can write it. This watches the clone's `.git` from the
 * host and kills the sandbox (its outer bwrap; srt then cleans up) on the first
 * event that touches either name. In the product this is the agent's job, for
 * as long as the boundary runs.
 *
 *   bun watch-protected.ts <clone> <state>
 */
import { readFileSync, watch } from "node:fs";
import { join } from "node:path";
import { listedPid, signal } from "../../packages/core/src/signal";

const [clone, state] = process.argv.slice(2);
if (!(clone && state)) {
  console.error("usage: bun watch-protected.ts <clone> <state>");
  process.exit(64);
}
const protectedNames = new Set(["config", "hooks"]);
const sandbox = Number.parseInt(
  readFileSync(join(state, "sandbox.pid"), "utf8"),
  10
);
/** Whether `sandbox` is still a bwrap, as /proc lists it: a pid on record names no other process. */
const isBwrap = (): boolean => {
  try {
    return (
      readFileSync(`/proc/${sandbox}/cmdline`, "utf8")
        .split("\0")[0]
        ?.endsWith("bwrap") ?? false
    );
  } catch {
    return false;
  }
};
if (!isBwrap()) {
  console.error(`${state}/sandbox.pid names no running bwrap (${sandbox})`);
  process.exit(1);
}
const watcher = watch(join(clone, ".git"), (_event, name) => {
  if (name && protectedNames.has(String(name))) {
    if (isBwrap()) {
      signal(listedPid(sandbox), "SIGKILL");
    }
    console.log(`killed sandbox ${sandbox}: .git/${name} changed on the host`);
    watcher.close();
    process.exit(0);
  }
});
console.log(`watching ${clone}/.git for config and hooks; sandbox ${sandbox}`);
