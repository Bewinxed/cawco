<script lang="ts">
  /**
   * The tray as a phone's bottom sheet over its screen: the scrim, whose
   * press is ×, and the sheet flush on the foot, up to `room` tall, that a
   * finger drags down to put away (dragToDismiss). Its caller rises and
   * lowers it by the two boxes (motion.ts `sheetIn`, `sheetOut`).
   */
  import type { Snippet } from "svelte";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";

  let {
    room,
    onpark,
    dismiss,
    sheet = $bindable(null),
    scrim = $bindable(null),
    children,
  }: {
    /** The sheet's most height, a CSS length. */
    room: string;
    /** A press on the scrim. */
    onpark: () => void;
    /** A drag that carried the sheet away: it is gone already. */
    dismiss: () => void;
    sheet?: HTMLElement | null;
    scrim?: HTMLElement | null;
    children: Snippet;
  } = $props();
</script>

<button
  bind:this={scrim}
  aria-label="Close"
  class="absolute inset-0 bg-scrim"
  data-slot="scrim"
  onclick={onpark}
  tabindex="-1"
  type="button"
></button>
<div
  bind:this={sheet}
  class="absolute inset-x-0 bottom-0"
  data-slot="sheet"
  style:--sheet-room={room}
  {@attach dragToDismiss({ edge: "bottom", dismiss, fade: () => scrim })}
>
  {@render children()}
</div>
