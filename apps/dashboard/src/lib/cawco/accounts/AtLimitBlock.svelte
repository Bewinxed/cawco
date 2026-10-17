<script lang="ts">
  /**
   * What a running session does when its account runs out and another is
   * free: wait for a reset that is close, or move whole, a large
   * conversation then compacted there by Claude Code's own /compact after it
   * files its open items. The figure under the numbers plays that policy,
   * rebuilt as they change. Off, the numbers fold away with the figure and
   * the terms.
   */
  import { type Account, type AtLimit, accountsWords } from "@cawco/core";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconArrowUpRight } from "#lib/icons.js";
  import { hueVar, nameOf, TERMS_URL } from "./model.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    atLimit = $bindable(),
    accounts,
    terms,
  }: {
    atLimit: AtLimit;
    /** The account that runs out, then the one that is free. */
    accounts: [Account, Account];
    /** Claude subscriptions: Anthropic's terms cover the move, so they are linked. */
    terms: boolean;
  } = $props();

  const words = accountsWords.atLimit;
  const id = $props.id();
  const lanes = $derived(
    accounts.map((account) => ({
      name: nameOf(account),
      color: hueVar(account.hue),
    }))
  );
  const policy = $derived({
    wait: atLimit.waitMinutes,
    over: atLimit.moveWholeUnderK,
  });

  /** A field's number: whole, at least 0; empty reads as 0. */
  function whole(value: string): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
</script>

<div class="@container flex flex-col">
  <h3
    data-slot="head"
    class="type-label mb-space-3 text-balance text-ink-strong"
  >
    {words.head}
  </h3>
  <div
    class="flex items-center justify-between gap-space-4 pt-space-2 pb-space-3 text-ink-row"
  >
    <label class="cursor-pointer" for="{id}-move">{words.move}</label>
    <Switch id="{id}-move" bind:checked={atLimit.move} />
  </div>
  {#if atLimit.move}
    <!-- literal: 64px -->
    <div class="flex flex-col" in:unfold out:unfold style:--field-w="64px">
      <p
        class="flex flex-wrap items-center gap-space-3 px-0 py-space-2 text-pretty text-ink-row"
      >
        <label for="{id}-wait">{words.wait}</label>
        <Input
          data-num
          data-field
          class="num h-c-btn-h-sm w-(--field-w) flex-none px-space-2 text-center"
          id="{id}-wait"
          inputmode="numeric"
          min="0"
          oninput={(event) => {
            atLimit.waitMinutes = whole(event.currentTarget.value);
          }}
          type="number"
          value={atLimit.waitMinutes}
        />
        <span>{words.minutes}</span>
      </p>
      <p
        class="flex flex-wrap items-center gap-space-3 px-0 py-space-2 text-pretty text-ink-row"
      >
        <label for="{id}-over">{words.over}</label>
        <Input
          data-num
          data-field
          class="num h-c-btn-h-sm w-(--field-w) flex-none px-space-2 text-center"
          id="{id}-over"
          inputmode="numeric"
          min="0"
          oninput={(event) => {
            atLimit.moveWholeUnderK = whole(event.currentTarget.value);
          }}
          type="number"
          value={atLimit.moveWholeUnderK}
        />
        <span>{words.kTokens}</span>
        <span class="type-meta text-ink-muted">{words.compacts}</span>
      </p>
      <div class="my-space-3">
        <StrategyFigure board="limit" {lanes} playing {policy} />
      </div>
      {#if terms}
        <a
          class="mark-line inline-flex items-center gap-space-1 self-start rounded-xs type-label text-pretty text-link-ink no-underline hover:text-link-hover"
          href={TERMS_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{words.terms}</span>
          <IconArrowUpRight class="size-icon-sm flex-none" />
        </a>
      {/if}
    </div>
  {/if}
</div>
