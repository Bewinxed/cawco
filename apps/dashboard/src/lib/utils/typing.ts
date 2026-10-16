const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * Whether focus is in something that takes text. A shortcut that is a bare
 * letter has to ask this before it takes the key off whoever is typing.
 */
export function isTyping(): boolean {
  const focused = document.activeElement;
  return (
    focused instanceof HTMLElement &&
    (TYPING.has(focused.tagName) || focused.isContentEditable)
  );
}

/** Apple's systems, where ⌃ letters in a field are text keys and ⌘ is the command key. */
const APPLE =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Whether a modifier chord is the focused field's own text key rather than
 * a shell shortcut: ⌃ without ⌘ in a field on Apple's systems (⌃K deletes
 * to the line's end there, with no listener to prevent it). Every other
 * chord is the shell's from a field unless the field handled it
 * (`defaultPrevented`); plain keys are never shortcuts (WCAG 2.1.4,
 * Character Key Shortcuts). The preview overlay keeps the same rule for an
 * artifact's page (preview-overlay page.ts `fieldKeeps`).
 */
export function fieldKeeps(event: KeyboardEvent): boolean {
  return APPLE && event.ctrlKey && !event.metaKey && isTyping();
}
