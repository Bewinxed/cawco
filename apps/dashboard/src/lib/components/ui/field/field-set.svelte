<script lang="ts">
  import type { HTMLFieldsetAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLFieldsetAttributes> = $props();
</script>

<fieldset
  class={cn("flex flex-col gap-6 has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3", className)}
  data-slot="field-set"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</fieldset>
