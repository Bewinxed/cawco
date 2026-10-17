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
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the session's rows say the move and name the new account when it lands; a refusal stays on them (moveTo)
    void moveTo(instance, id);
  }
</script>

{#snippet face()}
  <!-- literal: 8px, 50% -->
  <span
    data-slot="dot"
    aria-hidden="true"
    class="size-(--dot) flex-none rounded-(--dot-r) bg-(--c)"
    style:--c={hueVar(shown?.hue ?? "amber")}
    style:--dot="8px"
    style:--dot-r="50%"
  ></span>
  <span data-slot="chip-label" data-account-chip>{name}</span
  >
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
      triggerClass="ns-chip-btn max-w-full min-w-0"
      triggerData={{ "data-tool": true, "data-account-chip": true }}
      width={320}
    >
      {#snippet trigger()}
        {@render face()}
        <Down data-slot="chevron" />
      {/snippet}
      <div
        data-slot="list"
        aria-label="Account"
        class="flex flex-col p-space-2"
        role="listbox"
      >
        {#each accounts as account (account.id)}
          {@const current = account.id === instance.accountId}
          {@const going = account.id === target}
          <!-- literal: 16px minmax(0, 1fr) 16px, 40px, 44px, 8px, 50% -->
          <button
            data-slot="option"
            aria-selected={current}
            class="group mark-line grid min-h-(--option-min) w-full cursor-pointer grid-cols-(--option-cols) items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-3 py-space-2 text-start text-ink-strong coarse:min-h-(--option-min-coarse) disabled:cursor-default"
            data-account-option={account.id}
            disabled={going}
            onclick={() => pick(account.id)}
            role="option"
            style:--option-cols="16px minmax(0, 1fr) 16px"
            style:--option-min="40px"
            style:--option-min-coarse="44px"
            type="button"
          >
            <span
              data-account-switch-lead
              data-slot="dot"
              aria-hidden="true"
              class="mx-space-1 size-(--dot) flex-none rounded-(--dot-r) bg-(--c)"
              data-box
              style:--c={hueVar(account.hue)}
              style:--dot="8px"
              style:--dot-r="50%"
            ></span>
            {#if going}
              <span
                class="type-label min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-muted"
                >Moving to {nameOf(account)}…</span
              >
            {:else}
              <AccountName {account} row />
            {/if}
            <IconCheck
              class="size-icon-md text-selected-icon opacity-0 group-aria-selected:opacity-100 motion-safe:transition-[opacity] motion-safe:dur-control motion-safe:ease-out"
            />
          </button>
        {/each}
      </div>
    </NsPopover>
  {:else}
    <!-- Nothing to pick: one account of its provider here, a move in
         flight (the feedback line says so), or a session that takes no
         changes now. -->
    <span
      data-tool
      data-slot="ns-chip-btn"
      data-account-chip
      data-variant="static"
      class="ns-chip-btn max-w-full min-w-0"
    >
      <span class="sr-only">Account:</span>
      {@render face()}
    </span>
  {/if}
{/if}
