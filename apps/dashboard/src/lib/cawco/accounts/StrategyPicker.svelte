<script lang="ts">
  /**
   * How a kind of session chooses its account: four cards, two by two, each
   * holding its strategy's figure. Only the chosen card's figure and the one
   * under the pointer play; the others hold their last frame. Pinned's card
   * carries the account it pins; choosing Fill first unfolds the order the
   * accounts fill in.
   */
  import type { Account, StrategyChoice } from "@cawco/core";
  import { tick } from "svelte";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { IconSubagent } from "#lib/icons.js";
  import { unfold } from "../motion/fold.svelte";
  import {
    hueVar,
    nameOf,
    pinnedOf,
    STRATEGIES,
    type Strategy,
  } from "./model.svelte";
  import OrderList from "./OrderList.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    label,
    accounts,
    choice,
    order,
    onchoice,
    onorder,
  }: {
    /** "Your sessions" or "Delegates": the group's name. */
    label: string;
    accounts: Account[];
    choice: StrategyChoice;
    /** Fill-first order, account ids. */
    order: string[];
    onchoice: (choice: StrategyChoice) => void;
    onorder: (order: string[]) => void;
  } = $props();

  let hover = $state<string | null>(null);
  let grid = $state<HTMLElement | null>(null);

  /** At most four lanes: a figure is an illustration, not a ledger. */
  const shown = $derived(accounts.slice(0, 4));
  const ordered = $derived(
    order
      .map((id) => shown.find((one) => one.id === id))
      .filter((one): one is Account => one !== undefined)
  );
  const lanesOf = (list: Account[]) =>
    list.map((account) => ({
      name: nameOf(account),
      color: hueVar(account.hue),
    }));
  const pinned = $derived(pinnedOf(accounts, choice.pinnedAccountId));

  function choose(strategy: Strategy) {
    if (choice.strategy === strategy.id) {
      return;
    }
    onchoice(
      strategy.id === "pinned"
        ? { strategy: "pinned", pinnedAccountId: pinned?.id }
        : { strategy: strategy.id }
    );
  }

  /** Arrow keys move the choice round the cards, as in any radio group. */
  async function onkeydown(event: KeyboardEvent, at: number) {
    const by = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ];
    if (event.key === "Enter" || event.key === " ") {
      if ((event.target as HTMLElement).matches(".card")) {
        event.preventDefault();
        choose(STRATEGIES[at]);
      }
      return;
    }
    if (by === undefined || !(event.target as HTMLElement).matches(".card")) {
      return;
    }
    event.preventDefault();
    const next = (at + by + STRATEGIES.length) % STRATEGIES.length;
    choose(STRATEGIES[next]);
    await tick();
    grid?.querySelectorAll<HTMLElement>(".card")[next]?.focus();
  }
</script>

<div class="picker">
  <div aria-label={label} class="cards" role="radiogroup" bind:this={grid}>
    {#each STRATEGIES as strategy, at (strategy.id)}
      {@const checked = choice.strategy === strategy.id}
      <!-- biome-ignore lint/a11y/useSemanticElements: the card is a radio holding its own controls (Pinned's account, Fill first's order), which a native radio or button cannot hold -->
      <div
        aria-checked={checked}
        aria-label="{strategy.label}: {strategy.line}"
        class="card"
        onclick={(event) => {
          if (!(event.target as HTMLElement).closest("select, .order")) {
            choose(strategy);
          }
        }}
        onkeydown={(event) => onkeydown(event, at)}
        onpointerenter={() => {
          hover = strategy.id;
        }}
        onpointerleave={() => {
          hover = null;
        }}
        role="radio"
        tabindex={checked ? 0 : -1}
      >
        <div class="top">
          <span aria-hidden="true" class="radio"></span>
          <span class="words">
            {strategy.label}
            <small>{strategy.line}</small>
          </span>
          {#if strategy.id === "pinned"}
            <span class="pin" class:on={checked}>
              <NativeSelect
                aria-label="Pinned account"
                disabled={!checked}
                onchange={(event) => {
                  onchoice({
                    strategy: "pinned",
                    pinnedAccountId: (event.currentTarget as HTMLSelectElement)
                      .value,
                  });
                }}
                size="sm"
                value={pinned?.id}
              >
                {#each accounts as account (account.id)}
                  <NativeSelectOption value={account.id}
                    >{nameOf(account)}</NativeSelectOption
                  >
                {/each}
              </NativeSelect>
            </span>
          {/if}
        </div>
        {#if strategy.id === "fill-first" && checked}
          <div class="order" in:unfold out:unfold>
            <OrderList {accounts} onchange={onorder} {order} />
          </div>
        {/if}
        <StrategyFigure
          board={strategy.board}
          lanes={lanesOf(strategy.board === "fill" ? ordered : shown)}
          pin={strategy.board === "pinned"
            ? Math.max(
                0,
                shown.findIndex((one) => one.id === pinned?.id)
              )
            : undefined}
          playing={checked || hover === strategy.id}
        />
      </div>
    {/each}
  </div>
  <p class="forks">
    <IconSubagent />
    Forks stay on their parent’s account, whatever the strategy.
  </p>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    container-type: inline-size;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
  }
  @container (width < 520px) {
    .cards {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    text-align: start;
    cursor: pointer;
    transition:
      border-color var(--dur-fade) var(--ease-out),
      background-color var(--dur-fade) var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .card {
      transition:
        border-color var(--dur-fade) var(--ease-out),
        background-color var(--dur-fade) var(--ease-out),
        transform var(--dur-control) var(--ease-out);
    }
    .card:active {
      transform: scale(0.995);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .card:hover {
      border-color: var(--border-control);
    }
  }
  .card[aria-checked="true"] {
    border-color: var(--focus-ring);
    background: color-mix(
      in oklab,
      var(--selected-bg) 45%,
      var(--surface-raised)
    );
  }
  .card:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  /* Where the pinned account's name doesn't fit beside the words, its pill
     takes a line of its own, at the name's own width, rather than cutting
     the name short. */
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-height: 30px;
    padding-inline: var(--space-1);
  }
  .radio {
    display: grid;
    flex: none;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1.5px solid var(--neutral-8);
    border-radius: 50%;
    transition: border-color var(--dur-fade) var(--ease-out);
  }
  .radio::after {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--selected-icon);
    scale: 0;
    transition: scale var(--dur-toggle) var(--ease-out);
  }
  .card[aria-checked="true"] .radio {
    border-color: var(--selected-icon);
  }
  .card[aria-checked="true"] .radio::after {
    scale: 1;
  }
  .words {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .words small {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .pin {
    flex: 0 1 auto;
    max-width: 100%;
    min-width: 0;
    margin-inline-start: auto;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  .pin.on {
    opacity: 1;
    pointer-events: auto;
  }
  .forks {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .forks :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
