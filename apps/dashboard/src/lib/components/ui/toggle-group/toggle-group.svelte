<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import {
    segmentedVariants,
    slideThumb,
  } from "#lib/components/ui/tabs/thumb.js";
  import { cn } from "#lib/utils.js";

  const { group, thumb: thumbLook } = segmentedVariants();

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
Its segments wrap whole onto the next line where its row is narrower than
they are, rather than running off a narrow screen; the thumb follows the
chosen segment wherever it stands.
-->
<ToggleGroupPrimitive.Root
  class={cn(group(), "flex-wrap", className)}
  data-slot="toggle-group"
  bind:ref
  bind:value={value as never}
  {...restProps}
>
  <span aria-hidden="true" class={thumbLook()} bind:this={thumb}></span>
  {@render children?.()}
</ToggleGroupPrimitive.Root>
