/**
 * A Mac's readiness for agents, the dashboard's half: each Mac's
 * {@link MacReadiness} by machine id, what pressing a step does, and the one
 * dialog that reopens the act from the machine's row or menu.
 *
 * Whatever feeds it (the hub's frames; a motion bench's script) writes the
 * readiness in with `set` and installs the two actions; every place that
 * shows the act reads it from here. Only a Mac has an entry, so an entry is
 * what makes a machine's join end in the act.
 */
import type { MacReadiness, MacReadinessStepId } from "@cawco/core";
import { SvelteMap } from "svelte/reactivity";

/** What pressing a step's button asks of the Mac. */
export interface MacReadyActions {
  /** Sends the step's prompt, or its password dialog, to the Mac. */
  continue: (machineId: string, stepId: MacReadinessStepId) => void;
  /** Opens the System Settings pane the step's denied grant is turned on in. */
  openSettings: (machineId: string, stepId: MacReadinessStepId) => void;
}

const byMachine = new SvelteMap<string, MacReadiness>();
const held = $state<{
  actions: MacReadyActions | null;
  open: string | null;
}>({ actions: null, open: null });

export const macReady = {
  /** The Mac's readiness, or undefined for a machine that is not a Mac (or not read yet). */
  of(machineId: string | null | undefined): MacReadiness | undefined {
    return machineId ? byMachine.get(machineId) : undefined;
  },
  set(machineId: string, readiness: MacReadiness): void {
    byMachine.set(machineId, readiness);
  },
  forget(machineId: string): void {
    byMachine.delete(machineId);
  },
  get actions(): MacReadyActions | null {
    return held.actions;
  },
  set actions(value: MacReadyActions | null) {
    held.actions = value;
  },
  /** The machine whose act the reopened dialog shows, or null while it is shut. */
  get open(): string | null {
    return held.open;
  },
  show(machineId: string): void {
    held.open = machineId;
  },
  close(): void {
    held.open = null;
  },
};
