/**
 * The PreToolUse hook a work item's claude session runs before every shell
 * tool call (`Bash`, `Monitor`; `boundary.ts` registers it as flag settings):
 * it rewrites the call's command so it runs through the workspace's executor,
 * inside the workspace's boundary. The CLI runs it, not the agent, so it holds
 * while the agent restarts.
 *
 * The rewritten command carries the directory the command ended in back out
 * of the boundary and `cd`s there, so the session's working directory still
 * follows its `cd`s from one call to the next.
 *
 * Anything this cannot do blocks the call (exit 2 — the one outcome a hook's
 * output cannot override): a command never runs outside the boundary.
 *
 * argv: the executor, the workspace's scratch dir.
 */
import { randomUUID } from "node:crypto";
import { join } from "node:path";

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

try {
  const [exec, scratch] = process.argv.slice(2);
  if (!(exec && scratch)) {
    throw new Error("the hook was registered without its executor");
  }
  const input = JSON.parse(await Bun.stdin.text()) as {
    tool_input?: Record<string, unknown>;
  };
  const call = input.tool_input ?? {};
  // Monitor's websocket form runs no command, so there is nothing to bound.
  if (typeof call.command === "string") {
    const ended = quote(join(scratch, `.cwd-${randomUUID()}`));
    const command = `${quote(exec)} --cwd-out ${ended} ${quote(call.command)}; __cawco_status=$?; if [ -s ${ended} ]; then cd -- "$(cat ${ended})"; fi; rm -f ${ended}; (exit $__cawco_status)`;
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: { ...call, command },
        },
      })
    );
  }
} catch (error) {
  console.error(
    `cawco: this command did not run, because the workspace boundary could not wrap it: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(2);
}
