<script lang="ts">
  import { Tooltip as TooltipPrimitive } from "bits-ui";

  /**
   * A tooltip waits 400ms before it opens, so a pointer passing over
   * a control does not flash one; once one has been open, the next opens at
   * once while the pointer moves on within 300ms.
   *
   * Focus opens one only when it came from the keyboard (drawn
   * `:focus-visible`): a sheet or dialog opened with the pointer moves focus
   * to its Close, and a tooltip answering that focus stood open over the
   * content under the head with no pointer on Close.
   */
  let {
    delayDuration = 400,
    skipDelayDuration = 300,
    ignoreNonKeyboardFocus = true,
    ...restProps
  }: TooltipPrimitive.ProviderProps = $props();
</script>

<TooltipPrimitive.Provider
  {delayDuration}
  {skipDelayDuration}
  {ignoreNonKeyboardFocus}
  {...restProps}
/>
