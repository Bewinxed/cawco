/**
 * Toasts when a machine's daemon restarts itself to pick up a deploy.
 *
 * Unlike {@link checkDeployToast} in `deploy-toast.ts`, there is no baseline to
 * compare against: the hub only ever sets `AgentRow.restarted` on the one
 * `instances` frame right after the event, and deletes its own record of it
 * the instant that frame is built (see `withPresence`/`restarts` in
 * `packages/hub/src/server.ts`). A row that carries it is, by construction,
 * reporting something that just happened — never something ambient the page
 * loaded into — so every sighting toasts, once, and there is nothing to
 * remember between frames.
 */
import type { AgentRow } from "@cawco/core";
import { toast } from "svelte-sonner";

/**
 * Called on every `instances` frame with the agents it carried. Toasts once
 * per machine that just came back from an idle-gated deploy restart — a
 * machine mid-turn when the update landed and only just now went idle enough
 * to take it, exactly the case the wait exists for.
 */
export function checkRestartToast(agents: readonly AgentRow[]): void {
  for (const agent of agents) {
    if (!agent.restarted) {
      continue;
    }
    const name = agent.hostname || agent.machineId;
    toast.info(
      `${name} updated and restarted — it was idle, so nothing was interrupted.`,
      {
        id: `restart-${agent.machineId}-${Date.now()}`,
        duration: 6000,
      }
    );
  }
}
