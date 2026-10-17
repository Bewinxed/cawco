<script lang="ts">
  // Native port of fluidfunctionalism.com/r/base/thinking-steps.json.
  import { Collapsible } from "bits-ui";
  import { untrack } from "svelte";
  import {
    getSizeContext,
    type SizeVariant,
    setSizeContext,
  } from "../thinking-indicator/size-context";

  let {
    size,
    defaultOpen = true,
    open,
    onOpenChange,
    class: className = "",
    ...rest
  }: Omit<Collapsible.RootProps, "open"> & {
    size?: SizeVariant;
    defaultOpen?: boolean;
    open?: boolean;
  } = $props();
  let internalOpen = $state(untrack(() => defaultOpen));
  const inherited = getSizeContext();
  const resolvedSize = $derived(size ?? inherited?.() ?? "default");
  setSizeContext(() => resolvedSize);
</script>

<Collapsible.Root
  {...rest}
  class="min-w-0 max-w-full text-size-body font-normal leading-body text-ink-muted size-compact:text-size-meta {className}"
  data-size={resolvedSize}
  data-slot="thinking-steps"
  bind:open={
    () => open ?? internalOpen,
    (next) => {
      if (open === undefined) {
        internalOpen = next;
      }
      onOpenChange?.(next);
    }
  }
/>

<style>
  /* residual: unmapped */
  /* css-scope: this file's own root (a Collapsible.Root, which takes no scoped class); only it sets this data-slot */
  :global([data-slot="thinking-steps"]) {
    font-family: inherit;
  }
</style>
