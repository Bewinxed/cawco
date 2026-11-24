<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { markMenuEnds } from "#lib/components/ui/menu-item/index.js";
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

  /* Its end rows follow its curve, the rows between join (menu-item/ends.ts). */
  $effect(() => {
    if (ref) {
      return markMenuEnds(ref);
    }
  });
</script>

<CommandPrimitive.Root
  class={cn(
    "flex size-full flex-col overflow-hidden sc-concentric-sm bg-bg p-space-1 text-tx",
    className
  )}
  data-slot="command"
  bind:this={api}
  bind:ref
  bind:value
  {...restProps}
/>
