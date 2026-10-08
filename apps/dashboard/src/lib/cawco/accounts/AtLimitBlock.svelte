<script lang="ts">
  /**
   * What a running session does when its account runs out and another is
   * free: wait for a reset that is close, move a small conversation whole,
   * or continue a large one from a summary written while the cache is warm.
   * The figure under the numbers plays that policy, rebuilt as they change.
   * Off, the numbers fold away with the figure and the terms.
   */
  import type { Account, AtLimit } from "@cawco/core";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconArrowUpRight } from "#lib/icons.js";
  import { hueVar, nameOf, TERMS_URL } from "./model.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    atLimit = $bindable(),
    accounts,
  }: {
    atLimit: AtLimit;
    /** The account that runs out, then the one that is free. */
    accounts: [Account, Account];
  } = $props();

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
  <h3 class="head">
    When a session hits its limit and another account is free
  </h3>
  <div class="switch-line">
    <label for="{id}-move">Move running sessions between accounts</label>
    <Switch id="{id}-move" bind:checked={atLimit.move} />
  </div>
  {#if atLimit.move}
    <div class="rows" in:unfold out:unfold>
      <p class="pr">
        <label for="{id}-wait">Wait if the window resets within</label>
        <Input
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
        <span>minutes</span>
      </p>
      <p class="pr">
        <label for="{id}-under"
          >Move the whole conversation if it’s under</label
        >
        <Input
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
        <span>k tokens</span>
        <span class="aside">The new account re-reads it from scratch.</span>
      </p>
      <p class="pr">Otherwise continue from a summary</p>
      <p class="pr">
        <label for="{id}-at">Write that summary early, at</label>
        <Input
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
        <span>%</span>
        <span class="aside"
          >While the current account’s cache is still warm.</span
        >
      </p>
      <div class="figure">
        <StrategyFigure board="limit" {lanes} playing {policy} wide />
      </div>
      <a
        class="terms"
        href={TERMS_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        Moving a conversation between Claude subscriptions is subject to
        Anthropic’s terms
        <IconArrowUpRight />
      </a>
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
