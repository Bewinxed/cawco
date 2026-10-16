<script lang="ts">
  /**
   * What a running session does when its account runs out and another is
   * free: wait for a reset that is close, move a small conversation whole,
   * or continue a large one from a summary written while the cache is warm.
   * The figure under the numbers plays that policy, rebuilt as they change.
   * Off, the numbers fold away with the figure and the terms.
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
    under: atLimit.moveWholeUnderK,
    at: atLimit.prepareAtPct,
  });

  /** A field's number: whole, at least 0, at most `max`; empty reads as 0. */
  function whole(value: string, max = Number.POSITIVE_INFINITY): number {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
  }
</script>

<div class="lim">
  <h3 data-slot="head" class="head">{words.head}</h3>
  <div class="switch-line">
    <label for="{id}-move">{words.move}</label>
    <Switch id="{id}-move" bind:checked={atLimit.move} />
  </div>
  {#if atLimit.move}
    <div class="rows" in:unfold out:unfold>
      <p class="pr">
        <label for="{id}-wait">{words.wait}</label>
        <Input
          data-num
          data-field
          class="num field"
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
      <p class="pr">
        <label for="{id}-under">{words.under}</label>
        <Input
          data-num
          data-field
          class="num field"
          id="{id}-under"
          inputmode="numeric"
          min="0"
          oninput={(event) => {
            atLimit.moveWholeUnderK = whole(event.currentTarget.value);
          }}
          type="number"
          value={atLimit.moveWholeUnderK}
        />
        <span>{words.kTokens}</span>
        <span class="aside">{words.rereads}</span>
      </p>
      <p class="pr">{words.otherwise}</p>
      <p class="pr">
        <label for="{id}-at">{words.early}</label>
        <Input
          data-num
          data-field
          class="num field"
          id="{id}-at"
          inputmode="numeric"
          max="100"
          min="0"
          oninput={(event) => {
            atLimit.prepareAtPct = whole(event.currentTarget.value, 100);
          }}
          type="number"
          value={atLimit.prepareAtPct}
        />
        <span>{words.percent}</span>
        <span class="aside">{words.warm}</span>
      </p>
      <div class="figure">
        <StrategyFigure board="limit" {lanes} playing {policy} />
      </div>
      {#if terms}
        <a
          class="terms mark-line"
          href={TERMS_URL}
          rel="noopener noreferrer"
          target="_blank"
        >
          <span>{words.terms}</span>
          <IconArrowUpRight />
        </a>
      {/if}
    </div>
  {/if}
</div>

<style>
  .lim {
    display: flex;
    flex-direction: column;
    container-type: inline-size;
  }
  .head {
    margin-block-end: var(--space-3);
    font: var(--type-label);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .switch-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding-block: var(--space-2) var(--space-3);
    color: var(--ink-row);
  }
  .switch-line label {
    cursor: pointer;
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .pr {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    color: var(--ink-row);
    text-wrap: pretty;
  }
  .pr :global(.field) {
    flex: none;
    width: 64px;
    height: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .aside {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .figure {
    margin-block: var(--space-3);
  }
  .terms {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    border-radius: var(--radius-xs);
    font: var(--type-label);
    color: var(--link-ink);
    text-decoration: none;
    text-wrap: pretty;
  }
  @media (hover: hover) and (pointer: fine) {
    .terms:hover {
      color: var(--link-hover);
    }
  }
  .terms :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
  }
</style>
