<script lang="ts">
  /**
   * A sheet's own element, drawn through its Content primitive's `child`
   * (the sheet's, the alert dialog's tray): bits-ui then holds the body's
   * lock only while it is open, and clears it at once; closing, it lets
   * presses through (floating-presence). `away` is where it travels from and
   * to (`--sheet-away`); `room`, its floating header's height
   * (`--sheet-room`), which the content's scroller pads its top by.
   *
   * `rest`: a kept sheet closed and its exit played (sheet-content `keep`).
   * It stands away, its content skipped and held still as a pane put away
   * is (PaneLeaf: `content-visibility: hidden`, `data-offscreen`,
   * `holdSkipped`), and out of the accessibility tree, since bits-ui still
   * names it a modal dialog.
   */
  import type { Snippet } from "svelte";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { holdSkipped } from "#lib/platform/motion/rest.js";

  let {
    props,
    open,
    away,
    room,
    rest = false,
    children,
  }: {
    props: Record<string, unknown>;
    open: boolean;
    away: string;
    room?: number;
    rest?: boolean;
    children: Snippet;
  } = $props();
</script>

<div
  {...props}
  aria-hidden={rest || undefined}
  data-offscreen={rest || undefined}
  data-rest={rest || undefined}
  style:pointer-events={pressable(open)}
  style:--sheet-away={away}
  style:--sheet-room={room === undefined ? undefined : `${room}px`}
  {@attach holdSkipped(rest)}
>
  {@render children()}
</div>
