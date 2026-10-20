/**
 * The New Session form: whether it is open, where it starts, and the trigger
 * it was opened from. The Shell mounts the one form; every opener (the rail's
 * rows, the phone's Start session, a `?spawn=` link, the session strip's "+",
 * a project's Spin off) only asks for it, so it is there whichever rail is
 * mounted (the wide screen's, the drawer's) and when neither is, and what is
 * typed in it outlives the place it was opened from. A fork with no mode to
 * run in opens it too, on the fork ({@link startFork}). Asked with a trigger,
 * it opens as a popover at that trigger (NewSessionPopover); without one, as
 * the centred dialog (NewSessionDialog). Under 640px both are its bottom
 * sheet.
 */
import type { Bounded } from "@cawco/core/bounded";
import {
  type ForkSource,
  forkSession,
  type SendExtras,
} from "../client.svelte";

export interface SpawnPrefill {
  cwd?: string;
  /** A fork its source had no mode for: Start forks it, on the mode picked. */
  fork?: ForkSource;
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

/**
 * The form's own states its frame's size follows (NewSessionForm): a move's
 * step standing in for the form (`data-stepped`), the summary and the
 * carried prompt side by side (`data-pair`). Its frame's morph hears them
 * (motion/morph `on`), the centred card's and the popover's alike.
 */
export const FORM_SIZES = ["data-stepped", "data-pair"] as const;

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

/**
 * Forks `source` ({@link forkSession}): the fork's answer, or null when it
 * has no mode to run in and the New Session form has opened on it instead,
 * at `anchor` when the press has one to hang from, its machine and folder
 * set, as a spin-off, Start waiting for a mode. A start never refuses for a
 * form nobody was shown.
 */
export async function startFork(
  source: ForkSource,
  anchor: HTMLElement | null = null
): Promise<Bounded<string> | null> {
  const forked = await forkSession(source);
  if (forked.kind !== "unchosen") {
    return forked;
  }
  newSession(
    {
      machineId: source.machineId,
      cwd: source.cwd,
      spinOff: true,
      fork: source,
    },
    anchor
  );
  return null;
}
