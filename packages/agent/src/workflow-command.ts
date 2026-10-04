import { spawn } from "node:child_process";
import type { CommandResult, WorkspaceRef } from "@cawco/core";
import { ensureBoundary } from "./boundary";
import { withRestartHold } from "./restart";

/** The most a command may write, stdout and stderr together, in bytes. */
const OUTPUT_LIMIT = 8 * 1024 * 1024;

/** How long a command runs when its caller names no limit. */
const DEFAULT_TIMEOUT_MS = 300_000;

/** The process group of every command still running, by its leader's pid. */
const live = new Set<number>();

/**
 * The hub connection ended: nobody is left to receive what the running
 * commands answer, and the hub runs a check again from the first when it is
 * back. Every live command is killed with its process group; each resolves
 * through its own `close`, as a timed-out one does.
 */
export function abandonCommands(): void {
  if (live.size === 0) {
    return;
  }
  const count = live.size;
  for (const pid of live) {
    process.kill(-pid, "SIGKILL");
  }
  console.log(`abandoned ${count} command(s): hub connection ended`);
}

/** Whether `value` names a delegation workspace: an id and an absolute clone path. */
const isWorkspaceRef = (value: unknown): value is WorkspaceRef =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as WorkspaceRef).id === "string" &&
  typeof (value as WorkspaceRef).path === "string" &&
  (value as WorkspaceRef).path.startsWith("/");

/**
 * `CONTROL_RUN_COMMAND`: runs `cmd` in `cwd` on this machine, killed with its
 * whole process group after `timeoutMs` (exit 124). Answers complete stdout
 * and complete stderr; a command that writes more than {@link OUTPUT_LIMIT}
 * bytes across both is killed the same way and rejects.
 *
 * Given a `workspace`, the command runs inside that workspace's boundary,
 * through the executor its sessions' shell commands run through: the same
 * mounts, the same private `/tmp`, the same pid namespace. A boundary this
 * machine cannot start rejects with its reason; the command never runs
 * outside it.
 */
export async function runWorkflowCommand(
  cwd: unknown,
  cmd: unknown,
  timeoutMs: unknown,
  workspace?: unknown
): Promise<CommandResult> {
  if (
    typeof cwd !== "string" ||
    !cwd.startsWith("/") ||
    typeof cmd !== "string" ||
    !cmd.trim()
  ) {
    throw new Error(
      "runCommand requires an absolute workspace directory and a command."
    );
  }
  // An absent workspace crosses the wire as null.
  if ((workspace ?? undefined) !== undefined && !isWorkspaceRef(workspace)) {
    throw new Error("runCommand's workspace must be { id, path }.");
  }
  const [file, args] = isWorkspaceRef(workspace)
    ? [(await ensureBoundary(workspace)).exec, [cmd]]
    : ["/bin/sh", ["-c", cmd]];
  return withRestartHold(
    "command",
    String(cmd),
    () =>
      new Promise((resolve, reject) => {
        const child = spawn(file, args, {
          cwd,
          detached: true,
          // The executor enters the boundary in `$PWD`: it names `cwd`.
          env: { ...process.env, PWD: cwd },
          stdio: ["ignore", "pipe", "pipe"],
        });
        const { pid } = child;
        if (pid) {
          live.add(pid);
        }
        const stdout: Buffer[] = [];
        const stderr: Buffer[] = [];
        let written = 0;
        let expired = false;
        let overflowed = false;
        const killGroup = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch (error) {
              reject(error);
            }
          }
        };
        const collect = (into: Buffer[]) => (chunk: Buffer) => {
          if (overflowed) {
            return;
          }
          written += chunk.length;
          if (written > OUTPUT_LIMIT) {
            overflowed = true;
            stdout.length = 0;
            stderr.length = 0;
            killGroup();
            reject(
              new Error(
                `Command output passed ${OUTPUT_LIMIT} bytes: ${cmd.slice(0, 200)}`
              )
            );
            return;
          }
          into.push(chunk);
        };
        child.stdout.on("data", collect(stdout));
        child.stderr.on("data", collect(stderr));
        const timer = setTimeout(
          () => {
            expired = true;
            killGroup();
          },
          typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS
        );
        child.on("error", (error) => {
          clearTimeout(timer);
          if (pid) {
            live.delete(pid);
          }
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          if (pid) {
            live.delete(pid);
          }
          if (overflowed) {
            return;
          }
          resolve({
            exitCode: expired ? 124 : (code ?? 1),
            stdout: Buffer.concat(stdout).toString("utf8"),
            stderr: Buffer.concat(stderr).toString("utf8"),
          });
        });
      })
  );
}
