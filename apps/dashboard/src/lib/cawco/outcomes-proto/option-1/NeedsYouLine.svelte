<script lang="ts">
  /**
   * The Needs you line (shared part S2), standing directly under the line
   * it concerns (or under the outcome's sentence when it names none): the
   * house Needs you mark (the attention glyph and ink), who asks and the
   * ask in the asker's words, two lines at most, and one control named for
   * the act and its object. Several asks: the oldest, then "and 1 more".
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import type { Ask } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    ask,
    more,
    disabled,
    reason,
    onact,
  }: {
    ask: Ask;
    /** Asks after this one under the same outcome. */
    more: number;
    /** Its control can't act now (the hub is not answering), and why. */
    disabled: boolean;
    reason?: string;
    onact: () => void;
  } = $props();
</script>

<div
  data-slot="needs"
  class="flex flex-col items-start gap-space-2 pt-space-1 pb-space-2"
>
  <p class="m-0 mark-line flex min-w-0 items-start gap-space-2 type-body">
    <span class="mark-cell">
      <IconNeedsYou
        aria-hidden="true"
        class="size-icon-md text-status-attn-glyph"
      />
    </span>
    <span data-box class="line-clamp-3 min-w-0 text-pretty">
      <span class="font-medium text-status-attn-ink"
        >{outcomesWords.asks(ask.from)}</span
      >
      <span class="text-ink-strong">{ask.ask}</span>
    </span>
  </p>
  <div class="flex flex-wrap items-center gap-space-3 ps-space-6">
    <Button
      {disabled}
      label={ask.act}
      onclick={onact}
      press="pressable"
      size="sm"
      title={disabled ? reason : undefined}
      variant="outline"
    />
    {#if more > 0}
      <span class="type-meta text-ink-muted">{outcomesWords.andMore(more)}</span
      >
    {/if}
  </div>
</div>
