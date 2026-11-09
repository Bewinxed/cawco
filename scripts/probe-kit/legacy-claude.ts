import type { Boundary } from "../../packages/agent/src/boundary/state";

/** The last build before the prefix, whose judge rewrote every shell call through the executor. */
export const BEFORE_PREFIX = "cad636299^";

/** The `query()` options of a session in `boundary`, as {@link BEFORE_PREFIX} launched one. */
export const legacyClaudeOptions = async (boundary: Boundary) => {
  // Loaded when asked: a spec sets the HOME its paths read first.
  const { claudeBoundaryOptions } =
    await import("../../packages/agent/src/boundary/launched-hook");
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
