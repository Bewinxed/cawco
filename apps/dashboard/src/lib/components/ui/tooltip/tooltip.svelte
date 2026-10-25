<script generics="T = never" lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";
  import { tellOpen } from "./tooltip-open";

  let { open = $bindable(false), ...restProps }: TooltipPrimitive.RootProps<T> =
    $props();
  tellOpen(() => open);
</script>

<TooltipPrimitive.Root bind:open {...restProps} />
