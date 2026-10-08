<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";

  let {
    open = $bindable(false),
    ...restProps
  }: AlertDialogPrimitive.RootProps = $props();

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
</script>

<AlertDialogPrimitive.Root
  bind:open={
    () => root.ready && open,
    (value) => {
    open = value;
  }
  }
  {...restProps}
/>
