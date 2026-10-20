/**
 * The New Session form: whether it is open, where it starts, and the trigger
 * it was opened from. The Shell mounts the one form; every opener (the rail's
 * rows, the phone's Start session, a `?spawn=` link, the session strip's "+",
 * a project's Spin off) only asks for it, so it is there whichever rail is
 * mounted (the wide screen's, the drawer's) and when neither is, and what is
 * typed in it outlives the place it was opened from. Asked with a trigger,
 * it opens as a popover at that trigger (NewSessionPopover); without one, as
 * the centred dialog (NewSessionDialog). Under 640px both are its bottom
 * sheet.
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
  /** It opens as a spin-off (a scratch session), as a project's Spin off asks. */
  spinOff?: boolean;
}

export const spawning = $state<{
  open: boolean;
  prefill: SpawnPrefill | undefined;
  /** The trigger it was opened from, which it hangs from; null for the dialog. */
  anchor: HTMLElement | null;
}>({
  open: false,
  prefill: undefined,
  anchor: null,
});

/**
 * Opens the New Session form, on `prefill`'s machine, folder or project when
 * given: at `anchor`, the trigger pressed, when there is one; the dialog
 * otherwise.
 */
export function newSession(
  prefill?: SpawnPrefill,
  anchor: HTMLElement | null = null
): void {
  spawning.prefill = prefill;
  spawning.anchor = anchor;
  spawning.open = true;
}
