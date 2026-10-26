<script lang="ts" module>
  import { createContext } from "svelte";

  /** How a sheet's content closes its own sheet: a drag that lets it go. */
  const [closer, provideCloser] = createContext<() => void>();

  export { closer };
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { overlayRoot } from "../root-presence.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: SheetPrimitive.RootProps = $props();

  provideCloser(() => {
    open = false;
  });

  // Open whenever `open` is true, set before mount included, and its portal
  // in the page only while it is open or closing (root-presence).
  const root = overlayRoot(
    () => open,
    (value) => {
      open = value;
    },
    () => onOpenChangeComplete
  );
</script>

<SheetPrimitive.Root
  bind:open={root.get, root.set}
  onOpenChangeComplete={root.complete}
  {...restProps}
/>
