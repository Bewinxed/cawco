<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";

  /**
   * A tooltip waits half a second before it opens, so a pointer passing over
   * a control does not flash one; once one has been open, the next opens at
   * once while the pointer moves on within 300ms.
   */
  let {
    delayDuration = 500,
    skipDelayDuration = 300,
    ...restProps
  }: TooltipPrimitive.ProviderProps = $props();
</script>

<TooltipPrimitive.Provider {delayDuration} {skipDelayDuration} {...restProps} />
