<script lang="ts">
  /**
   * Where a routine or an outcome stands, as the glyph in its row's lead
   * column: the two that need him in their status hues (a run's question,
   * the Needs-you hand; turned off after failing, the failed cross), the
   * rest in quiet ink (runs on its own, a clock; paused; finished, a tick), and a live dot
   * while a run is going. The word is its accessible name and its tooltip;
   * the row's own words say it too.
   */
  import { routineOutcomeWords as words } from "@cawco/core/words/routine-outcomes";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconClock,
    IconError,
    IconNeedsYou,
    IconPause,
    IconTick,
  } from "#lib/icons.js";
  import type { Standing } from "./outcomes";

  let {
    standing,
    going = false,
  }: {
    standing: Standing;
    /** A run of it is going now (a routine's own mark, never an outcome's). */
    going?: boolean;
  } = $props();

  const word = $derived(
    going && standing === "running" ? words.state.going : words.state[standing]
  );
</script>

<span
  data-slot="standing"
  data-standing={standing}
  class={[
    "mark-cell",
    standing === "asks" && "text-status-attn-glyph",
    standing === "failing" && "text-status-fail-glyph",
    standing !== "asks" && standing !== "failing" && "text-ink-subtle",
  ]}
  title={word}
>
  {#if going && standing === "running"}
    <LiveDot size="row" />
  {:else if standing === "asks"}
    <IconNeedsYou aria-hidden="true" class="size-icon-md" />
  {:else if standing === "failing"}
    <IconError aria-hidden="true" class="size-icon-md" />
  {:else if standing === "paused"}
    <IconPause aria-hidden="true" class="size-icon-md" />
  {:else if standing === "finished"}
    <IconTick aria-hidden="true" class="size-icon-md" />
  {:else}
    <IconClock aria-hidden="true" class="size-icon-md" />
  {/if}
  <span class="sr-only">{word}</span>
</span>
