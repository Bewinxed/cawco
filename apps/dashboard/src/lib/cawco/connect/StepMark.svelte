<script lang="ts">
  /**
   * One step's status glyph, Solar duotone: check-circle done, refresh-circle
   * current (breathing, as live work does), close-circle failed, stop-circle
   * stopped, the hollow record not reached yet. A change of state is an
   * icon swap in its one cell (`icon-swap`, 120ms): the old glyph gives way
   * as the new one arrives from 0.92, never a jump. Status is never the hue
   * alone: the glyph's shape says it, and the row's words.
   */
  import {
    IconError,
    IconFuture,
    IconStopped,
    IconSuccess,
    IconWorking,
  } from "#lib/icons.js";
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
    { key: "done", icon: IconSuccess, ink: "text-status-done-glyph" },
    { key: "current", icon: IconWorking, ink: "text-status-live-glyph" },
    { key: "failed", icon: IconError, ink: "text-status-fail-glyph" },
    { key: "stopped", icon: IconStopped, ink: "text-ink-muted" },
    { key: "future", icon: IconFuture, ink: "text-ink-subtle" },
  ] as const;
</script>

<span
  class="icon-swap flex-none"
  style:--icon-swap-dur="var(--dur-control)"
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
