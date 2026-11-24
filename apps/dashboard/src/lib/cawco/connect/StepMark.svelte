<script lang="ts" module>
  import type { MarkState } from "./steps";

  /**
   * Where a step stands: an install's (steps.ts) or a plan's, which adds a
   * step held on the person (`you`), one waiting on something else
   * (`waits`), and one whose record has left the board (`gone`).
   */
  export type StepState = MarkState | "you" | "waits" | "gone";
</script>

<script lang="ts">
  /**
   * One step's status glyph, each the glyph alone: check done, refresh
   * current (breathing, as live work does), the close X failed, stop stopped,
   * the dotted ring not reached yet (still); on a plan, the Needs-you hand
   * for a step held on the person, the hourglass for one waiting on
   * something else, the bin for one whose record is gone. A change of state is an icon
   * swap in its one cell (`icon-swap`, 120ms): the old glyph gives way
   * as the new one arrives from 0.92, never a jump. Status is never the hue
   * alone: the glyph's shape says it, and the row's words.
   */
  import {
    IconError,
    IconHourglass,
    IconNeedsYou,
    IconNotYet,
    IconStopped,
    IconSuccess,
    IconTrash,
    IconWorking,
  } from "#lib/icons.js";

  let {
    state,
    size = "md",
  }: {
    state: StepState;
    /** 16px in the window's rows, 12px beside the band's meta line. */
    size?: "sm" | "md";
  } = $props();

  const MARKS = [
    { key: "done", icon: IconSuccess, ink: "text-status-done-glyph" },
    { key: "current", icon: IconWorking, ink: "text-status-live-glyph" },
    { key: "failed", icon: IconError, ink: "text-status-fail-glyph" },
    { key: "stopped", icon: IconStopped, ink: "text-ink-muted" },
    { key: "future", icon: IconNotYet, ink: "text-ink-subtle" },
    { key: "you", icon: IconNeedsYou, ink: "text-status-attn-glyph" },
    { key: "waits", icon: IconHourglass, ink: "text-ink-muted" },
    { key: "gone", icon: IconTrash, ink: "text-ink-subtle" },
  ] as const;
</script>

<span
  class="icon-swap flex-none"
  style:--icon-swap-dur="var(--duration-control)"
  data-box
  data-mark={state}
>
  {#each MARKS as mark (mark.key)}
    {@const Icon = mark.icon}
    <span data-active={mark.key === state} class={mark.ink}>
      <Icon
        aria-hidden="true"
        class={[
          size === "sm" ? "size-icon-sm" : "size-icon-md",
          mark.key === "current" && "breathe loops",
        ]}
      />
    </span>
  {/each}
</span>
