import type { FleetMcpConfig } from "@cawco/core";
import { chromiumExecutable } from "./browser/local-host";
import { resolveBin, toolPath } from "./tools";

type McpLauncher =
  { config: FleetMcpConfig } | { failure: string } | { unavailable: string };

/**
 * A fleet MCP's command, `npx` among them, as this machine's PATH resolves it
 * (tools.ts `toolPath`), once, before any harness writes its config. The
 * server runs on that same PATH, so what its command runs in turn (npx's
 * `node`) resolves there too.
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

export const prepareFleetMcp = async (
  name: string,
  config: FleetMcpConfig
): Promise<McpLauncher> => {
  const launcher = resolveMcpLauncher(config);
  if (
    "failure" in launcher ||
    "unavailable" in launcher ||
    name !== "chrome-devtools" ||
    "url" in launcher.config
  ) {
    return launcher;
  }
  const chromium = await chromiumExecutable();
  if (!("executable" in chromium)) {
    return chromium;
  }
  return {
    config: {
      ...launcher.config,
      args: [
        ...(launcher.config.args ?? []).filter(
          (arg) => !arg.startsWith("--executablePath=")
        ),
        `--executablePath=${chromium.executable}`,
      ],
    },
  };
};
