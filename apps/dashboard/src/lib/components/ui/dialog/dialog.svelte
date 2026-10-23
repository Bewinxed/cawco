<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";
  import { rootPresence } from "../root-presence.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: DialogPrimitive.RootProps = $props();

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
  const shown = $derived(root.ready && open);
  // Its portal in the page only while it is open or closing (root-presence).
  const complete = rootPresence(() => shown);
</script>

<DialogPrimitive.Root
  bind:open={
    () => shown,
    (value) => {
      open = value;
    }
  }
  onOpenChangeComplete={(value) => {
    complete(value);
    onOpenChangeComplete?.(value);
  }}
  {...restProps}
/>
