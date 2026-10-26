<script lang="ts">
  /**
   * The scrim's own element, drawn through its overlay primitive's `child`
   * (dialog's, alert dialog's, sheet's, drawer's): fading out, it lets
   * presses through to the page (floating-presence); open or closing, it is
   * said on the root for the screen's edges (page-marks), and it is the one
   * scrim only while none stands under it (scrim-stack).
   */
  import { scrimMark } from "#lib/cawco/page-marks.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { scrimStack } from "./scrim-stack.js";

  let { props, open }: { props: Record<string, unknown>; open: boolean } =
    $props();
</script>

<div
  {...props}
  style:pointer-events={pressable(open)}
  {@attach scrimMark}
  {@attach scrimStack}
></div>
