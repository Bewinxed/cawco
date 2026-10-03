import { accessSync, constants, readFileSync, realpathSync } from "node:fs";
import { platform } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { chromium } from "playwright-core";
import { resolveBin, toolEnv, toolPath } from "./tools";

/** npx belongs to the Node installation, never a same-named PATH shim. */
export const resolveMcpLauncher = (
  config: FleetMcpConfig
): { config: FleetMcpConfig } | { failure: string } => {
  if (
    "url" in config ||
    !["npx", "npx.cmd"].includes(basename(config.command))
  ) {
    return { config };
  }
  const node = resolveBin("node");
  const failure = {
    failure: `npm's npx is missing or invalid beside this machine's Node (${node ?? "not installed"}). Install npm with that Node; non-npm npx shims cannot run fleet MCP servers.`,
  };
  if (!node) {
    return failure;
  }
  const nodeDir = dirname(node);
  const windows = platform() === "win32";
  const npx = join(nodeDir, windows ? "npx.cmd" : "npx");
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
): Promise<{ config: FleetMcpConfig } | { failure: string }> => {
  const launcher = resolveMcpLauncher(config);
  if (
    "failure" in launcher ||
    name !== "chrome-devtools" ||
    "url" in launcher.config
  ) {
    return launcher;
  }
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
