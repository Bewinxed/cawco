/**
 * `boundary-judge.ts SOCKET HOOK GRACE_S EXEC PREFIX POLICY BUILD`: a
 * workspace's judge, which answers its hook (`boundary.ts` {@link hookScript})
 * for every shell or path-naming tool call of a work item's claude session
 * (`HOOKED_TOOLS`). sessiond holds it beside the boundary, so it outlives the
 * agent; the hook only hands it the call over SOCKET and says what it
 * answered. A process start per call cost the hook a fresh Bun every time,
 * which a loaded Mac takes long to schedule; this one starts once.
 *
 * A shell call (`Bash`, `Monitor`) runs through the CLI's shell prefix, which
 * the CLI applies after its permission rules: the workspace's PREFIX
 * (`boundary.ts` `claudePrefixScript`) runs it inside the boundary. So the
 * judge answers it with no decision, and the CLI's own rules (deny, ask,
 * allow, from every settings source) judge the command as the model wrote
 * it; never `allow`, which would answer an `ask` rule for the person. When
 * the CLI's prefix is not PREFIX (a settings file's `env` emptied it, or the
 * CLI was launched before it had one) the call is refused: it would run
 * outside the boundary. Every other call — the CLI's own file tools, MCP
 * calls — is judged by the workspace's policy (`workspace-judge.ts`, read
 * again for each call, since the agent writes it again as the machine
 * changes): each path it names that the policy refuses refuses the call,
 * with the reason the model reads.
 *
 * It is a plain script on Bun, never a module of cawco: cawco's own start-up
 * took over 30s on a loaded machine. The agent writes this file and the judge
 * beside it into the workspace's state dir, which nothing inside the boundary
 * can write. A binary install runs it on cawco's own runtime
 * (`BUN_BE_BUN=1`), and a checkout runs it on bun. So it imports only Bun's
 * and node's built-ins, and the judge.
 *
 * The wire: the hook sends the call's JSON on one line and its CLI's shell
 * prefix, in hex, on the next; the judge answers `0` and what the hook prints
 * on stdout, or `2` and why the call is refused, and closes. Anything it
 * cannot do answers `2`: a call never runs outside the boundary or the
 * policy.
 *
 * A judge of another form (another build's) is replaced by starting the new
 * one on its own socket and pointing the hook at it. A hook already running
 * still asks this one, so it leaves only once HOOK has not named SOCKET for
 * GRACE_S, the longest a hook lives, and goes with the workspace's state dir.
 */
import { accessSync, constants, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

/** The judge's module; only its type is imported here, which Bun erases. */
type Judge = typeof import("@cawco/core/workspace-judge");

const [socket, hook, graceS, exec, prefix, policyFile, build] =
  process.argv.slice(2);
if (!(socket && hook && graceS && exec && prefix && policyFile && build)) {
  throw new Error(
    "usage: boundary-judge.ts SOCKET HOOK GRACE_S EXEC PREFIX POLICY BUILD"
  );
}

/**
 * The line the agent asks which build this judge runs (boundary.ts
 * `JUDGE_BUILD_QUESTION`), answered `0` and BUILD: the agent's beat checks
 * that every live workspace's judge is its own build's.
 */
const BUILD_QUESTION = "cawco-judge-build";

/** The copy the agent wrote beside this script (`JUDGE_SCRIPT`). */
const { judgeCall, readPolicy } = (await import(
  join(import.meta.dir, "workspace-judge.ts")
)) as Judge;

/** The tools whose command runs through the CLI's shell prefix; every other tool is judged. */
const SHELL_TOOLS = new Set(["Bash", "Monitor"]);

const refuse = (reason: string): string => `2\n${reason}`;

/** What the model reads when its CLI's shell prefix is not the workspace's. */
const UNPREFIXED =
  "cawco: this session's shell commands would run outside the workspace's boundary (CLAUDE_CODE_SHELL_PREFIX is not the workspace's executor), so this call did not run. Say so and end your turn: a session launched before its workspace had that prefix is relaunched with it between turns, and a settings file that sets CLAUDE_CODE_SHELL_PREFIX is the person's to change.";

const HEX = /^(?:[0-9a-f]{2})*$/;

/** The answer to one call, as the hook's JSON input names it, from a CLI whose shell prefix is `shellPrefix` (in hex). */
const answer = (text: string, shellPrefix: string): string => {
  try {
    // The workspace's executor is gone when the workspace was archived.
    accessSync(exec, constants.X_OK);
    const input = JSON.parse(text) as {
      cwd?: unknown;
      tool_input?: Record<string, unknown>;
      tool_name?: unknown;
      transcript_path?: unknown;
    };
    if (typeof input.tool_name !== "string") {
      throw new Error("the call names no tool");
    }
    const call = input.tool_input ?? {};
    if (input.tool_name === "PowerShell") {
      // Its commands are PowerShell's, which the executor's bash cannot run.
      return refuse(
        "cawco: PowerShell does not run in a workspace: its commands would run outside the workspace's boundary. Use Bash."
      );
    }
    if (SHELL_TOOLS.has(input.tool_name)) {
      // Monitor's websocket form runs no command, so there is nothing to bound.
      if (typeof call.command !== "string") {
        return "0\n";
      }
      if (!HEX.test(shellPrefix)) {
        throw new Error("the hook sent no shell prefix");
      }
      // No decision: the CLI's own permission flow goes on, on the command
      // as written, and its prefix runs it inside.
      return Buffer.from(shellPrefix, "hex").toString("utf8") === prefix
        ? "0\n"
        : refuse(UNPREFIXED);
    }
    if (typeof input.cwd !== "string") {
      throw new Error("the call names no working directory");
    }
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
    return verdict.ok ? "0\n" : refuse(verdict.reason);
  } catch (error) {
    return refuse(
      `cawco: this call did not run, because the workspace boundary could not judge it: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

/**
 * What `received` asks, once it holds all of it: the agent's build question
 * on its one line, or a call on its first line with its CLI's shell prefix
 * on the second. Nothing while a line is still to come.
 */
const answerTo = (received: string): string | undefined => {
  const first = received.indexOf("\n");
  if (first < 0) {
    return;
  }
  const call = received.slice(0, first);
  if (call === BUILD_QUESTION) {
    return `0\n${build}`;
  }
  const second = received.indexOf("\n", first + 1);
  return second < 0
    ? undefined
    : answer(call, received.slice(first + 1, second));
};

const server = createServer((connection) => {
  const chunks: Buffer[] = [];
  connection.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
    if (!chunk.includes(10)) {
      return;
    }
    const answered = answerTo(Buffer.concat(chunks).toString("utf8"));
    if (answered === undefined) {
      return;
    }
    connection.removeAllListeners("data");
    connection.end(answered);
  });
  // A hook killed mid-call leaves nothing to answer.
  connection.on("error", () => connection.destroy());
});

rmSync(socket, { force: true });
server.listen(socket, () => {
  console.log("cawco-judge-ready");
});

/** How often the judge looks whether the hook still names it. */
const LOOK_MS = 10_000;
const graceMs = Number(graceS) * 1000;
let unnamedSince: number | undefined;
setInterval(() => {
  let named = false;
  try {
    named = readFileSync(hook, "utf8").includes(socket);
  } catch {
    // The workspace's state dir is gone: so is its hook.
  }
  if (named) {
    unnamedSince = undefined;
    return;
  }
  unnamedSince ??= Date.now();
  if (Date.now() - unnamedSince >= graceMs) {
    server.close();
    rmSync(socket, { force: true });
    process.exit(0);
  }
}, LOOK_MS);
