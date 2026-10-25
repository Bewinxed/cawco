<script lang="ts">
  // Native port of fluidfunctionalism.com/r/base/thinking-steps.json.
  import { Collapsible } from "bits-ui";
  import { untrack } from "svelte";
  import { provideRootOpen } from "../collapsible/opened";
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
  // Its steps are built the first time it is open (collapsible-content): a
  // transcript's every Reasoning row built and measured its markdown shut.
  provideRootOpen(() => open ?? internalOpen);
</script>

<Collapsible.Root
  {...rest}
  class="min-w-0 max-w-full font-family-inherit text-size-body font-normal leading-body text-ink-muted size-compact:text-size-meta {className}"
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
