<script lang="ts">
  /**
   * A sheet's own element, drawn through its Content primitive's `child`
   * (the sheet's, the alert dialog's tray): bits-ui then holds the body's
   * lock only while it is open, and clears it at once; closing, it lets
   * presses through (floating-presence). `away` is where it travels from and
   * to (`--sheet-away`); `room`, its floating header's height
   * (`--sheet-room`), which the content's scroller pads its top by.
   */
  import type { Snippet } from "svelte";
  import { pressable } from "#lib/components/ui/floating-presence.js";

  let {
    props,
    open,
    away,
    room,
    children,
  }: {
    props: Record<string, unknown>;
    open: boolean;
    away: string;
    room?: number;
    children: Snippet;
  } = $props();
</script>

<div
  {...props}
  style:pointer-events={pressable(open)}
  style:--sheet-away={away}
  style:--sheet-room={room === undefined ? undefined : `${room}px`}
>
  {@render children()}
</div>
