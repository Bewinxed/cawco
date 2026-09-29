<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for importing a component group
  import * as InputGroup from "$lib/components/ui/input-group/index.js";
  import { IconSearch } from "$lib/icons";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    value = $bindable(""),
    ...restProps
  }: CommandPrimitive.InputProps = $props();
</script>

<div class="p-1 pb-0" data-slot="command-input-wrapper">
  <InputGroup.Root>
    <CommandPrimitive.Input
      class={cn(
				"w-full text-label disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
      data-slot="command-input"
      {value}
      {...restProps}
    >
      {#snippet child({ props })}
        <InputGroup.Input {...props} bind:ref bind:value />
      {/snippet}
    </CommandPrimitive.Input>
    <InputGroup.Addon>
      <IconSearch class="size-4 shrink-0 opacity-50" />
    </InputGroup.Addon>
  </InputGroup.Root>
</div>
