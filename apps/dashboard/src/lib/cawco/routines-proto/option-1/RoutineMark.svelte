<script lang="ts">
  /**
   * A routine's state as a glyph in the row's lead column: on (the repeat),
   * running (the live dot, breathing), needs you, paused, finished. The
   * state's words are said to a screen reader, and the row says them where they
   * matter.
   */
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconNeedsYou,
    IconPause,
    IconRepeat,
    IconSuccess,
  } from "#lib/icons.js";
  import type { RoutineState } from "./harbor";

  let { state, words }: { state: RoutineState; words: string } = $props();
</script>

<span class="grid size-icon-md flex-none place-items-center" data-state={state}>
  <span class="sr-only">{words}</span>
  {#if state === "running"}
    <LiveDot />
  {:else if state === "needs"}
    <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
  {:else if state === "paused"}
    <IconPause class="size-icon-md text-ink-muted" />
  {:else if state === "finished"}
    <IconSuccess class="size-icon-md text-status-done-glyph" />
  {:else}
    <IconRepeat class="size-icon-md text-ink-muted" />
  {/if}
</span>
