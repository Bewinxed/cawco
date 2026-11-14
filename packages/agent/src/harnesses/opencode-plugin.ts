/**
 * CawCo's OpenCode 2.0 plugin as the agent writes it for every server it
 * starts: the module is opencode-plugin-module.ts (what it does is told
 * there), bundled whole with the parts of core it shares, and the settings it
 * reads are this machine's paths and CawCo's names ({@link pluginSettings}).
 * The bundle and the settings together are the source its gate form is
 * computed over ({@link gateForm}), and name the directory it is written into
 * ({@link writePlugin}).
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  fleetHarnessSetFile,
  fleetMcpSetFile,
  fleetPlacesDir,
} from "@cawco/core/paths/fleet";
import {
  SPILLS_DIR_NAME,
  WORKSPACE_POLICY_NAME,
  workspacesDir,
} from "@cawco/core/paths/workspace";
import { embeddedFile, standalone } from "@cawco/core/runtime";
import { writeStateFile } from "@cawco/core/state-file";
import { PLACE_SUFFIX } from "@cawco/core/workspace-policy";
import { JUDGE_SCRIPT } from "../boundary/hook-judge";
import { CHROME_DEVTOOLS } from "../browser/door";
import {
  delegationHubUrl,
  harnessMcpUrl,
  OPEN_ITEMS_TOOL,
} from "../delegation";
import { readJsonOrLeave, writeJson } from "../json-file";
import { GATE_PREFIX } from "../mcp-gate";
import { hostKeyFile } from "../mcp-host";
import { MCP_CONNECT_MS } from "../mcp-status";
import { CAWCO_PLUGIN_ID, SEND_NOW_METADATA } from "./opencode-client";
import { opencodeCredentialFile } from "./opencode-credentials";
import type { PluginSettings } from "./opencode-plugin-module";

/**
 * OpenCode's global config dir, the machine profile the fleet sync converges:
 * resolved as OpenCode resolves it (`$XDG_CONFIG_HOME/opencode`).
 */
export const OPENCODE_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "opencode"
);

/**
 * The location the agent's own reads of a server go to (its config sources,
 * its models, its integrations): one where the plugin turns every MCP server
 * off. OpenCode 2.0 boots a location on its first request and connects every
 * MCP server it has there (2.0.29: one `GET /api/config` at the server's own
 * directory started the launch config's stdio server, 2026-10-22), so a read
 * left on the server's own directory, the home, started every fleet server
 * there and left them running.
 */
export const OPENCODE_QUIET_DIR = join(homedir(), ".cawco", "opencode-quiet");

/**
 * The data dir every shell and local MCP server of every server reads as
 * `XDG_DATA_HOME`: the machine's own. An account's server runs on the
 * account's (its own database), which is OpenCode's alone.
 */
const machineDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

/** The plugin's module and the settings it reads, as the files of its directory. */
export interface PluginFiles {
  /** The module, bundled: `index.js`. */
  module: string;
  /** The settings, as JSON: `settings.json`. */
  settings: string;
}

/** What the module takes of this agent that is not a type ({@link PluginSettings}). */
const pluginSettings = (): PluginSettings => ({
  chromeDevtools: CHROME_DEVTOOLS,
  credentialsFile: opencodeCredentialFile(),
  fleetHarnessSet: fleetHarnessSetFile(),
  fleetMcp: fleetMcpSetFile(),
  fleetPlaces: fleetPlacesDir(),
  gatePrefix: GATE_PREFIX,
  hostKeyFile: hostKeyFile(),
  hubBase: harnessMcpUrl(""),
  judgeScript: JUDGE_SCRIPT,
  machineData: machineDataHome(),
  mcpConnectMs: MCP_CONNECT_MS,
  openItemsTool: OPEN_ITEMS_TOOL,
  placeSuffix: PLACE_SUFFIX,
  pluginId: CAWCO_PLUGIN_ID,
  quietDir: OPENCODE_QUIET_DIR,
  sendNowMetadata: SEND_NOW_METADATA,
  spillsDirName: SPILLS_DIR_NAME,
  workspacePolicyName: WORKSPACE_POLICY_NAME,
  workspaces: workspacesDir(),
});

/** The module's source file in a checkout. */
const MODULE_SOURCE = join(import.meta.dir, "opencode-plugin-module.ts");

/**
 * The module bundled, as this build runs it: the bundle the binary embedded
 * (scripts/build-binary.ts), or the checkout's source bundled now, once.
 */
