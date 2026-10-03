<script lang="ts">
  import { PaneGroup, type PaneGroupProps } from "paneforge";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    this: paneGroup = $bindable(),
    class: className,
    ...restProps
  }: PaneGroupProps & {
    this?: PaneGroup;
  } = $props();
</script>

<PaneGroup
  class={cn(
		"cn-resizable-panel-group flex h-full w-full data-[direction=vertical]:flex-col",
		className
	)}
  data-slot="resizable-pane-group"
  bind:this={paneGroup}
  bind:ref
  {...restProps}
/>
