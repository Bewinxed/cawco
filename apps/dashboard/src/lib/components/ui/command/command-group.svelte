<script lang="ts">
  import { Command as CommandPrimitive, useId } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    heading,
    value,
    ...restProps
  }: CommandPrimitive.GroupProps & {
    heading?: string;
  } = $props();
</script>

<CommandPrimitive.Group
  class={cn("overflow-hidden p-space-1 text-tx", className)}
  data-slot="command-group"
  value={value ?? heading ?? `----${useId()}`}
  bind:ref
  {...restProps}
>
  {#if heading}
    <CommandPrimitive.GroupHeading class="px-2 py-1.5 type-label text-tx-2">
      {heading}
    </CommandPrimitive.GroupHeading>
  {/if}
  <CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>
