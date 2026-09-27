<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CommandPrimitive.SeparatorProps = $props();
</script>

<CommandPrimitive.Separator
  class={cn("my-1 h-px bg-border/50", className)}
  data-slot="command-separator"
  bind:ref
  {...restProps}
/>
