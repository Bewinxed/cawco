/**
 * The New Session dialog: whether it is open, and where it starts. The Shell
 * mounts the one dialog; every opener (the rail's rows, the phone's Start
 * session, a `?spawn=` link) only asks for it, so it is there whichever rail
 * is mounted (the wide screen's, the drawer's) and when neither is, and what
 * is typed in it outlives the place it was opened from.
 */
import type { SendExtras } from "../client.svelte";

export interface SpawnPrefill {
  cwd?: string;
  machineId?: string;
  projectId?: string;
  /**
   * The first prompt it opens with, attachments and all: a send another
   * session refused, picked up by a new one.
   */
  prompt?: { text: string; extras: SendExtras };
}

export const spawning = $state<{
  open: boolean;
  prefill: SpawnPrefill | undefined;
}>({
  open: false,
  prefill: undefined,
});

/** Opens the New Session dialog, on `prefill`'s machine, folder or project when given. */
export function newSession(prefill?: SpawnPrefill): void {
  spawning.prefill = prefill;
  spawning.open = true;
}
