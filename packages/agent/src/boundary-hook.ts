/**
 * `boundary-hook.ts EXEC SCRATCH POLICY`: what a workspace's hook script
 * (`boundary.ts`) runs before every tool call of a work item's claude
 * session. A shell call (`Bash`, `Monitor`) gets its command rewritten so it
 * runs through the workspace's executor, inside the workspace's boundary.
 * Every other call — the CLI's own file tools, MCP calls — is judged by the
 * workspace's policy (`workspace-judge.ts`): each path it names that the
 * policy refuses refuses the call, with the reason the model reads. The CLI
 * runs it, not the agent, so it holds while the agent restarts or is stopped.
 *
 * It is a plain script on Bun, never a module of cawco: cawco's own start-up
 * took over 30s on a loaded machine. The agent writes this file and the judge
 * beside it into the workspace's state dir, which nothing inside the boundary
 * can write. A binary install runs it on cawco's own runtime
 * (`BUN_BE_BUN=1`), and a checkout runs it on bun. So it imports only Bun's
 * and node's built-ins, and the judge.
 *
 * The rewritten command carries the directory the command ended in back out
 * of the boundary and `cd`s there, so the session's working directory still
 * follows its `cd`s from one call to the next. It runs in the CLI's own shell,
 * on the host, so it names `cat` and `rm` by their absolute paths: a `cat`
 * that a workspace put on the session's PATH would run outside the boundary.
 *
 * Anything this cannot do fails it, which the hook script turns into exit 2
 * — the one outcome a hook's output cannot override: a call never runs
 * outside the boundary or the policy.
 *
 * argv, after the runtime and the script: the executor, the workspace's
 * scratch dir, the workspace's policy file.
 */
import { randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";

/** The judge's module; only its type is imported here, which Bun erases. */
type Judge = typeof import("@cawco/core/workspace-judge");

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** The tools whose command runs through the executor; every other tool is judged. */
const SHELL_TOOLS = new Set(["Bash", "Monitor"]);

try {
  const [exec, scratch, policyFile] = process.argv.slice(2);
  if (!(exec && scratch && policyFile)) {
    throw new Error("the hook was registered without its executor and policy");
  }
  // The workspace's executor is gone when the workspace was archived.
  accessSync(exec, constants.X_OK);
  const input = JSON.parse(await Bun.stdin.text()) as {
    cwd?: unknown;
    tool_input?: Record<string, unknown>;
    tool_name?: unknown;
    transcript_path?: unknown;
  };
  if (typeof input.tool_name !== "string") {
    throw new Error("the call names no tool");
  }
  const call = input.tool_input ?? {};
  if (SHELL_TOOLS.has(input.tool_name)) {
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
  } else {
    if (typeof input.cwd !== "string") {
      throw new Error("the call names no working directory");
    }
    // The copy the agent wrote beside this script (`JUDGE_SCRIPT`).
    const { judgeCall, readPolicy } = (await import(
      join(import.meta.dir, "workspace-judge.ts")
    )) as Judge;
    const verdict = judgeCall(readPolicy(policyFile), {
      harness: "claude",
      tool: input.tool_name,
      input: call,
      cwd: input.cwd,
      transcript:
        typeof input.transcript_path === "string"
          ? input.transcript_path
          : undefined,
    });
    if (!verdict.ok) {
      console.error(verdict.reason);
      process.exit(2);
    }
  }
} catch (error) {
  console.error(
    `cawco: this call did not run, because the workspace boundary could not judge it: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(2);
}
