<script lang="ts" module>
  import { createContext } from "svelte";

  /** How a sheet's content closes its own sheet: a drag that lets it go. */
  export const [closer, provideCloser] = createContext<() => void>();
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";

  let { open = $bindable(false), ...restProps }: SheetPrimitive.RootProps =
    $props();

  provideCloser(() => {
    open = false;
  });

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
</script>

<SheetPrimitive.Root
  bind:open={
    () => root.ready && open,
    (value) => {
    open = value;
  }
  }
  {...restProps}
/>