const moduleBundle = async (): Promise<string> => {
  if (standalone) {
    return await Bun.file(embeddedFile("opencode/plugin.js")).text();
  }
  const built = await Bun.build({
    entrypoints: [MODULE_SOURCE],
    target: "bun",
    format: "esm",
  });
  if (!built.success || built.outputs.length !== 1) {
    throw new Error(
      `CawCo's OpenCode plugin did not bundle: ${built.logs.join("; ")}`
    );
  }
  return await built.outputs[0].text();
};

let pluginBuild: Promise<PluginFiles> | undefined;

/** The plugin's files as every server on this machine loads them, built once per process. */
export const buildPlugin = (): Promise<PluginFiles> => {
  pluginBuild ??= moduleBundle().then((module) => ({
    module,
    settings: JSON.stringify(pluginSettings()),
  }));
  return pluginBuild;
};

/** The plugin's files as one string: what its gate form and its directory's name are computed over. */
export const pluginSource = ({ module, settings }: PluginFiles): string =>
  `${module}\0${settings}`;

/** The dir every version of the plugin is written into, one per hub this agent serves. */
const pluginsDir = (): string =>
  join(
    homedir(),
    ".cawco",
    "hub-opencode",
    new URL(delegationHubUrl()).host.replaceAll(":", "_"),
    "plugin"
  );

const PLUGIN_VERSION_DIR = /^cawco-context-[0-9a-f]{16}$/u;

/**
 * The plugin written as a directory named for its source, and its path: a
 * server is launched on one version and keeps it (a later version is a new
 * directory, so a running server's files never change under it).
 */
export const writePlugin = async (files: PluginFiles): Promise<string> => {
  const target = join(
    pluginsDir(),
    `cawco-context-${createHash("sha256").update(pluginSource(files)).digest("hex").slice(0, 16)}`
  );
  // `index.js` last, each whole: one there means the plugin is whole.
  if (!existsSync(join(target, "index.js"))) {
    await writeStateFile(join(target, "settings.json"), files.settings);
    await writeStateFile(
      join(target, "package.json"),
      JSON.stringify({
        name: "cawco-context",
        private: true,
        type: "module",
        main: "./index.js",
      })
    );
    await writeStateFile(join(target, "index.js"), files.module);
  }
  return target;
};

/** Every plugin version but those `kept` names (the current one and those live servers run), removed. */
export const prunePlugins = async (
  kept: ReadonlySet<string>
): Promise<void> => {
  const dir = pluginsDir();
  const versions = (await readdir(dir).catch(() => [] as string[])).filter(
    (name) => PLUGIN_VERSION_DIR.test(name) && !kept.has(join(dir, name))
  );
  await Promise.all(
    versions.map((name) =>
      rm(join(dir, name), { recursive: true, force: true })
    )
  );
};

/** 1.x's generated bridge plugin files (`cawco-context-<hash>.js`, `cockpit-handoff.js`). */
const V1_BRIDGE =
  /^(?:cawco-(?:handoff|context)(?:-[a-f0-9]+)?|cockpit-handoff)\.js(?:\.disabled-\d+)?$/u;

/**
 * What 1.x's bridge left in OpenCode's global config dir, gone: its plugin
 * files in `plugins/`, and the entries naming them in `opencode.json`'s
 * `plugin` list. 2.0 reads that list too, and would try each and warn.
 */
export const retireV1Plugins = async (
  directory = OPENCODE_DIR
): Promise<void> => {
  const plugins = join(directory, "plugins");
  const files = (await readdir(plugins).catch(() => [] as string[])).filter(
    (file) => V1_BRIDGE.test(file)
  );
  await Promise.all(
    files.map((file) => rm(join(plugins, file), { force: true }))
  );
  const configPath = join(directory, "opencode.json");
  const config = await readJsonOrLeave<Record<string, unknown>>(
    configPath,
    "taking OpenCode 1.x's CawCo plugin out of it"
  );
  if (Array.isArray(config?.plugin)) {
    const kept = config.plugin.filter(
      (entry) =>
        typeof entry !== "string" ||
        !V1_BRIDGE.test(entry.split("/").pop() ?? "")
    );
    if (kept.length !== config.plugin.length) {
      const { plugin: _plugin, ...rest } = config;
      await writeJson(
        configPath,
        kept.length > 0 ? { ...rest, plugin: kept } : rest
      );
    }
  }
};
