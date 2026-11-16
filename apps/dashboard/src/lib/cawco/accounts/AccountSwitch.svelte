<script lang="ts">
  import type { AccountProvider } from "@cawco/core/accounts";
  import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import { detach } from "@cawco/core/detach";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import {
    type ChipSize,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { IconChevronDown as Down } from "#lib/icons.js";

  /**
   * A session card's account line: the account the session bills, as its dot
   * and name, and — when its machine has another account of its provider
   * signed in — a picker of them. Picking one moves the session whole
   * (switch.svelte.ts): no confirm, the card's feedback line says it is
   * moving and when it landed, and picking the other one moves it back.
   * While a move waits the chip and the list's check show the account it is
   * moving to (`shownAccount`), as the session's row does; another pick replaces it,
   * and the account it runs on calls it off. Only while this tab's ask is on
   * its way to the hub does it take no picks. Each row is a PickRow: its
   * room, or the limit it is at, checked again before a pick on it goes.
   */

  import PickList from "../pick/PickList.svelte";
  import PickRow from "../pick/PickRow.svelte";
  import NsPopover from "../spawn/NsPopover.svelte";
  import { accountsStore } from "../stores/accounts.svelte";
  import { usageStore } from "../stores/usage.svelte";
  import { forcePast, pickPastLimit } from "./limit-checks.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import { limitRowOf, roomOf } from "./room";
  import {
    type AccountHolder,
    asking,
    moveTo,
    shownAccount,
    signedInHere,
    switchable,
  } from "./switch.svelte";

  let {
    instance,
    readonly,
    size = "regular",
    onpick,
    none,
  }: {
    instance: AccountHolder;
    /**
     * No move can be asked now: the hub is away. A session's state never
     * locks it: the account is the session's, and a sleeping, stopped or
     * machine-away session moves too (switch.svelte.ts).
     */
    readonly: boolean;
    /** The chip's size: the session card's settings group is `compact`. */
    size?: ChipSize;
    /**
     * Takes the pick in place of a move: the account a stored transcript
     * resumes on, which no session of the hub's runs on yet.
     */
    onpick?: (accountId: string) => void;
    /**
     * A holder on no account (a stored transcript whose sign-in is no
     * account of CawCo's): what the chip says, and the provider whose
     * accounts signed in on its machine it offers, any one a pick.
     */
    none?: { label: string; provider: AccountProvider };
  } = $props();
  const chip = $derived(
    chipVariants({ variant: "setting", size, class: "min-w-0 max-w-full" })
  );

  let open = $state(false);
  /** The clock the rows' limits are read against, a minute at a time. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });
  const accounts = $derived(
    none && !instance.accountId
      ? signedInHere(instance, none.provider)
      : switchable(instance)
  );
  const shown = $derived.by(() => {
    const id = shownAccount(instance);
    return (
      accountsStore.accounts?.accounts.find((one) => one.id === id) ?? null
    );
  });
  const name = $derived(shown ? nameOf(shown) : (none?.label ?? ""));
  const pickable = $derived(
    !(readonly || asking(instance)) && accounts.length > 0
  );

  function pick(id: string) {
    open = false;
    if (onpick) {
      onpick(id);
      return;
    }
    detach(moveTo(instance, id), "moveTo");
  }
</script>

{#snippet face()}
  {#if shown}
    <span
      data-slot="dot"
      aria-hidden="true"
      class="size-space-2 flex-none rounded-pill bg-(--c)"
      style:--c={hueVar(shown.hue)}
    ></span>
  {/if}
  <span data-slot="chip-label" data-account-chip>{name}</span>
{/snippet}

{#if shown || none}
  {#if pickable}
    <NsPopover
      haspopup="listbox"
      id={`details-account-${instance.id}`}
      label={`Account: ${name}`}
      onchange={(value) => {
        open = value;
      }}
      {open}
      rows="[data-pick-row]"
      triggerClass={chip}
      triggerData={{ "data-tool": true, "data-account-chip": true }}
      width={360}
    >
      {#snippet trigger()}
        {@render face()}
        <Down data-slot="chevron" />
      {/snippet}
      <!-- The pick is the checked row from the moment it is made: the
           account it is moving to, as the chip shows it, never the one it
           is leaving. A row at its limit is checked again before its pick
           goes (limit-checks.svelte.ts). -->
      <PickList label="Account">
        {#each accounts as account (account.id)}
          {@const key = `account:${account.id}`}
          {@const limit = limitRowOf(
            key,
            account.provider === CLAUDE_PROVIDER
              ? roomOf(usageStore.claudeLimits[account.id], null, now)
              : null,
            now
          )}
          <PickRow
            checking={limit.checking}
            detail={limit.detail}
            force={limit.held
              ? {
                  action: limitPickWords.moveAnyway,
                  onforce: () => forcePast(key, () => pick(account.id)),
                }
              : undefined}
            full={account.label && account.email
              ? `${account.email}\n${limit.detail}`
              : limit.detail}
            limited={limit.limited}
            name={nameOf(account)}
            onpick={() => {
              if (limit.limited) {
                detach(
                  pickPastLimit(key, account.id, null, () => pick(account.id)),
                  "pickPastLimit"
                );
              } else {
                pick(account.id);
              }
            }}
            picked={account.id === shown?.id}
          >
            {#snippet lead()}
              <span
                aria-hidden="true"
                class="size-space-2 rounded-pill bg-(--c)"
                data-box
                style:--c={hueVar(account.hue)}
              ></span>
            {/snippet}
          </PickRow>
        {/each}
      </PickList>
    </NsPopover>
  {:else}
    <!-- Nothing to pick: one account of its provider here, an ask on its
         way to the hub (the feedback line says so), or the hub away. -->
    <span data-tool data-account-chip data-variant="static" class={chip}>
      <span class="sr-only">Account:</span>
      {@render face()}
    </span>
  {/if}
{/if}
