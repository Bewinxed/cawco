<script lang="ts" module>
  import { createContext } from "svelte";

  /**
   * Whether the dialog's portal is in the page: from the moment it opens
   * until it has closed, its exit played (bits-ui's `onOpenChangeComplete`).
   * The kit's Portal (dialog-portal) enters the page only then, so a dialog
   * is the newest surface on its layer whenever it opens. Mounted with the
   * Root instead, its portal stood in the page before every surface opened
   * since that shares `--layer-float` (a drawer, a sheet), and opened under
   * them: the later of two on one layer is drawn on top.
   */
  export const [presence, providePresence] = createContext<{
    readonly present: boolean;
  }>();
</script>

<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { rootOpen } from "../root-open.svelte.js";

  let {
    open = $bindable(false),
    onOpenChangeComplete,
    ...restProps
  }: DialogPrimitive.RootProps = $props();

  // Open whenever `open` is true, set before mount included (root-open).
  const root = rootOpen();
  const shown = $derived(root.ready && open);

  // Closed and its exit played: true until it first opens, and again once
  // each close completes.
  let settled = $state(true);
  $effect(() => {
    if (shown) {
      settled = false;
    }
  });
  providePresence({
    get present() {
      return shown || !settled;
    },
  });
</script>

<DialogPrimitive.Root
  bind:open={
    () => shown,
    (value) => {
      open = value;
    }
  }
  onOpenChangeComplete={(value) => {
    if (!value) {
      settled = true;
    }
    onOpenChangeComplete?.(value);
  }}
  {...restProps}
/>
