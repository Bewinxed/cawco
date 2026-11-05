<script lang="ts" module>
  import type { AttemptState } from "./records";

  /** Every state a glyph says: an attempt's, a session's or Caw's. */
  export type Status =
    AttemptState | "idle" | "off" | "unreachable" | "on" | "paused";
</script>

<script lang="ts">
  import { fivePlacesWords as words } from "@cawco/core/words/proto-five-places";
  /**
   * A state as glyph, then word, then hue (DESIGN.md, The Glyph, Word, Hue
   * Rule; Session status): the Solar glyph alone at 16px (12px beside meta),
   * then its word in the label role, tinted live, attn or fail where it
   * applies. `wordless` keeps the word as the glyph's accessible name and
   * tooltip, for a fixed glyph column.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconClose,
    IconMoonSleep,
    IconNeedsYou,
    IconNotYet,
    IconPause,
    IconTick,
    IconWorking,
  } from "#lib/icons.js";

  let {
    status,
    word,
    wordless = false,
    small = false,
  }: {
    status: Status;
    /** The word, where the place says it its own way. */
    word?: string;
    wordless?: boolean;
    small?: boolean;
  } = $props();

  const said = $derived(
    word ??
      {
        working: words.attempt.working,
        queued: words.attempt.queued,
        needs: words.attempt.needs,
        failed: words.attempt.failed,
        blocked: words.attempt.blocked,
        landed: words.attempt.landed,
        idle: words.cawStatus.idle,
        off: words.cawStatus.off,
        unreachable: words.cawStatus.unreachable,
        on: words.cawStatus.idle,
        paused: words.off,
      }[status]
  );

  const Glyph = $derived(
    {
      working: IconWorking,
      queued: IconNotYet,
      needs: IconNeedsYou,
      failed: IconClose,
      blocked: IconPause,
      landed: IconTick,
      idle: IconPause,
      off: IconMoonSleep,
      unreachable: IconNotYet,
      on: IconTick,
      paused: IconPause,
    }[status]
  );

  const ink = $derived(
    {
      working: "text-status-live-ink",
      queued: "text-ink-muted",
      needs: "text-status-attn-ink",
      failed: "text-status-fail-ink",
      blocked: "text-status-fail-ink",
      landed: "text-status-done-ink",
      idle: "text-ink-muted",
      off: "text-ink-muted",
      unreachable: "text-ink-muted",
      on: "text-ink-muted",
      paused: "text-ink-muted",
    }[status]
  );

  const glyphInk = $derived(
    {
      working: "text-status-live-glyph breathe loops",
      queued: "text-ink-subtle",
      needs: "text-status-attn-glyph",
      failed: "text-status-fail-glyph",
      blocked: "text-status-fail-glyph",
      landed: "text-status-done-glyph",
      idle: "text-ink-subtle",
      off: "text-ink-subtle",
      unreachable: "text-ink-subtle",
      on: "text-ink-subtle",
      paused: "text-ink-subtle",
    }[status]
  );
</script>

{#if wordless}
  <Tip label={said}>
    {#snippet children(tip)}
      <span
        {...tip}
        class="mark-cell inline-flex flex-none items-center"
        role="img"
        aria-label={said}
        data-box
      >
        <Glyph
          aria-hidden="true"
          class={[small ? "size-icon-sm" : "size-icon-md", glyphInk]}
        />
      </span>
    {/snippet}
  </Tip>
{:else}
  <span
    class={[
      "mark-line inline-flex min-w-0 items-center gap-space-1",
      small ? "type-meta" : "type-label",
      ink,
    ]}
  >
    <Glyph
      aria-hidden="true"
      class={["flex-none", small ? "size-icon-sm" : "size-icon-md", glyphInk]}
    />
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{said}</span
    >
  </span>
{/if}
