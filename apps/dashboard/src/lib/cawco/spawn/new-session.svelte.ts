/**
 * The New Session dialog the rail opens: whether it is open, and where it
 * starts. The Shell mounts the one dialog; the rail's rows only ask for it,
 * so it is there whichever rail is mounted (the wide screen's, the drawer's)
 * and when neither is, and what is typed in it outlives the rail it was
 * opened from.
 */
export interface SpawnPrefill {
  cwd?: string;
  machineId?: string;
  projectId?: string;
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
