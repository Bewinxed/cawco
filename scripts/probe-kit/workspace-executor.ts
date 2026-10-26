/**
 * A workspace's real executor and runner as this build writes them (agent
 * boundary.ts `executorUnsandboxed`), stood on the host with no sandbox
 * around them: every command goes in through the executor, its environment
 * built as a boundary's is (`commandEnv`), and runs through the runner. The
 * git-door spec's workspace legs (workspace-gh.ts, workspace-git-quiet.ts)
 * run their commands through it.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { systemProgram } from "../../packages/core/src/workspace-needs";
import type { Kit } from "./kit";

export interface StoodExecutor {
  /** One command through the executor, run in the clone, with `caller` over this process's environment: what it printed. */
  readonly run: (
    command: string,
    caller?: Record<string, string>
  ) => Promise<string>;
  /** The workspace's scratch dir, its commands' `TMPDIR`. */
  readonly scratch: string;
  readonly stop: () => void;
}

/** Stands workspace `id`'s executor over `clone`, its script under `root`; undefined, said as a failed check named by `leg`, when this build has none. */
export const standExecutor = async (
  kit: Kit,
  leg: string,
  at: { clone: string; id: string; root: string }
): Promise<StoodExecutor | undefined> => {
  const boundary = await import("../../packages/agent/src/boundary");
  const stand = (
    boundary as unknown as {
      executorUnsandboxed?: (
        ref: { id: string; path: string },
        gen: string,
        pid: number
      ) => Promise<{
        exec: string;
        fifo: string;
        guarded: string;
        place: string;
        runner: string;
        scratch: string;
      }>;
    }
  ).executorUnsandboxed;
  if (!stand) {
    kit.check(
      `(${leg}) a workspace's executor runs on the host for this leg`,
      false,
      "this build's boundary.ts exports no executorUnsandboxed"
    );
    return;
  }
  const ref = { id: at.id, path: at.clone };
  const gen = "probe";
  const first = await stand(ref, gen, process.pid);
  await mkdir(dirname(first.fifo), { recursive: true });
  await mkdir(dirname(first.place), { recursive: true });
  await mkdir(first.scratch, { recursive: true });
  await Bun.$`rm -f ${first.fifo} && mkfifo ${first.fifo}`.quiet();
  const runner = Bun.spawn(
    [systemProgram("bash"), "-c", first.runner, "cawco", first.fifo],
    { stdout: "pipe", stderr: "inherit" }
  );
  // Ready once it says so.
  const reader = runner.stdout.getReader();
  await reader.read();
  reader.releaseLock();
  const parts = await stand(ref, gen, runner.pid);
  await writeFile(parts.place, `${runner.pid} ${runner.pid}\n`);
  await writeFile(parts.guarded, "");
  const exec = join(at.root, `probe-exec-${leg}`);
  await writeFile(exec, parts.exec);
  await chmod(exec, 0o755);
  return {
    run: async (command, caller = {}) => {
      const ran = await Bun.$`${exec} ${command}`
        .cwd(at.clone)
        .env({ ...process.env, ...caller } as Record<string, string>)
        .quiet()
        .nothrow();
      return `${ran.stdout.toString()}${ran.stderr.toString()}`;
    },
    scratch: parts.scratch,
    stop: () => runner.kill(),
  };
};
