/**
 * The last input the page heard: a key or a pointer. A folder tab chosen
 * from the keyboard (the tablist's arrows, Home and End, Enter on a tab, a
 * shortcut) switches at once, and only a pointer's choice comes forward
 * (TabsList `land`): a keyboard action is repeated many times a day, and
 * motion on it reads as lag (Emil Kowalski, "Never animate
 * keyboard-initiated actions"). Heard on the window in the capture phase,
 * before anything a key or a press does, so the choice it makes reads it
 * already set. A pointer until a key is pressed.
 */
export const lastInput: { current: "key" | "pointer" } = { current: "pointer" };

if (typeof window !== "undefined") {
  const options = { capture: true, passive: true } as const;
  addEventListener(
    "keydown",
    () => {
      lastInput.current = "key";
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
