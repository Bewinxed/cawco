<script lang="ts">
  import { findInWords } from "@cawco/core/words/find-in";
  /**
   * The way back to the newest row, while the reader is scrolled away from it.
   * The transcript never moves under someone reading history — new rows land
   * below, out of sight — so this is what says there is more, and takes them
   * there in one glide.
   */
  import { rise } from "#lib/cawco/motion/curves.svelte.js";
  import { IconArrowDownDuotone as IconArrowDown } from "#lib/icons.js";

  let {
    onjump,
    back = false,
  }: {
    onjump: () => void;
    /**
     * Find closed at a place (find/conversation-find): in its place, the way
     * back to where the conversation was read as find opened.
     */
    back?: boolean;
  } = $props();
</script>

<!-- The small button's height: where it rests is measured from it. -->
<button
  class="select-none mark-line pressable inline-flex items-center gap-space-2 h-c-btn-h-sm py-0 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-label font-medium text-ink-strong hover:bg-surface-hover"
  onclick={onjump}
  type="button"
  in:rise={"--duration-panel"}
  out:rise={"--duration-exit"}
>
  <IconArrowDown class="size-icon-md" /><span
    >{back ? findInWords.back : "Jump to latest"}</span
  >
</button>
