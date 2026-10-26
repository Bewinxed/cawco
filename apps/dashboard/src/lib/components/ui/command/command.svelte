<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  type CommandRootApi = CommandPrimitive.Root;

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
    "flex size-full flex-col overflow-hidden rounded-sm bg-surface-raised p-space-1 text-ink-strong",
    className
  )}
  data-slot="command"
  bind:this={api}
  bind:ref
  bind:value
  {...restProps}
/>
