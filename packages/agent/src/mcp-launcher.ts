import type { FleetMcpConfig } from "@cawco/core";
import { resolveBin, toolPath } from "./tools";

type McpLauncher = { config: FleetMcpConfig } | { unavailable: string };

/**
 * A fleet MCP's command, `npx` among them, as this machine's PATH resolves it
 * (tools.ts `toolPath`), once, before any harness writes its config. The
 * server runs on that same PATH, so what its command runs in turn (npx's
 * `node`) resolves there too. chrome-devtools is resolved as any other: each
 * session launches it through its browser's gate (browser/door.ts), never
 * with a Chromium of its own.
 */
export const resolveMcpLauncher = (config: FleetMcpConfig): McpLauncher => {
  if ("url" in config) {
    return { config };
  }
  const resolved = resolveBin(config.command);
  if (!resolved) {
    return {
      unavailable: `Command '${config.command}' is not installed on this machine. It will be enabled on the next sync after installation.`,
    };
  }
  return {
    config: {
      ...config,
      command: resolved,
      env: { ...config.env, PATH: config.env?.PATH ?? toolPath() },
    },
  };
};
