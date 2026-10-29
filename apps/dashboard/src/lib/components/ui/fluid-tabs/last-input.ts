/**
 * The last input the page heard: a key or a pointer. A folder tab chosen
 * from the keyboard (the tablist's arrows, Home and End, Enter on a tab, a
 * shortcut) switches at once, and only a pointer's choice comes forward
 * (TabsList `land`): a keyboard action is repeated many times a day, and
 * motion on it reads as lag (Emil Kowalski, "Never animate
 * keyboard-initiated actions"). It is also what lights a focus ring drawn
 * by hand (a comment's pin, PreviewPane's `cawco:focus-pin`): a ring only
 * for keyboard use, never for a press. Heard on the window in the capture
 * phase, before anything a key or a press does, so the choice it makes
 * reads it already set. A pointer until a key is pressed.
 */
export const lastInput: { current: "key" | "pointer" } = { current: "pointer" };

/** The modifier keys, which act on nothing alone. */
const MODIFIERS = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
  "CapsLock",
  "Fn",
  "FnLock",
  "Hyper",
  "Super",
  "Symbol",
  "SymbolLock",
]);

/**
 * Whether `event` is keyboard use, the kind that makes focus visible: a key
 * that acts (Tab, the arrows, Enter, a letter, Shift+Tab, a shortcut's
 * chord), never a modifier held alone. Chromium turns `:focus-visible` on
 * for any key, Shift alone included, so a pin pressed and then Shift held
 * drew its ring.
 */
export const keyboardUse = (event: KeyboardEvent): boolean =>
  !MODIFIERS.has(event.key);

if (typeof window !== "undefined") {
  const options = { capture: true, passive: true } as const;
  addEventListener(
    "keydown",
    (event) => {
      if (keyboardUse(event)) {
        lastInput.current = "key";
      }
    },
    options
  );
  addEventListener(
    "pointerdown",
    () => {
      lastInput.current = "pointer";
    },
    options
  );
}
