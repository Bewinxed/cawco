<script lang="ts">
  /**
   * One step's status glyph, each the glyph alone: check done, refresh
   * current (breathing, as live work does), the close X failed, stop stopped,
   * the dotted ring not reached yet (still). A change of state is an icon
   * swap in its one cell (`icon-swap`, on --duration-fast): the old glyph
   * slides out toward the end and fades as the new one slides in from the
   * start, at its own size, never a jump. Status is never the hue
   * alone: the glyph's shape says it, and the row's words.
   */
  import {
    IconError,
    IconNotYet,
    IconStopped,
    IconSuccess,
    IconWorking,
  } from "#lib/icons.js";
  import { loopInStep } from "#lib/platform/motion/in-step.svelte.js";
  import type { MarkState } from "./steps";

  let {
    state,
    size = "md",
  }: {
    state: MarkState;
    /** 16px in the window's rows, 12px beside the band's meta line. */
    size?: "sm" | "md";
  } = $props();

  const MARKS = [
    { key: "done", icon: IconSuccess, ink: "text-green" },
    { key: "current", icon: IconWorking, ink: "text-cyan" },
    { key: "failed", icon: IconError, ink: "text-red" },
    { key: "stopped", icon: IconStopped, ink: "text-tx-2" },
    { key: "future", icon: IconNotYet, ink: "text-tx-2" },
  ] as const;
</script>

<span
  class="icon-swap flex-none"
  style:--icon-swap-dur="var(--duration-fast)"
  data-box
  data-mark={state}
>
  {#each MARKS as mark (mark.key)}
    {@const Icon = mark.icon}
    <span data-active={mark.key === state} class={mark.ink}>
      <!-- The breath runs on a span of its own round the glyph: on the swap's
           cell its opacity would hold over the cell's own fade out. -->
      <span
        class={["inline-flex", mark.key === "current" && "breathe loops"]}
        {@attach loopInStep}
      >
        <Icon
          aria-hidden="true"
          class={size === "sm" ? "size-icon-sm" : "size-icon-md"}
        />
      </span>
    </span>
  {/each}
</span>
