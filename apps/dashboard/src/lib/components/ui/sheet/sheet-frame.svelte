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
   * names it a modal dialog. Hidden instead (`visibility`, laid out and
   * styled at rest), an open styled none of it anew in WebKit, but a sheet
   * left hidden 20s opened at 6 frames a second about one time in two
   * (785-818ms to its first frame against 199-376ms skipped, the phone's
   * sidebar at 29 tabs: sidebar-lab sheet), and Chromium restyled all of it
   * at every open as the inherited property flipped (139ms to 194ms at 4x
   * CPU).
   * Hidden only while it was first built (each slice's rows styled and
   * laid out as they came), its first open came 30-40ms sooner in Chromium
   * at 4x CPU and no sooner in WebKit, and the build's first slices grew
   * to 52-87ms tasks at one tab: built skipped, its first open styles and
   * lays it out once, in the tap.
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
