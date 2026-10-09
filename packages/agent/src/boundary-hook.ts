/**
 * `boundary-hook.ts EXEC SCRATCH`: what a workspace's hook script
 * (`boundary.ts`) runs before every shell tool call (`Bash`, `Monitor`) of a
 * work item's claude session. It rewrites the call's command so it runs
 * through the workspace's executor, inside the workspace's boundary. The CLI
 * runs it, not the agent, so it holds while the agent restarts.
 *
 * It is a plain script on Bun, never a module of cawco: cawco's own start-up
 * took over 30s on a loaded machine. The agent writes this file into the
 * workspace's state dir, which nothing inside the boundary can write. A binary
 * install runs it on cawco's own runtime (`BUN_BE_BUN=1`), and a checkout runs
 * it on bun. So it imports only Bun's and node's built-ins.
 *
 * The rewritten command carries the directory the command ended in back out
 * of the boundary and `cd`s there, so the session's working directory still
 * follows its `cd`s from one call to the next. It runs in the CLI's own shell,
 * on the host, so it names `cat` and `rm` by their absolute paths: a `cat`
 * that a workspace put on the session's PATH would run outside the boundary.
 *
 * Anything this cannot do fails it, which the hook script turns into exit 2
 * — the one outcome a hook's output cannot override: a command never runs
 * outside the boundary.
 *
 * argv, after the runtime and the script: the executor, the workspace's
 * scratch dir.
 */
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

try {
  const [exec, scratch] = process.argv.slice(2);
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
    const command = `${quote(exec)} --cwd-out ${ended} ${quote(call.command)}; __cawco_status=$?; if [ -s ${ended} ]; then cd -- "$(/bin/cat ${ended})"; fi; /bin/rm -f ${ended}; (exit $__cawco_status)`;
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
