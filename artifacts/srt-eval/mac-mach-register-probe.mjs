// Prototype probe (macOS): is `mach-register` the only thing srt's Seatbelt
// profile lacks for Chromium (srt issue #210)? Wraps COMMAND with srt's own
// profile for SETTINGS through the library, adds one rule to the profile, and
// runs it. Not a proposal to patch srt's output in CawCo: it measures what an
// upstream `allowMachRegister` option would need to allow.
//   node mac-mach-register-probe.mjs SETTINGS COMMAND
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { SandboxManager } from "@anthropic-ai/sandbox-runtime";

const [settings, command] = process.argv.slice(2);
await SandboxManager.initialize(JSON.parse(readFileSync(settings, "utf8")));
const wrapped = await SandboxManager.wrapWithSandbox(command);
const rule = '(allow mach-register (global-name-prefix "org.chromium."))';
const marker = "(allow process-fork)";
if (!wrapped.includes(marker)) {
  throw new Error("srt's profile no longer has the line this probe anchors on");
}
const patched = wrapped.replace(marker, `${marker}\n${rule}`);
const run = spawnSync("/bin/bash", ["-c", patched], { stdio: "inherit" });
await SandboxManager.reset();
process.exit(run.status ?? 1);
