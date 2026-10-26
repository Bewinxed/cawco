import { useStore } from "@xyflow/svelte";
import { untrack } from "svelte";

/**
 * The canvas taking another size (its share of a pane, the window turning):
 * `act` runs, untracked, once per change past the first measured one. Called
 * in the setup of a component inside a Svelte Flow.
 */
export function onCanvasResize(act: () => void): void {
  const store = useStore();
  let sized: string | undefined;
  $effect(() => {
    const size = `${store.width}x${store.height}`;
    const before = sized;
    sized = size;
    if (
      before !== undefined &&
      before !== size &&
      store.width > 0 &&
      store.height > 0
    ) {
      untrack(act);
    }
  });
}
