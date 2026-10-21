<script lang="ts">
  import {
    type ChipSize,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
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
  import { type BoardRow, cawco } from "../client.svelte";
  import NsPopover from "../spawn/NsPopover.svelte";
  import AccountName from "./AccountName.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { moveTo, movingTo, shownAccount, switchable } from "./switch.svelte";

  let {
    instance,
    readonly,
    size = "regular",
  }: {
    instance: BoardRow;
    /** The session cannot take changes now (ended, or the hub is away). */
    readonly: boolean;
    /** The chip's size: the session card's settings group is `compact`. */
    size?: ChipSize;
  } = $props();
  const chip = $derived(
    chipVariants({ variant: "setting", size, class: "min-w-0 max-w-full" })
  );

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
  <span
    data-slot="dot"
    aria-hidden="true"
    class="size-space-2 flex-none rounded-pill bg-(--c)"
    style:--c={hueVar(shown?.hue ?? "amber")}
  ></span>
  <span data-slot="chip-label" data-account-chip>{name}</span>
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
      triggerClass={chip}
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
          <button
            data-slot="option"
            aria-selected={current}
            class="group press-tint transition-control mark-line select-none grid min-h-c-btn-h w-full grid-cols-(--option-cols) items-center gap-space-3 rounded-sm border-none border-current bg-transparent px-space-3 py-space-2 text-start text-ink-strong coarse:min-h-c-btn-h-lg"
            data-account-option={account.id}
            disabled={going}
            onclick={() => pick(account.id)}
            role="option"
            style:--option-cols="var(--icon-md) minmax(0, 1fr) var(--icon-md)"
            type="button"
          >
            <span
              data-account-switch-lead
              data-slot="dot"
              aria-hidden="true"
              class="size-space-2 flex-none justify-self-center rounded-pill bg-(--c)"
              data-box
              style:--c={hueVar(account.hue)}
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
              class="size-icon-md text-selected-icon opacity-0 group-aria-selected:opacity-100 motion-safe:transition-[opacity] motion-safe:duration-(--dur-control) motion-safe:ease-out"
            />
          </button>
        {/each}
      </div>
    </NsPopover>
  {:else}
    <!-- Nothing to pick: one account of its provider here, a move in
         flight (the feedback line says so), or a session that takes no
         changes now. -->
    <span data-tool data-account-chip data-variant="static" class={chip}>
      <span class="sr-only">Account:</span>
      {@render face()}
    </span>
  {/if}
{/if}
