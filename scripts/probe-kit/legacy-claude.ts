/**
 * A workspace's Claude Code as the last build before the shell prefix
 * ({@link BEFORE_PREFIX}) launched it, for the specs that prove a CLI that
 * build launched goes on across the update to this one (claude-prefix p14,
 * workspace-bash-rules w9): the hook of this build's
 * `claudeBoundaryOptions` (agent boundary.ts), on the same tools, in that
 * build's shell form, `'<hook>' || exit 2`. Its environment names no
 * `CLAUDE_CODE_SHELL_PREFIX`: the caller leaves it out.
 */
import type { Boundary } from "../../packages/agent/src/boundary";

/** The last build before the prefix, whose judge rewrote every shell call through the executor. */
export const BEFORE_PREFIX = "cad636299^";

/** The `query()` options of a session in `boundary`, as {@link BEFORE_PREFIX} launched one. */
export const legacyClaudeOptions = async (boundary: Boundary) => {
  // Loaded when asked: a spec sets the HOME its paths read first.
  const { claudeBoundaryOptions } =
    await import("../../packages/agent/src/boundary");
  const bounded = claudeBoundaryOptions(boundary);
  const [entry] = bounded.settings?.hooks.PreToolUse ?? [];
  if (!(bounded.settings && entry)) {
    throw new Error("the boundary's options name no hook");
  }
  return {
    ...bounded,
    settings: {
      ...bounded.settings,
      hooks: {
        PreToolUse: [
          {
            matcher: entry.matcher,
            hooks: [
              {
                type: "command" as const,
                command: `'${boundary.hook}' || exit 2`,
                timeout: entry.hooks[0]?.timeout,
              },
            ],
          },
        ],
      },
    },
  };
};
