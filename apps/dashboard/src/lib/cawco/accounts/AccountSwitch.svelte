<script lang="ts">
  import { IconCheck } from "#lib/icons.js";
  /**
   * A session card's account line: the account the session bills, as its dot
   * and name, and — when its machine has another account of its provider
   * signed in — a picker of them. Picking one moves the session whole
   * (switch.svelte.ts): no confirm, the card's feedback line says it is
   * moving and when it landed, and picking the other one moves it back.
   * While a move is in flight the chip shows the account it is moving to
   * (`shownAccount`), as the session's row does, and takes no picks.
   */
  import Down from "~icons/solar/alt-arrow-down-linear";
  import { cawco, type InstanceRow } from "../client.svelte";
  import NsPopover from "../spawn/NsPopover.svelte";
  import AccountName from "./AccountName.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { moveTo, movingTo, shownAccount, switchable } from "./switch.svelte";

  let {
    instance,
    readonly,
  }: {
    instance: InstanceRow;
    /** The session cannot take changes now (ended, or the hub is away). */
    readonly: boolean;
  } = $props();

  let open = $state(false);
  const accounts = $derived(switchable(instance));
  const target = $derived(movingTo(instance));
  const shown = $derived.by(() => {
    const id = shownAccount(instance);
    return cawco.accounts?.accounts.find((one) => one.id === id) ?? null;
  });
  const name = $derived(shown ? nameOf(shown) : "");
  const pickable = $derived(
    !readonly && target === undefined && accounts.length > 0
  );

  function pick(id: string) {
    open = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the row names the new account when the move lands, and a refusal is moveTo's toast
    void moveTo(instance, id);
  }
</script>

{#snippet face()}
  <span
    aria-hidden="true"
    class="dot"
    style:--c={hueVar(shown?.hue ?? "amber")}
  ></span>
  <span class="chip-label" data-account-chip>{name}</span>
{/snippet}

{#if shown}
  {#if pickable}
    <NsPopover
      haspopup="listbox"
      id={`details-account-${instance.id}`}
      label={`Account: ${name}`}
      onchange={(value) => {
        open = value;
      }}
      {open}
      rows="[data-account-option]"
      triggerClass="ns-chip-btn tool account-chip"
      width={320}
    >
      {#snippet trigger()}
        {@render face()}
        <Down class="chevron" />
      {/snippet}
      <div aria-label="Account" class="list" role="listbox">
        {#each accounts as account (account.id)}
          {@const current = account.id === instance.accountId}
          {@const going = account.id === target}
          <button
            aria-selected={current}
            class="option"
            data-account-option={account.id}
            disabled={going}
            onclick={() => pick(account.id)}
            role="option"
            type="button"
          >
            <span
              aria-hidden="true"
              class="dot lead"
              style:--c={hueVar(account.hue)}
            ></span>
            {#if going}
              <span class="going">Moving to {nameOf(account)}…</span>
            {:else}
              <AccountName {account} row />
            {/if}
            <IconCheck class="check" />
          </button>
        {/each}
      </div>
    </NsPopover>
  {:else}
    <!-- Nothing to pick: one account of its provider here, a move in
         flight (the feedback line says so), or a session that takes no
         changes now. -->
    <span class="ns-chip-btn tool static account-chip">
      <span class="sr-only">Account:</span>
      {@render face()}
    </span>
  {/if}
{/if}

<style>
  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--c);
  }
  .dot.lead {
    margin-inline: 4px;
  }
  /* The chip is as wide as the name; a long email ends in an ellipsis
     inside the label (The Truncate Inside Rule), never on the chip. */
  :global(.account-chip) {
    max-inline-size: 100%;
    min-inline-size: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    padding: var(--space-2);
  }
  .option {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) 16px;
    gap: var(--space-3);
    align-items: center;
    inline-size: 100%;
    min-block-size: 40px;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;

    @media (pointer: coarse) {
      min-block-size: 44px;
    }
  }
  .option:disabled {
    cursor: default;
  }
  .going {
    font: var(--type-label);
    color: var(--ink-muted);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .option :global(.check) {
    inline-size: 16px;
    block-size: 16px;
    color: var(--selected-icon);
    opacity: 0;

    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--dur-control) var(--ease-out);
    }
  }
  .option[aria-selected="true"] :global(.check) {
    opacity: 1;
  }
</style>
