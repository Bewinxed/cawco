<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { overlayRoot } from "../root-presence.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: DialogPrimitive.RootProps = $props();

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

<DialogPrimitive.Root
  bind:open={root.get, root.set}
  onOpenChangeComplete={root.complete}
  {...restProps}
/>
