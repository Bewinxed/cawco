/**
 * Configure › Command-line tools' bench (`/motion/tool-updates`): a fleet
 * of eight machines fourteen minutes after a release moved the OpenCode
 * CawCo runs from 2.0.29 to 2.3.0, its cells as each machine's daemon
 * reports them (core `ToolStatus`, with `copy`, `wants` and `triedAt`), so
 * the screen reads them through core tool-updates.ts as it reads a live
 * fleet. `fleet("one")` is one machine; `fleet("current")` every machine at
 * CawCo's versions, Claude Code's newer release on one of them.
 */
import { MINUTE_MS } from "@cawco/core/time";
import type { ToolStatus } from "@cawco/core/tools";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

const now = Date.now();
const ago = (minutes: number) => now - minutes * MINUTE_MS;

const CC = "2.1.330";
/** One machine still on the release before. */
const CC_BEFORE = "2.1.321";
const OC = { version: "2.3.0", orNewer: false };
/** Claude Code's newest release, as the hub last read it. */
export const RELEASES = { claude: "2.1.330" };

const ok = (
  id: string,
  version: string,
  updatedMin?: number,
  by: "cawco" | "person" = "cawco"
): ToolStatus => ({
  id,
  state: "installed",
  version,
  method: "npm",
  at: ago(1),
  copy:
    by === "person"
      ? { by }
      : { by, ...(updatedMin === undefined ? {} : { at: ago(updatedMin) }) },
});
const updating = (id: string, from: string, to: string): ToolStatus => ({
  id,
  state: "installing",
  version: from,
  to,
  method: "npm",
  at: ago(0),
  copy: { by: "cawco" },
});
const EACCES = [
  "$ npm install -g opencode-ai@2.3.0",
  "npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory.",
  "npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported",
  "npm error code EACCES",
  "npm error syscall rename",
  "npm error path /usr/lib/node_modules/opencode-ai",
  "npm error dest /usr/lib/node_modules/.opencode-ai-Xk2b9",
  "npm error errno -13",
  "npm error Error: EACCES: permission denied, rename '/usr/lib/node_modules/opencode-ai' -> '/usr/lib/node_modules/.opencode-ai-Xk2b9'",
  "npm error  [Error: EACCES: permission denied, rename '/usr/lib/node_modules/opencode-ai' -> '/usr/lib/node_modules/.opencode-ai-Xk2b9'] {",
  "npm error   errno: -13,",
  "npm error   code: 'EACCES',",
  "npm error   syscall: 'rename',",
  "npm error   path: '/usr/lib/node_modules/opencode-ai',",
  "npm error   dest: '/usr/lib/node_modules/.opencode-ai-Xk2b9'",
  "npm error }",
  "npm error",
  "npm error The operation was rejected by your operating system.",
  "npm error It is likely you do not have the permissions to access this file as the current user",
  "npm error",
  "npm error If you believe this might be a permissions issue, please double-check the",
  "npm error permissions of the file and its containing directories, or try running",
  "npm error the command again as root/Administrator.",
  "npm error A complete log of this run can be found in: /home/omar/.npm/_logs/2026-11-14T08_41_02_118Z-debug-0.log",
].join("\n");
const failed = (id: string, from: string): ToolStatus => ({
  id,
  state: "failed",
  version: from,
  wants: OC,
  triedAt: ago(13),
  detail: EACCES,
  method: "npm",
  at: ago(13),
  copy: { by: "cawco" },
});
const own = (id: string, from: string): ToolStatus => ({
  id,
  state: "failed",
  version: from,
  wants: OC,
  method: "npm (~/.npm-global)",
  at: ago(14),
  copy: { by: "person" },
});
/** CawCo's copy at a version it doesn't run: `due` or `asked`, by the fleet's choice. */
const behind = (
  id: string,
  from: string,
  wants: { version: string; orNewer: boolean }
): ToolStatus => ({
  id,
  state: "failed",
  version: from,
  wants,
  method: "npm",
  at: ago(190),
  copy: { by: "cawco" },
});
const missing = (id: string): ToolStatus => ({
  id,
  state: "missing",
  at: ago(1),
});
const agy = (signedIn = true): ToolStatus => ({
  ...ok("antigravity", "1.5.0"),
  signin: { state: signedIn ? "signed-in" : "signed-out", at: ago(4) },
});

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  tools: Record<string, ToolStatus>,
  presence: "online" | "offline" | "paused" = "online"
): Machine => ({
  machineId,
  hostname,
  os,
  status: presence === "offline" ? "offline" : "online",
  auth: "unknown",
  lastSeenAt: new Date(presence === "offline" ? ago(190) : now).toISOString(),
  pausedUntil: presence === "paused" ? now + 90 * MINUTE_MS : null,
  pauseStopped: null,
  tools,
});

const eight = (): Machine[] => [
  machine("m-nifty", "niftybot.art", "linux-x64", {
    claude: ok("claude", CC, 40),
    opencode: ok("opencode", "2.3.0", 13),
    pi: ok("pi", "1.4.0"),
    antigravity: missing("antigravity"),
  }),
  machine("m-obelisk", "obelisk-of-light", "linux-x64", {
    claude: ok("claude", CC, 40),
    opencode: updating("opencode", "2.0.29", "2.3.0"),
    pi: ok("pi", "1.4.0"),
    antigravity: agy(),
  }),
  machine("m-omar", "Omars-MacBook-Pro", "darwin-arm64", {
    claude: ok("claude", CC_BEFORE, undefined, "person"),
    opencode: own("opencode", "2.0.29"),
    pi: ok("pi", "1.4.0"),
    antigravity: agy(),
  }),
  machine("m-uwu", "uwucloud", "linux-x64", {
    claude: ok("claude", CC, 40),
    opencode: failed("opencode", "2.0.29"),
    pi: ok("pi", "1.4.0"),
    antigravity: agy(false),
  }),
  machine(
    "m-hangar",
    "hangar",
    "linux-x64",
    {
      claude: ok("claude", CC, 40),
      opencode: behind("opencode", "2.0.29", OC),
      pi: behind("pi", "1.2.4", { version: "1.3.0", orNewer: true }),
      antigravity: missing("antigravity"),
    },
    "offline"
  ),
  machine(
    "m-roost",
    "roost",
    "darwin-arm64",
    {
      claude: ok("claude", CC, 40),
      opencode: behind("opencode", "2.0.29", OC),
      pi: ok("pi", "1.4.0"),
      antigravity: agy(),
    },
    "paused"
  ),
  machine("m-crow", "crowsnest", "linux-x64", {
    claude: ok("claude", CC_BEFORE, 400),
    opencode: ok("opencode", "2.3.0", 12),
    pi: ok("pi", "1.4.0"),
    antigravity: agy(),
  }),
  machine("m-ledger", "ledger-build-runner-eu-west-3.internal", "linux-x64", {
    claude: ok("claude", CC, 40),
    opencode: ok("opencode", "2.3.0"),
    pi: missing("pi"),
    antigravity: missing("antigravity"),
  }),
];

export function fleet(which: string | null): Machine[] {
  const all = eight();
  if (which === "one") {
    return all.filter((one) => one.machineId === "m-uwu");
  }
  if (which === "current") {
    return all
      .filter(
        (one) =>
          !["m-hangar", "m-roost", "m-uwu", "m-obelisk"].includes(one.machineId)
      )
      .map((one) =>
        one.machineId === "m-omar"
          ? {
              ...one,
              tools: { ...one.tools, opencode: ok("opencode", "2.3.0", 3) },
            }
          : one
      );
  }
  return all;
}
