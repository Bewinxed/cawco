import { posix } from "node:path";
import type { CommandResult } from "@cawco/core/commands/controls";
import { ElysiaStatus, problem } from "elysia";
import type { DbShape } from "./db";
import { onAccountMachines } from "./placement";
import { listFolder, projectRoot } from "./project-folder";

/**
 * What {@link createLeadHome} reads of the hub, each member said off its own
 * module: caw.ts types its dep from `createLeadHome`, so this file names
 * nothing that reaches caw.ts (hub-context.ts and closure-context.ts do).
 */
export interface LeadHomeContext {
  db: Pick<DbShape, "accounts" | "project">;
  machineName: (machineId: string) => string;
  onlineMachines: () => string[];
  ownMachineId: Promise<string>;
  runOnMachine: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
}

/** Caw's own folder for a project, under a machine's home ({@link createLeadHome}). */
const cawHome = (projectId: string): string =>
  posix.join(".cawco", "caw", projectId);

/**
 * Where a project's Caw starts before any checkout of it is online (D2):
 * its folder on the hub, on the hub's machine, when that machine runs an
 * agent; else `~/.cawco/caw/<projectId>`, made on the first machine that is
 * online. Undefined while no machine is. Among the machines where the
 * project's account is signed in, when any is (placement.ts
 * `onAccountMachines`). The folder's problem for the hub's folder, and a
 * machine that does not say where its home is.
 */
export const createLeadHome =
  (ctx: LeadHomeContext) => async (projectId: string) => {
    const machines = onAccountMachines(
      ctx.onlineMachines().map((id) => ({ machineId: id })),
      ctx.db.project(projectId)?.inEffect.account.value,
      ctx.db.accounts.signins()
    ).map((one) => one.machineId);
    const own = await ctx.ownMachineId;
    const hubMachine = machines.find((id) => id === own);
    if (hubMachine) {
      // Made and committed on first use, as every read of it does.
      const made = await listFolder(projectId);
      if (made instanceof ElysiaStatus) {
        return made;
      }
      const cwd = projectRoot(projectId);
      return cwd instanceof ElysiaStatus ? cwd : { machineId: hubMachine, cwd };
    }
    const [machineId] = machines;
    if (!machineId) {
      return;
    }
    // The machine's home, so the session's row names a real path; the spawn
    // makes the folder (the agent's `#workdir`).
    const home = await ctx.runOnMachine(
      machineId,
      "/",
      'printf %s "$HOME"',
      15_000
    );
    const path = home.stdout.trim();
    if (home.exitCode !== 0 || !path.startsWith("/")) {
      return problem(502, {
        code: "caw-home-unsaid",
        detail: `${ctx.machineName(machineId)} did not say where its home folder is, so Caw has no folder there: ${home.stderr.trim() || `exit ${home.exitCode}`}`,
      });
    }
    return { machineId, cwd: posix.join(path, cawHome(projectId)) };
  };
