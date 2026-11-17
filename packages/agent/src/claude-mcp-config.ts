/**
 * The MCP config files Claude sessions were launched with before their
 * servers went in the initialize request, and the guard that keeps the
 * session's bearer off the command line.
 *
 * CawCo's MCP server carries the session's bearer (`headers.Authorization`),
 * and anything on argv is `/proc/<pid>/cmdline` and `ps` to every local user.
 * A session's servers now reach Claude Code over stdin, in the initialize
 * request (harnesses/claude.ts, `mcpServersDelivery: "initialize"`), and a
 * launch whose command line would carry the bearer anyway is refused
 * ({@link refuseCredentialOnArgv}).
 *
 * Before that, the SDK put them on argv as inline JSON (`--mcp-config
 * <json>`), and CawCo moved that JSON to a file named
 * `<instanceId>.<launch>.json` in {@link claudeMcpConfigDir}: owner-only, and
 * hidden from every workspace. A child launched that way may outlive the
 * agent that launched it; its file is removed when it ends ({@link
 * removeMcpConfigsOf}) or at an agent's first look at sessiond once it is
 * gone ({@link sweepMcpConfigs}).
 */
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { sessionIdentityDir } from "@cawco/core/paths/cawco";
import { stateTemporaryTarget } from "@cawco/core/state-file";

/** Where Claude sessions' MCP configs were kept: owner-only, hidden from every workspace. */
const claudeMcpConfigDir = (): string =>
  join(sessionIdentityDir(), "claude-mcp");

/** The instance a config file was written for: its name is `<instanceId>.<launch>.json`. */
const instanceOf = (name: string): string | undefined => {
  const [instanceId, launch, extension, ...rest] = name.split(".");
  return launch && extension === "json" && rest.length === 0
    ? instanceId
    : undefined;
};

/**
 * Refuses a launch whose command line carries `credential`, the session's
 * CawCo bearer, when it has one.
 */
export const refuseCredentialOnArgv = (
  args: readonly string[],
  credential: string | undefined
): void => {
  if (credential && args.some((arg) => arg.includes(credential))) {
    throw new Error(
      "The Claude launch would carry its CawCo session credential on its command line; it was not started."
    );
  }
};

/** Removes one launch's config file; a file already gone is the end asked for. */
const removeMcpConfig = (file: string): void => {
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
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  for (const name of names) {
    // A staged file is its launch's, as the file it becomes.
    const instanceId = instanceOf(stateTemporaryTarget(name) ?? name);
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
