import { basename } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { installed, launchArgs, readNpx } from "./mcp-install";
import { bunOnlyNpm, resolveBin, toolPath } from "./tools";

/**
 * A fleet MCP's command as this machine launches it, or why it does not:
 * `unavailable` waits for the next sync after an install; `failed` is the
 * row's own (npm's sentence, or an npx line CawCo installs nothing from).
 * `dir` is the install an npx row launches from (mcp-install.ts).
 */
export type McpLauncher =
  | { config: FleetMcpConfig; dir?: string }
  | { failed: string }
  | { unavailable: string };

/** npm's runner, which a fleet MCP's command names to run a package (`npx -y <pkg>@<version>`). */
const NPX = "npx";

const notInstalled = (command: string): { unavailable: string } => ({
  unavailable: `Command '${command}' is not installed on this machine. It will be enabled on the next sync after installation.`,
});

/**
 * A fleet MCP's command as this machine's PATH resolves it (tools.ts
 * `toolPath`), once, at the sync, before any harness writes its config. The
 * server runs on that same PATH, so what its command runs in turn resolves
 * there too. A row that runs npx is installed once at its exact version
 * (mcp-install.ts, with npm's own npm, never a Bun alias ahead of it:
 * tools.ts `resolveBin`) and launched as its package's bin under node: no
 * session runs npx, waits on its cache's lock or reads the registry.
 * chrome-devtools is resolved as any other: each session launches it through
 * its browser's gate (browser/door.ts), never with a Chromium of its own.
 */
export const resolveMcpLauncher = async (
  config: FleetMcpConfig
): Promise<McpLauncher> => {
  if ("url" in config) {
    return { config };
  }
  const env = { ...config.env, PATH: config.env?.PATH ?? toolPath() };
  if (basename(config.command) !== NPX) {
    const resolved = resolveBin(config.command);
    return resolved
      ? { config: { ...config, command: resolved, env } }
      : notInstalled(config.command);
  }
  const run = readNpx(config.args ?? []);
  if ("refused" in run) {
    return { failed: run.refused };
  }
  const npm = resolveBin("npm");
  if (!npm) {
    const alias = bunOnlyNpm();
    return alias
      ? {
          unavailable: `Command 'npm' on this machine is Bun's (${alias} runs bun), which doesn't take npm's options. It will be enabled on the next sync after npm is installed.`,
        }
      : notInstalled("npm");
  }
  const node = resolveBin("node");
  if (!node) {
    return notInstalled("node");
  }
  const got = await installed(npm, run, config.env);
  if ("failed" in got) {
    return got;
  }
  return {
    config: {
      ...config,
      command: node,
      args: launchArgs(got.dir, got.bin, run.args),
      env,
    },
    dir: got.dir,
  };
};
