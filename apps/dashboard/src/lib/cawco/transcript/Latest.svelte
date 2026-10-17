<script lang="ts">
  /**
   * The way back to the newest row, while the reader is scrolled away from it.
   * The transcript never moves under someone reading history — new rows land
   * below, out of sight — so this is what says there is more, and takes them
   * there in one glide.
   */
  import { rise } from "#lib/cawco/motion/curves.svelte.js";
  import IconArrowDown from "~icons/solar/arrow-down-bold-duotone";

  let { onjump }: { onjump: () => void } = $props();
</script>

<!-- The small button's height: where it rests is measured from it. -->
<button
  class="mark-line pressable inline-flex items-center gap-space-2 h-c-btn-h-sm py-0 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-label font-medium text-ink-strong cursor-pointer hover:bg-surface-hover"
  onclick={onjump}
  type="button"
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  <IconArrowDown class="size-icon-md" /><span>Jump to latest</span>
</button>
