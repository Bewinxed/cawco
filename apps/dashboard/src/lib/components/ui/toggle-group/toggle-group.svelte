<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import { slideThumb } from "#lib/components/ui/tabs/thumb.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    children,
    ...restProps
  }: ToggleGroupPrimitive.RootProps = $props();

  let thumb = $state<HTMLSpanElement>();
  $effect(() => {
    if (ref && thumb) {
      return slideThumb(
        ref,
        thumb,
        '[data-slot="toggle-group-item"][data-state="on"]'
      );
    }
  });
</script>

<!--
Discriminated Unions + Destructing (required for bindable) do not
get along, so we shut typescript up by casting `value` to `never`.
-->
<ToggleGroupPrimitive.Root
  class={cn("kit-segmented", className)}
  data-slot="toggle-group"
  bind:ref
  bind:value={value as never}
  {...restProps}
>
  <span aria-hidden="true" class="kit-thumb" bind:this={thumb}></span>
  {@render children?.()}
</ToggleGroupPrimitive.Root>
