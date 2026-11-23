<script lang="ts">
  import type { Account, AccountProvider } from "@cawco/core/accounts";
  import { detach } from "@cawco/core/detach";
  import { limitPickWords } from "@cawco/core/words/limit-picks";
  import {
    type ChipSize,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { IconChevronDown as Down, IconUser } from "#lib/icons.js";

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
   * room, or the limit it is at, checked again before a pick on it goes
   * (AccountPickRows).
   *
   * With `choice` in place of a session it is a project's account chip: the
   * accounts it offers, the one named (null while the fleet routes it,
   * which `choice.auto` names and offers as the list's first row), and the
   * pick handed back, no session moved.
   */

  import NsPopover from "../spawn/NsPopover.svelte";
  import { accountsStore } from "../stores/accounts.svelte";
  import type { MeterState } from "../usage";
  import UsageRing from "../usage/UsageRing.svelte";
  import AccountPickRows from "./AccountPickRows.svelte";
  import { hueVar, nameOf } from "./model.svelte";
  import {
    type AccountHolder,
    asking,
    moveTo,
    shownAccount,
    signedInHere,
    switchable,
  } from "./switch.svelte";

  /** A project's account, picked here in place of a session's move. */
  interface AccountChoice {
    accounts: Account[];
    /** The fleet's routing: its name on the chip while nothing is named, and the list's first row. */
    auto: { name: string };
    /** The chip's id, which its popover hangs from. */
    id: string;
    /** An account's line in place of its room, where something keeps it from taking a session. */
    note?: (id: string) => string | null;
    /** The pick: an account's id, or null for the fleet's routing. */
    onpick: (accountId: string | null) => void;
    /** The account named; null while the fleet routes it. */
    picked: string | null;
  }

  let {
    instance,
    choice,
    readonly,
    size = "regular",
    onpick,
    none,
    quota,
    short = false,
    tone,
    bare = false,
    fill = false,
  }: (
    | { instance: AccountHolder; choice?: never }
    | { choice: AccountChoice; instance?: never }
  ) & {
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
    /**
     * The account's room for the model the session runs, drawn on the
     * chip: the share of its binding window used, its state, its name
     * ("5-hour") and when it resets. Absent with no reading.
     */
    quota?: {
      detail: string;
      label: string;
      state: MeterState;
      used: number;
    } | null;
    /**
     * The account's short name on the chip (its label, else its address
     * before the @), the whole name in its accessible name: a row of
     * pickers with no room for an address.
     */
    short?: boolean;
    /** The chip's tone: `muted` for an account a setting inherits. */
    tone?: "muted";
    /**
     * The chip draws its mark alone (the account's dot, or the person
     * glyph on no account), its name in its accessible name: a phone's row
     * of pickers, where the tooltip around the chip names it.
     */
    bare?: boolean;
    /** The chip takes its container's width, its chevron at the end: a column of pickers. */
    fill?: boolean;
  } = $props();
  /** The chip's figure: what the account has left, as its rows say it ("38% left"). */
  const quotaWords = $derived(
    quota ? limitPickWords.left(Math.max(0, Math.round(100 - quota.used))) : ""
  );
  const chip = $derived(
    chipVariants({
      variant: "setting",
      size,
      tone,
      class: [
        "min-w-0 max-w-full",
        fill && "flex-1 [&>[data-slot=chevron]]:ms-auto",
      ],
    })
  );

  let open = $state(false);
  const accounts = $derived.by(() => {
    if (choice || instance === undefined) {
      return choice?.accounts ?? [];
    }
    return none && !instance.accountId
      ? signedInHere(instance, none.provider)
      : switchable(instance);
  });
  const shown = $derived.by(() => {
    if (choice || instance === undefined) {
      return choice?.accounts.find((one) => one.id === choice.picked) ?? null;
    }
    const id = shownAccount(instance);
    return (
      accountsStore.accounts?.accounts.find((one) => one.id === id) ?? null
    );
  });
  const name = $derived.by(() => {
    if (shown) {
      return nameOf(shown);
    }
    return choice ? choice.auto.name : (none?.label ?? "");
  });
  /** What the chip says: the name, or its short form. */
  const said = $derived(
    shown && short ? (shown.label ?? name.split("@")[0] ?? name) : name
  );
  const pickable = $derived(
    !(readonly || (instance !== undefined && asking(instance))) &&
      accounts.length > 0
  );

  function pick(id: string | null) {
    open = false;
    if (choice) {
      choice.onpick(id);
      return;
    }
    if (id === null || instance === undefined) {
      return;
    }
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
      class={[
        "size-space-2 flex-none rounded-pill bg-(--c)",
        // An inherited account's dot drops its colour with its muted name.
        tone === "muted" && "grayscale opacity-70",
      ]}
      style:--c={hueVar(shown.hue)}
    ></span>
  {:else if bare}
    <IconUser aria-hidden="true" class="text-ink-subtle" />
  {/if}
  <span
    class={bare ? "sr-only" : undefined}
    data-slot="chip-label"
    data-account-chip>{said}</span
  >
  <!-- The account's room for the model the session runs, with the account
       it belongs to: the ring and its figure one unit, a word space (0.25em,
       Figtree's) apart inside it, and a word space beyond the chip's gap off
       the name, so it reads as the name's figure and not a word of it. -->
  {#if quota}
    <span
      class="mark-line ms-word inline-flex flex-none items-center gap-word text-tx-2 tabular-nums"
      data-box
      data-slot="quota"
    >
      <UsageRing share={100 - quota.used} state={quota.state} />
      <span>{quotaWords}</span>
    </span>
  {/if}
{/snippet}

{#if shown || none || choice}
  {#if pickable}
    <NsPopover
      haspopup="listbox"
      id={choice ? choice.id : `details-account-${instance?.id ?? ""}`}
      label={quota
        ? `Account: ${name}, ${quotaWords} of its ${quota.label} limit. ${quota.detail}`
        : `Account: ${name}`}
      onchange={(value) => {
        open = value;
      }}
      {open}
      prebuild
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
           is leaving. -->
      <AccountPickRows
        {accounts}
        auto={choice
          ? { name: choice.auto.name, onpick: () => pick(null) }
          : undefined}
        note={choice?.note}
        picked={shown?.id ?? null}
        {pick}
      />
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
