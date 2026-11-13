import { dur } from "#lib/platform/motion/curves.svelte.js";

/**
 * A mark that fades where it stands: once its fade (`--duration-panel`) has
 * run, `clear` takes it away if it is still the mark of `key`, in `off`.
 */
export function clearAfterFade(
  held: () => { key: string; state: "on" | "off" } | null,
  key: string,
  clear: () => void
): void {
  setTimeout(() => {
    const mark = held();
    if (mark?.key === key && mark.state === "off") {
      clear();
    }
  }, dur("--duration-panel"));
}
