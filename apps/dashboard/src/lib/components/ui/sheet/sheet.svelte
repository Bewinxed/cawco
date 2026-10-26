<script lang="ts" module>
  import { createContext } from "svelte";

  /** How a sheet's content closes its own sheet: a drag that lets it go. */
  const [closer, provideCloser] = createContext<() => void>();

  export { closer };
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";
  import { rootPresence } from "../root-presence.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: SheetPrimitive.RootProps = $props();

  provideCloser(() => {
    open = false;
  });

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
  const shown = $derived(root.ready && open);
  // Its portal in the page only while it is open or closing (root-presence).
  const complete = rootPresence(() => shown);
</script>

<SheetPrimitive.Root
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
