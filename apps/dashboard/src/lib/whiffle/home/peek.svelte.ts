/**
 * The glance → peek → dive loop's middle step, held once for the whole app:
 * any home row or Needs-you card can peek, and one sheet shows it. The target
 * is kept after the sheet is put away, so the pane still has its session
 * while it slides out; `open` is what shows it.
 */
import type { PeekTarget } from "../PeekPane.svelte";

export const peek = $state<{ target: PeekTarget | null; open: boolean }>({
  target: null,
  open: false,
});

export function openPeek(target: PeekTarget): void {
  peek.target = target;
  peek.open = true;
}

export function closePeek(): void {
  peek.open = false;
}
