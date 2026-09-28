<script lang="ts">
  import { Command as CommandPrimitive, useId } from "bits-ui";
  import { cn } from "$lib/utils.js";

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
  class={cn("overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-3 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:text-label **:[[cmdk-group-heading]]:text-muted-foreground", className)}
  data-slot="command-group"
  value={value ?? heading ?? `----${useId()}`}
  bind:ref
  {...restProps}
>
  {#if heading}
    <CommandPrimitive.GroupHeading
      class="px-2 py-1.5 text-label text-muted-foreground"
    >
      {heading}
    </CommandPrimitive.GroupHeading>
  {/if}
  <CommandPrimitive.GroupItems {children} />
</CommandPrimitive.Group>
