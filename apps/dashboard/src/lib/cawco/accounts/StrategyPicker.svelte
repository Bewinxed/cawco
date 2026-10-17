<script lang="ts">
  /**
   * How a kind of session chooses its account: a card per strategy the
   * provider offers (four where CawCo reads its limits, Pinned and Fill first
   * where it doesn't: core `strategiesFor`), two by two, each holding its
   * strategy's figure. Only the chosen card's figure and the one under the
   * pointer play; the others hold their last frame. Pinned's card carries
   * the account it pins; choosing Fill first unfolds the order the accounts
   * fill in.
   */
  import {
    type Account,
    type AccountProvider,
    accountsWords,
    type StrategyChoice,
    strategiesFor,
  } from "@cawco/core";
  import { tick } from "svelte";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { IconSubagent } from "#lib/icons.js";
  import { appear, crossOut } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import {
    hueVar,
    nameOf,
    pinnedOf,
    providerLimits,
    STRATEGIES,
    type Strategy,
  } from "./model.svelte";
  import OrderList from "./OrderList.svelte";
  import StrategyFigure from "./StrategyFigure.svelte";

  let {
    label,
    provider,
    accounts,
    choice,
    order,
    onchoice,
    onorder,
  }: {
    /** "Your sessions" or "Delegates": the group's name. */
    label: string;
    /** Whose accounts these are: it decides the strategies offered. */
    provider: AccountProvider;
    accounts: Account[];
    choice: StrategyChoice;
    /** Fill-first order, account ids. */
    order: string[];
    onchoice: (choice: StrategyChoice) => void;
    onorder: (order: string[]) => void;
  } = $props();

  const words = accountsWords.routingEditor;
  let hover = $state<string | null>(null);
  let grid = $state<HTMLElement | null>(null);

  const offered = $derived(
    STRATEGIES.filter((one) => strategiesFor(provider).includes(one.id))
  );

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
      if (
        (event.target as HTMLElement).matches(
          '[data-slot="strategy-picker-card"]'
        )
      ) {
        event.preventDefault();
        choose(offered[at]);
      }
      return;
    }
    if (
      by === undefined ||
      !(event.target as HTMLElement).matches(
        '[data-slot="strategy-picker-card"]'
      )
    ) {
      return;
    }
    event.preventDefault();
    const next = (at + by + offered.length) % offered.length;
    choose(offered[next]);
    await tick();
    grid
      ?.querySelectorAll<HTMLElement>('[data-slot="strategy-picker-card"]')
      [next]?.focus();
  }
</script>

<div data-slot="picker" class="@container flex flex-col gap-space-3">
  <div
    data-slot="cards"
    aria-label={label}
    class="grid grid-cols-2 gap-space-3 @max-decisions-520px:grid-cols-1"
    role="radiogroup"
    bind:this={grid}
  >
    {#each offered as strategy, at (strategy.id)}
      {@const checked = choice.strategy === strategy.id}
      <!-- biome-ignore lint/a11y/useSemanticElements: the card is a radio holding its own controls (Pinned's account, Fill first's order), which a native radio or button cannot hold -->
      <div
        data-slot="strategy-picker-card"
        aria-checked={checked}
        aria-label={words.card(strategy.label, strategy.line)}
        class="group flex min-w-0 cursor-pointer flex-col gap-space-3 rounded-lg border border-border-well bg-surface-raised p-space-3 text-start transition-[border-color,background-color] dur-fade ease-out not-aria-checked:hover:border-border-control aria-checked:border-focus-ring aria-checked:bg-strategy-card-picked focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset) motion-safe:transition-pick-card motion-safe:active:transform-(--card-press)"
        style:--card-press="scale(0.995)"
        onclick={(event) => {
          if (
            !(event.target as HTMLElement).closest(
              'select, [data-slot="order"]'
            )
          ) {
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
        <div
          data-slot="top"
          class="flex min-h-c-btn-h-sm flex-wrap items-center gap-x-space-3 gap-y-space-2 px-space-1"
        >
          <!-- literal: 1.5px, 50%, 8px -->
          <span
            aria-hidden="true"
            class="radio grid size-icon-md flex-none place-items-center rounded-(--radio-radius) border-(length:--radio-border) border-neutral-8 transition-[border-color] dur-fade ease-out group-aria-checked:border-selected-icon"
            style:--radio-border="1.5px"
            style:--radio-radius="50%"
            style:--radio-dot="8px"
          ></span>
          <!-- literal: 1px -->
          <span
            data-slot="words"
            class="type-label flex min-w-0 flex-auto flex-col gap-(--words-gap) text-ink-strong"
            style:--words-gap="1px"
          >
            {strategy.label}
            <small class="type-meta text-ink-muted">{strategy.line}</small>
          </span>
          <!-- Only the chosen Pinned card names its account: an unchosen one
               keeps no room for it. -->
          {#if strategy.id === "pinned" && checked}
            <span
              class="ms-auto max-w-full min-w-0 flex-initial"
              in:appear
              out:crossOut
            >
              <NativeSelect
                aria-label={words.pinnedAccount}
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
          <div data-slot="order" in:unfold out:unfold>
            <OrderList {accounts} onchange={onorder} {order} />
          </div>
        {/if}
        <StrategyFigure
          board={strategy.board}
          lanes={lanesOf(strategy.board === "fill" ? ordered : shown)}
          limits={providerLimits(provider)}
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
  <!-- literal: 14px -->
  <p
    class="mark-line type-meta flex items-center gap-space-2 text-ink-muted"
    style:--forks-icon="14px"
  >
    <IconSubagent class="size-(--forks-icon)" />
    <span>{words.forks}</span>
  </p>
</div>

<style>
  /* residual: pseudo */
  .radio::after {
    content: "";
    width: var(--radio-dot);
    height: var(--radio-dot);
    border-radius: 50%;
    background: var(--selected-icon);
    scale: 0;
    transition: scale var(--dur-toggle) var(--ease-out);
  }
  [data-slot="strategy-picker-card"][aria-checked="true"] .radio::after {
    scale: 1;
  }
</style>
