/**
 * The dashboard shell's own keyboard shortcuts (Shell.svelte `shortcut`): the
 * one list both the shell and the preview overlay match, so a combo pressed
 * inside an artifact's page in the panel reaches the shell exactly as one
 * pressed on the dashboard does (the overlay forwards it as
 * `cawco:shortcut`, preview/wire.ts). Each needs ⌘ or Ctrl; `key` is the
 * event's key, lowercased; `shift` is whether ⇧ must be down, must be up, or
 * either.
 */
export const SHELL_SHORTCUTS = [
  /** ⌘⇧N: a new session. */
  { name: "new-session", key: "n", shift: true },
  /** ⌘K: Jump, open or shut (⇧ either way). */
  { name: "jump", key: "k", shift: "either" },
  /** ⌘\: the conversation in front split into a new half to the right. */
  { name: "split-right", key: "\\", shift: false },
  /** ⌘⇧\: the same, into a new half below. */
  { name: "split-down", key: "\\", shift: true },
] as const satisfies readonly {
  key: string;
  name: string;
  shift: boolean | "either";
}[];

export type ShellShortcut = (typeof SHELL_SHORTCUTS)[number]["name"];

/** The keys of a keydown that a shortcut is told by. */
export interface ShortcutPress {
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

/** The shell's shortcut `press` is, or null when it is none of them. */
export function shellShortcutOf(press: ShortcutPress): ShellShortcut | null {
  if (!(press.metaKey || press.ctrlKey)) {
    return null;
  }
  const key = press.key.toLowerCase();
  const found = SHELL_SHORTCUTS.find(
    (each) =>
      each.key === key &&
      (each.shift === "either" || each.shift === press.shiftKey)
  );
  return found?.name ?? null;
}

/** A shortcut's name as a message carries it, or null when it names none. */
export function shellShortcutNamed(value: unknown): ShellShortcut | null {
  return (
    SHELL_SHORTCUTS.find((each) => each.name === value)?.name ?? null
  );
}
