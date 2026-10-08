<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";

  let { open = $bindable(false), ...restProps }: PopoverPrimitive.RootProps =
    $props();

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
</script>

<PopoverPrimitive.Root
  bind:open={
    () => root.ready && open,
    (value) => {
    open = value;
  }
  }
  {...restProps}
/>
