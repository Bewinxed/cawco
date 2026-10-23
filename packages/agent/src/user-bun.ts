/**
 * The machine's own bun: the one its person's shell runs. Every Bun CawCo
 * runs against a person's project or workspace is this one, never the
 * runtime a binary install embeds (boundary.ts `bunScriptRuntime`, which only
 * CawCo's own scripts run on).
 *
 * It is the first `bun` on the agent's `PATH`. That PATH is the installing
 * shell's: the service unit (systemd) or plist (launchd) records it (cli
 * service.ts `fromShell`), and every session's shell, every boundary command
 * and every landing gate step inherits it from the agent (core
 * session-env.ts). So a workspace's `bun install`, a gate's `bun run …`, the
 * `--bun` node shim (bun-node-shim.ts) and a sheet's stage host (stage.ts)
 * all run the same bun, on Linux and macOS, for Claude Code, OpenCode and pi
 * alike. A machine with none starts none of them, and each says so: a
 * sheet's stage in core `sheetWords.noBun`, a stage clone's install by its
 * manager (stage-clone.ts `NO_MANAGER`), a session's or gate step's `bun` as
 * its shell does (`bun: command not found`, exit 127).
 */

/** The absolute path of the machine's own bun, or nothing where its PATH has none. */
export const userBun = (): string | undefined => Bun.which("bun") ?? undefined;
