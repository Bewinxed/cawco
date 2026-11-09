/**
 * What a machine's row says is wrong with it, read off the parts of its row
 * the first paint does not carry (its fleet report, each fleet item's
 * converge, its harnesses): its sync, its harness CLIs refused there, its
 * sign-ins, and the fleet rows it could not apply. The home's machine
 * exceptions (home-state.svelte.ts `exceptionOf`, the bar's Machines) are
 * made of it. The same function makes it on the server for the board the
 * first paint draws (first-paint.ts) and in the page from the machine's own
 * row once the socket has brought it.
 */
import type { AgentRow } from "@cawco/core/protocol";
import { machineSync, syncNotice } from "./convergence";
import { machineFaults } from "./fleet-faults";
import { harnessWords, machineBlocksOf } from "./harness-block.svelte";
import { signInWarning } from "./machine";
import type { MachineVerdict } from "./served-board";
import { span } from "./span";

/** {@link MachineVerdict} of `machine`, its ages read at `now`. */
export function machineVerdict(machine: AgentRow, now: number): MachineVerdict {
  const blocks = machineBlocksOf(machine);
  const signIn = [
    signInWarning(machine, "pi"),
    signInWarning(machine, "opencode"),
  ]
    .filter(Boolean)
    .join(" ");
  // A server waiting on a sign-in is no fault of the machine's: the
  // sign-in is the fleet's, said once in the machines card with its Sign in
  // (fleet-faults.ts `signInsWaiting`), never on each machine's row
  // (obelisk-of-light read "sync failed" for ElevenLabs' needs-auth alone,
  // 2026-10-23).
  const broken = machineFaults(machine.machineId, machine.fleet).filter(
    (fault) => fault.cause !== "needs-auth"
  );
  let faults: MachineVerdict["faults"] = null;
  if (broken.length > 0) {
    // Something that did not answer in time is slow, not broken: said so
    // only while that is all there is.
    faults = broken.every((fault) => fault.cause === "timed-out")
      ? "sync slow"
      : "sync failed";
  }
  return {
    sync: syncNotice(machineSync(machine, now), span),
    blocked:
      blocks.length > 0 ? blocks.map(harnessWords.row).join(" · ") : null,
    signIn: signIn || null,
    faults,
  };
}
