/**
 * A Claude session's MCP servers, kept off its command line.
 *
 * The Agent SDK hands the CLI its `mcpServers` as inline JSON on argv
 * (`--mcp-config <json>`, or `--mcp-config=<json>` for a value that starts
 * with a dash: `p_` in sdk.mjs 0.3.296), and CawCo's server in it carries the
 * session's bearer (`headers.Authorization`). Anything on argv is
 * `/proc/<pid>/cmdline` and `ps` to every local user. The CLI takes a file in
 * its place: "--mcp-config <configs...>  Load MCP servers from JSON files or
 * strings (space-separated)" (`claude --help`, 2.1.296).
 *
 * So the JSON goes to a file named for the launch in {@link
 * claudeMcpConfigDir}: a directory of the agent's private credentials
 * ({@link sessionIdentityDir}), owner-only, and one every workspace boundary
 * hides from the commands it runs. The file lives as long as the child: it is
 * removed when the child exits, and an agent's first look at sessiond removes
 * any left by children that are gone ({@link sweepMcpConfigs}).
 */
import { randomUUID } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths";

const MCP_CONFIG_FLAG = "--mcp-config";
const INLINE_FLAG = `${MCP_CONFIG_FLAG}=`;

/** An instance id as a file name can carry it: a UUID's characters, no path. */
const FILE_SAFE_ID = /^[A-Za-z0-9-]+$/;

/** Where Claude sessions' MCP configs are kept: owner-only, hidden from every workspace. */
export const claudeMcpConfigDir = (): string =>
  join(sessionIdentityDir(), "claude-mcp");

/** The instance a config file was written for: its name is `<instanceId>.<launch>.json`. */
const instanceOf = (name: string): string | undefined => {
  const [instanceId, launch, extension, ...rest] = name.split(".");
  return launch && extension === "json" && rest.length === 0
    ? instanceId
    : undefined;
};

/** Whether a `--mcp-config` value is the JSON itself rather than a file's path. */
const inline = (value: string): boolean => value.trimStart().startsWith("{");

/**
 * `args` with the inline `--mcp-config` JSON written to a file of its own and
 * the flag given that file's path: the launch's command line, safe to show.
 * Both forms the SDK writes are read. `credential`, when the session has one,
 * must appear nowhere in what is returned: a launch that would still carry it
 * is refused.
 */
export const mcpConfigOffArgv = (
  instanceId: string,
  args: readonly string[],
  credential: string | undefined
): { args: string[]; file: string | undefined } => {
  if (!FILE_SAFE_ID.test(instanceId)) {
    throw new Error(
      `Instance id ${JSON.stringify(instanceId)} cannot name an MCP config file.`
    );
  }
  const rewritten = [...args];
  const found: { at: number; json: string; joined: boolean }[] = [];
  for (let at = 0; at < rewritten.length; at += 1) {
    const arg = rewritten[at];
    if (arg === MCP_CONFIG_FLAG && at + 1 < rewritten.length) {
      if (inline(rewritten[at + 1])) {
        found.push({ at: at + 1, json: rewritten[at + 1], joined: false });
      }
      at += 1;
    } else if (
      arg.startsWith(INLINE_FLAG) &&
      inline(arg.slice(INLINE_FLAG.length))
    ) {
      found.push({ at, json: arg.slice(INLINE_FLAG.length), joined: true });
    }
  }
  if (found.length > 1) {
    throw new Error(
      `The Claude launch carries ${found.length} inline --mcp-config values; the SDK writes one.`
    );
  }
  let file: string | undefined;
  const [config] = found;
  if (config) {
    const dir = claudeMcpConfigDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
    file = join(dir, `${instanceId}.${randomUUID()}.json`);
    const staged = `${file}.tmp`;
    writeFileSync(staged, config.json, { mode: 0o600, flag: "wx" });
    renameSync(staged, file);
    rewritten[config.at] = config.joined ? `${INLINE_FLAG}${file}` : file;
  }
  if (credential && rewritten.some((arg) => arg.includes(credential))) {
    if (file) {
      rmSync(file, { force: true });
    }
    throw new Error(
      "The Claude launch would carry its CawCo session credential on its command line; it was not started."
    );
  }
  return { args: rewritten, file };
};

/** Removes one launch's config file; a file already gone is the end asked for. */
export const removeMcpConfig = (file: string): void => {
  try {
    rmSync(file, { force: true });
  } catch (error) {
    console.warn(
      `[claude] could not remove MCP config ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/** Removes every config file written before `before` whose instance `stale` says so. */
const removeWrittenBefore = (
  before: number,
  stale: (instanceId: string) => boolean
): void => {
  const dir = claudeMcpConfigDir();
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const name of names) {
    // A staged file (`….json.tmp`) is its launch's, as the file it becomes.
    const instanceId = instanceOf(
      name.endsWith(".tmp") ? name.slice(0, -".tmp".length) : name
    );
    if (!(instanceId && stale(instanceId))) {
      continue;
    }
    const file = join(dir, name);
    let written: number;
    try {
      written = statSync(file).mtimeMs;
    } catch {
      continue;
    }
    if (written < before) {
      removeMcpConfig(file);
    }
  }
};

/**
 * At an agent's first look at sessiond: the config files of every instance
 * with no live child there. Only those written before this agent started: a
 * launch another agent on this machine is making now keeps its file.
 */
export const sweepMcpConfigs = (alive: ReadonlySet<string>): void =>
  removeWrittenBefore(
    performance.timeOrigin,
    (instanceId) => !alive.has(instanceId)
  );

/**
 * An attached child has exited: its instance's config files written before
 * the attach. A relaunch under the same instance writes its own file after
 * the attach, and keeps it.
 */
export const removeMcpConfigsOf = (instanceId: string, before: number): void =>
  removeWrittenBefore(before, (one) => one === instanceId);
