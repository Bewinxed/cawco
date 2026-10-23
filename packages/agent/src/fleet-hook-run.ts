/**
 * The fleet's command hooks, run by CawCo for a harness with no hooks of its
 * own (pi's inline extension, pi-runtime.ts `FleetHooks`), as Claude Code
 * runs one: its event's JSON on stdin (code.claude.com/docs/en/hooks,
 * "Hook input"), `CLAUDE_PROJECT_DIR` naming the session's folder, Claude
 * Code's tool names (core `hookToolCall`), its timeout or ten minutes, and
 * its exit and output read as Claude Code reads them (core `hookVerdict`).
 * In a workspace each runs inside the boundary, through the shell prefix
 * every shell-form hook of its Claude Code sessions runs through
 * (boundary.ts `claudePrefixScript`), whose stdin reaches the command.
 * CawCo's OpenCode plugin runs the same steps in its own source
 * (opencode-plugin.ts), which loads no module of the agent's.
 */
import { spawn } from "node:child_process";
import {
  type HookCommandHandler,
  type HookEvent,
  type HookHarness,
  type HookVerdict,
  hookTestPasses,
  hookUnsupported,
  hookVerdict,
} from "@cawco/core";
import { sessionEnvironment } from "@cawco/core/session-env";
import { type Boundary, shellQuote } from "./boundary";
import type { SetHook } from "./fleet-harness-set";

/** Claude Code's own default for a command hook: "`command`, `http`, `mcp_tool`: 10 minutes" (code.claude.com/docs/en/hooks-guide). */
const DEFAULT_TIMEOUT_S = 600;

/** A handler's command line: its exec form quoted word by word, else its shell form as written. */
const commandLine = (handler: HookCommandHandler): string =>
  handler.args?.length
    ? [handler.command ?? "", ...handler.args].map(shellQuote).join(" ")
    : (handler.command ?? "");

/** What one command hook's run printed and how it ended; `exit` null when it was killed. */
interface Ran {
  exit: number | null;
  stderr: string;
  stdout: string;
}

/** Where and how a session's hooks run. */
export interface HookPlace {
  /** The workspace's boundary, when the session runs in one: each hook runs inside it. */
  boundary?: Boundary;
  cwd: string;
  /** The session's abort: a hook still running when it fires is ended. */
  signal?: AbortSignal;
}

/** One command hook run with `input` on its stdin. */
const runCommand = (
  handler: HookCommandHandler,
  input: string,
  place: HookPlace
): Promise<Ran> =>
  new Promise((resolve) => {
    const line = commandLine(handler);
    const [file, ...args] = place.boundary
      ? [place.boundary.prefix, line]
      : ["bash", "-c", line];
    const child = spawn(file as string, args, {
      cwd: place.cwd,
      env: {
        ...sessionEnvironment(process.env),
        CLAUDE_PROJECT_DIR: place.cwd,
      },
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    // Its own group (`detached`): the timeout and the session's abort end
    // what it started too.
    const stop = () => {
      const { pid } = child;
      if (pid !== undefined && pid > 1) {
        try {
          process.kill(-pid, "SIGKILL");
        } catch {
          // Already gone.
        }
      }
    };
    const timer = setTimeout(
      stop,
      (handler.timeout ?? DEFAULT_TIMEOUT_S) * 1000
    );
    place.signal?.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      stderr += String(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      place.signal?.removeEventListener("abort", stop);
      resolve({ exit: code, stdout, stderr });
    });
    child.stdin.on("error", () => {
      // A hook that reads none of its input closes stdin early.
    });
    child.stdin.end(input);
  });

/**
 * Every hook of `event` that `harness` takes, of `hooks`, whose matcher
 * passes `match` (a tool's Claude Code name, a session start's source; none
 * for an event with no matcher), run at once with `input` (the event's JSON
 * after its common fields), as Claude Code runs matching hooks "in
 * parallel". Their verdicts joined: any block blocks, with every reason; an
 * `async` hook runs on and gives none. A hook that failed to start or ended
 * other than 0 or 2 is said on the log and blocks nothing.
 */
export const runFleetHooks = async (
  harness: HookHarness,
  hooks: readonly SetHook[],
  event: HookEvent,
  match: string | undefined,
  input: Record<string, unknown>,
  place: HookPlace & { sessionId: string }
): Promise<HookVerdict> => {
  const due = hooks.filter(
    (hook) =>
      hook.event === event &&
      !hookUnsupported(harness, hook) &&
      (match === undefined || hookTestPasses(hook.test, match))
  );
  if (due.length === 0) {
    return {};
  }
  const stdin = JSON.stringify({
    session_id: place.sessionId,
    transcript_path: "",
    cwd: place.cwd,
    hook_event_name: event,
    ...input,
  });
  const verdicts = await Promise.all(
    due.map(async (hook): Promise<HookVerdict> => {
      const handler = hook.handler as HookCommandHandler;
      const running = runCommand(handler, stdin, place);
      if (handler.async) {
        running.catch(() => undefined);
        return {};
      }
      const ran = await running;
      if (ran.exit !== 0 && ran.exit !== 2) {
        console.warn(
          `[${harness}] fleet hook ${hook.name} on ${event} ended ${ran.exit ?? "killed"}: ${ran.stderr.trim().slice(-400)}`
        );
      }
      return hookVerdict(event, ran);
    })
  );
  const blocks = verdicts.flatMap((one) => (one.block ? [one.block] : []));
  const contexts = verdicts.flatMap((one) =>
    one.context ? [one.context] : []
  );
  return {
    ...(blocks.length > 0 ? { block: blocks.join("\n") } : {}),
    ...(contexts.length > 0 ? { context: contexts.join("\n\n") } : {}),
  };
};
