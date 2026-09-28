<script lang="ts" module>
  import { createContext } from "svelte";

  /** How a sheet's content closes its own sheet: a drag that lets it go. */
  export const [closer, provideCloser] = createContext<() => void>();
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";

  let { open = $bindable(false), ...restProps }: SheetPrimitive.RootProps =
    $props();

  provideCloser(() => {
    open = false;
  });
</script>

<SheetPrimitive.Root bind:open {...restProps} />
