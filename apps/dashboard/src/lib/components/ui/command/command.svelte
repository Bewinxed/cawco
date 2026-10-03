<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  export type CommandRootApi = CommandPrimitive.Root;

  let {
    api = $bindable(null),
    ref = $bindable(null),
    value = $bindable(""),
    class: className,
    ...restProps
  }: CommandPrimitive.RootProps & {
    api?: CommandRootApi | null;
  } = $props();
</script>

<CommandPrimitive.Root
  class={cn(
    "flex size-full flex-col overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-raised)] p-1 text-foreground",
    className
  )}
  data-slot="command"
  bind:this={api}
  bind:ref
  bind:value
  {...restProps}
/>
