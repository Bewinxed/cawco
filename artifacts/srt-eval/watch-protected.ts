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

const [clone, state] = process.argv.slice(2);
if (!(clone && state)) {
  console.error("usage: bun watch-protected.ts <clone> <state>");
  process.exit(64);
}
const protectedNames = new Set(["config", "hooks"]);
const sandbox = Number.parseInt(readFileSync(join(state, "sandbox.pid"), "utf8"), 10);
const watcher = watch(join(clone, ".git"), (_event, name) => {
  if (name && protectedNames.has(String(name))) {
    try {
      process.kill(sandbox, "SIGKILL");
    } catch {
      // already gone
    }
    console.log(`killed sandbox ${sandbox}: .git/${name} changed on the host`);
    watcher.close();
    process.exit(0);
  }
});
console.log(`watching ${clone}/.git for config and hooks; sandbox ${sandbox}`);
