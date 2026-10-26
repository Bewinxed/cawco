<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { overlayRoot } from "../root-presence.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: AlertDialogPrimitive.RootProps = $props();

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

<AlertDialogPrimitive.Root
  bind:open={root.get, root.set}
  onOpenChangeComplete={root.complete}
  {...restProps}
/>
