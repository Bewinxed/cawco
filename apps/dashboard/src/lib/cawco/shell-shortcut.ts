import type { ShellShortcut } from "@cawco/core/shell-shortcuts";
import { barGlass } from "./bar-glass.svelte";

/**
 * The shell's shortcuts (core `SHELL_SHORTCUTS`) run from one place: the
 * shell's own keydown on the dashboard's window, and a combo an artifact's
 * page left to it (`cawco:shortcut`, heard by the panel's page and the
 * canvases), whose keys never reach that window. The shell hands over what
 * each does as it mounts (Shell.svelte).
 */
let actions: ((name: ShellShortcut) => boolean) | null = null;

/** The shell's actions, while it stands; the returned call takes them back. */
export function shellShortcutsAre(
  run: (name: ShellShortcut) => boolean
): () => void {
  actions = run;
  return () => {
    if (actions === run) {
      actions = null;
    }
  };
}

/**
 * Runs shortcut `name`, pressed on the keyboard: whether the shell acted on
 * it (a split with nothing to split does not). A key, so a card it opens
 * stands open at once, as from the dashboard's own keys.
 */
export function runShellShortcut(name: ShellShortcut): boolean {
  barGlass.byPointer = false;
  return actions?.(name) ?? false;
}
