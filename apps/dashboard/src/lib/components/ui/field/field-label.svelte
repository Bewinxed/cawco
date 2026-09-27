<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Label } from "$lib/components/ui/label/index.js";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: ComponentProps<typeof Label> = $props();
</script>

<Label
  class={cn(
		"group/field-label peer/field-label flex w-fit gap-2 leading-snug leading-snug has-[>[data-slot=field]]:rounded-[var(--radius-md)] has-[>[data-slot=field]]:border has-data-checked:border-primary/30 has-data-checked:bg-primary/5 *:data-[slot=field]:p-4 group-data-[disabled=true]/field:opacity-50 dark:has-data-checked:border-primary/20 dark:has-data-checked:bg-primary/10",
		"has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col",
		className
	)}
  data-slot="field-label"
  bind:ref
  {...restProps}
>
  {@render children?.()}
</Label>
