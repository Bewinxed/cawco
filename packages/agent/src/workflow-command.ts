import { spawn } from "node:child_process";
import type { CommandResult } from "@whiffle/core";

/** How much of each stream a result keeps. */
const TAIL = 4000;

/** How long a command runs when its caller names no limit. */
const DEFAULT_TIMEOUT_MS = 300_000;

/**
 * `CONTROL_RUN_COMMAND`: runs `cmd` in `cwd` on this machine, killed with its
 * whole process group after `timeoutMs` (exit 124).
 */
export function runWorkflowCommand(
  cwd: unknown,
  cmd: unknown,
  timeoutMs: unknown
): Promise<CommandResult> {
  if (
    typeof cwd !== "string" ||
    !cwd.startsWith("/") ||
    typeof cmd !== "string" ||
    !cmd.trim()
  ) {
    return Promise.reject(
      new Error(
        "runCommand requires an absolute workspace directory and a command."
      )
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", cmd], {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = Buffer.alloc(0);
    let stdout = "";
    let stderr = "";
    let expired = false;
    child.stdout.on("data", (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]).subarray(-4096);
      stdout = (stdout + chunk.toString("utf8")).slice(-TAIL);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = Buffer.concat([output, chunk]).subarray(-4096);
      stderr = (stderr + chunk.toString("utf8")).slice(-TAIL);
    });
    const timer = setTimeout(
      () => {
        expired = true;
        if (child.pid) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch (error) {
            reject(error);
          }
        }
      },
      typeof timeoutMs === "number" ? timeoutMs : DEFAULT_TIMEOUT_MS
    );
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: expired ? 124 : (code ?? 1),
        output: output.toString("utf8"),
        stdout,
        stderr,
      });
    });
  });
}
