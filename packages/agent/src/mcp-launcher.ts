import { accessSync, constants, readFileSync, realpathSync } from "node:fs";
import { platform } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { standalone } from "@cawco/core/runtime";
import { browserExecutable } from "./capabilities";
import { resolveBin, toolEnv, toolPath } from "./tools";

type McpLauncher =
  | { config: FleetMcpConfig }
  | { failure: string }
  | { unavailable: string };

const WINDOWS_SHIM = /\.(cmd|bat)$/i;

/** Resolve ordinary runners once, before any harness writes its config. */
const resolveCommandLauncher = (
  config: Extract<FleetMcpConfig, { command: string }>
): McpLauncher => {
  const resolved = resolveBin(config.command);
  if (!resolved) {
    return {
      unavailable: `Command '${config.command}' is not installed on this machine. It will be enabled on the next sync after installation.`,
    };
  }
  if (platform() === "win32" && WINDOWS_SHIM.test(resolved)) {
    const cmd = resolveBin("cmd");
    if (!cmd) {
      return {
        unavailable: "Command 'cmd' is not installed on this machine.",
      };
    }
    return {
      config: {
        ...config,
        command: cmd,
        args: ["/c", resolved, ...(config.args ?? [])],
      },
    };
  }
  return { config: { ...config, command: resolved } };
};

/** npx belongs to the Node installation, never a same-named PATH shim. */
export const resolveMcpLauncher = (config: FleetMcpConfig): McpLauncher => {
  if ("url" in config) {
    return { config };
  }
  if (!["npx", "npx.cmd"].includes(basename(config.command))) {
    return resolveCommandLauncher(config);
  }
  const node = resolveBin("node");
  const failure = {
    failure: `npm's npx is missing or invalid beside this machine's Node (${node ?? "not installed"}). Install npm with that Node; non-npm npx shims cannot run fleet MCP servers.`,
  };
  if (!node) {
    return {
      unavailable:
        "Node/npm is not installed on this machine. Waiting for installation before enabling this npx server on the next sync.",
    };
  }
  const nodeDir = dirname(node);
  const windows = platform() === "win32";
  const npx = join(nodeDir, windows ? "npx.cmd" : "npx");
  if (!resolveBin(npx)) {
    return {
      unavailable:
        "npm's npx is not installed beside this machine's Node. Waiting for npm installation before enabling this server on the next sync.",
    };
  }
  try {
    accessSync(npx, constants.X_OK);
    const cli = windows
      ? join(nodeDir, "node_modules", "npm", "bin", "npx-cli.js")
      : realpathSync(npx);
    const npmDir = dirname(dirname(cli));
    const npm = JSON.parse(
      readFileSync(join(npmDir, "package.json"), "utf8")
    ) as {
      name?: string;
      bin?: { npx?: string };
    };
    if (
      npm.name !== "npm" ||
      !npm.bin?.npx ||
      realpathSync(resolve(npmDir, npm.bin.npx)) !== realpathSync(cli) ||
      (windows &&
        !readFileSync(npx, "utf8").includes(
          "node_modules\\npm\\bin\\npx-cli.js"
        ))
    ) {
      return failure;
    }
    return {
      config: {
        ...config,
        command: windows ? "cmd" : npx,
        args: windows ? ["/c", npx, ...(config.args ?? [])] : config.args,
        env: {
          ...config.env,
          PATH: [nodeDir, config.env?.PATH ?? toolPath()].join(delimiter),
        },
      },
    };
  } catch {
    return failure;
  }
};

let installingChromium: Promise<void> | undefined;

/** Playwright's installer owns the exact revision and its OS-specific cache. */
const installChromium = async (): Promise<void> => {
  const node = resolveBin("node");
  if (!node) {
    throw new Error(
      "Node is required to install this agent's Playwright Chromium."
    );
  }
  const cli = join(
    dirname(Bun.resolveSync("playwright-core/package.json", import.meta.dir)),
    "cli.js"
  );
  const installer = Bun.spawn([node, cli, "install", "chromium"], {
    env: { ...toolEnv(), PLAYWRIGHT_SKIP_BROWSER_GC: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([
    installer.exited,
    new Response(installer.stdout).text(),
    new Response(installer.stderr).text(),
  ]);
  if (code !== 0) {
    throw new Error(
      `Playwright Chromium install failed (exit ${code}): ${(stderr || stdout).trim()}`
    );
  }
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
  if (standalone) {
    const executable = browserExecutable();
    if (!executable) {
      return {
        unavailable:
          "Install a Chromium browser with the command in this machine's capability report.",
      };
    }
    return {
      config: {
        ...launcher.config,
        args: [
          ...(launcher.config.args ?? []).filter(
            (arg) => !arg.startsWith("--executablePath=")
          ),
          `--executablePath=${executable}`,
        ],
      },
    };
  }
  // Source installs retain their pinned Playwright revision. Standalone uses the
  // user's explicitly installed browser; this import is never evaluated there.
  const { chromium } = await import("playwright-core");
  const executable = chromium.executablePath();
  try {
    if (!(await Bun.file(executable).exists())) {
      installingChromium ??= installChromium().finally(() => {
        installingChromium = undefined;
      });
      await installingChromium;
    }
    accessSync(executable, constants.X_OK);
    return {
      config: {
        ...launcher.config,
        args: [
          ...(launcher.config.args ?? []).filter(
            (arg) => !arg.startsWith("--executablePath=")
          ),
          `--executablePath=${executable}`,
        ],
      },
    };
  } catch (error) {
    return { failure: error instanceof Error ? error.message : String(error) };
  }
};
