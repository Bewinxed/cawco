<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";

  let { open = $bindable(false), ...restProps }: DialogPrimitive.RootProps =
    $props();

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
</script>

<DialogPrimitive.Root
  bind:open={
    () => root.ready && open,
    (value) => {
    open = value;
  }
  }
  {...restProps}
/>
