<script lang="ts">
  // Native port of fluidfunctionalism.com/r/base/thinking-steps.json.
  import { Collapsible } from "bits-ui";
  import { cn } from "#lib/utils.js";
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
  // Follows `defaultOpen`; a click overrides it until the prop changes.
  let internalOpen = $derived(defaultOpen);
  const inherited = getSizeContext();
  const resolvedSize = $derived(size ?? inherited?.() ?? "default");
  setSizeContext(() => resolvedSize);
  // Its steps are built the first time it is open (collapsible-content): a
  // transcript's every Reasoning row built and measured its markdown shut.
  provideRootOpen(() => open ?? internalOpen);
</script>

<Collapsible.Root
  {...rest}
  class={cn(
    "min-w-0 max-w-full font-family-inherit text-base font-normal leading-base text-tx-2 size-compact:text-sm",
    className
  )}
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
