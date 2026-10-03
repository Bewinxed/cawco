<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...props
  }: ComponentProps<typeof Input> = $props();
</script>

<Input
  class={cn("flex-1 rounded-none border-0 bg-transparent shadow-none dark:bg-transparent", className)}
  data-slot="input-group-control"
  bind:ref
  bind:value
  {...props}
/>
