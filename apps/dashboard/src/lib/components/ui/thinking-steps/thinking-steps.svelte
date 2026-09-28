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
  class="thinking-steps {className}"
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
  :global(.thinking-steps) {
    min-width: 0;
    max-width: 100%;
    font-family: inherit;
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  :global(.thinking-steps[data-size="compact"]) {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
  }
</style>
