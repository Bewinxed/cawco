/**
 * `cawco boundary-hook EXEC SCRATCH`: what a workspace's hook script
 * (`boundary.ts`) runs before every shell tool call (`Bash`, `Monitor`) of a
 * work item's claude session. It rewrites the call's command so it runs
 * through the workspace's executor, inside the workspace's boundary. The CLI
 * runs it, not the agent, so it holds while the agent restarts.
 *
 * The rewritten command carries the directory the command ended in back out
 * of the boundary and `cd`s there, so the session's working directory still
 * follows its `cd`s from one call to the next.
 *
 * Anything this cannot do fails it, which the hook script turns into exit 2
 * — the one outcome a hook's output cannot override: a command never runs
 * outside the boundary.
 *
 * argv, after the runtime's own two and the verb: the executor, the
 * workspace's scratch dir. The same three in a binary install and a checkout,
 * where `bun packages/cli/src/cli.ts boundary-hook` runs it.
 */
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

try {
  const [exec, scratch] = process.argv.slice(3);
  if (!(exec && scratch)) {
    throw new Error("the hook was registered without its executor");
  }
  // The workspace's executor is gone when the workspace was archived.
  accessSync(exec, constants.X_OK);
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
