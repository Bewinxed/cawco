<script lang="ts">
  /**
   * Stage 2 right column ("Account"): Fleet routing plus every fleet account
   * standing open as a wrapping row of option chips (hue dot + name; signed-out
   * accounts wear the fail glyph with "Signed out" in their accessible name and
   * Tip), a crimson blocker alert if the chosen account is signed out
   * everywhere, and At its limit as two chips in one row with a connector meta
   * line below.
   */
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconAlert, IconChevronRight } from "#lib/icons.js";
  import ChoiceChip from "./ChoiceChip.svelte";
  import ControlRefusal from "./ControlRefusal.svelte";
  import {
    chosenAccountSignedOut,
    type HrefOf,
    type StageSends,
  } from "./changes";
  import type { AccountHue, FleetAccount } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
    hrefOf,
  }: StageSends & { hrefOf: HrefOf } = $props();

  const FLEET_VALUE = "__fleet__";

  const ACCOUNT_DOT: Record<AccountHue, string> = {
    amber: "bg-account-amber",
    blue: "bg-account-blue",
    cyan: "bg-account-cyan",
    green: "bg-account-green",
    orange: "bg-account-orange",
    rose: "bg-account-rose",
    violet: "bg-account-violet",
  };

  let pressedAccount = $state<string | null>(null);
  let pressedLimit = $state<"wait" | "move" | null>(null);

  const disabled = $derived(!record.hubReachable);
  const accountPending = $derived(pending.includes("account"));
  const limitPending = $derived(pending.includes("atLimit"));
  const selectedAccountValue = $derived(record.account.chosen ?? FLEET_VALUE);

  const chosenAccount = $derived(
    record.account.chosen === null
      ? null
      : (record.accounts.find((acc) => acc.id === record.account.chosen) ??
          null)
  );
  const chosenSignedOut = $derived(chosenAccountSignedOut(record));

  function pickAccount(value: string) {
    if (disabled) {
      return;
    }
    const next = value === FLEET_VALUE ? null : value;
    if (next === record.account.chosen) {
      return;
    }
    pressedAccount = value;
    onchange({ key: "account", value: next });
  }

  function pickAtLimit(value: "wait" | "move") {
    if (disabled || value === record.account.atLimit) {
      return;
    }
    pressedLimit = value;
    onchange({ key: "atLimit", value });
  }
</script>

{#snippet accountChipContent(account: FleetAccount)}
  <span class="mark-line flex min-w-0 items-center gap-x-space-2">
    <span
      aria-hidden="true"
      class={["size-space-2 flex-none rounded-pill", ACCOUNT_DOT[account.hue]]}
      data-box
    ></span>
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{account.name}</span
    >
    {#if !account.signedIn}
      <IconAlert
        aria-hidden="true"
        class="size-icon-sm flex-none text-status-fail-glyph"
      />
      <span class="sr-only"> — {words.account.signedOut}</span>
    {/if}
    {#if accountPending && pressedAccount === account.id}
      <Spinner
        aria-label={words.saving}
        box="small"
        class="flex-none"
        tone="muted"
      />
    {/if}
  </span>
{/snippet}

<div
  class="flex min-w-0 flex-col rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4"
  data-slot="well"
>
  <div class="mark-line flex items-center justify-between gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.account.heading}</h3>
    {#if accountPending && pressedAccount === null}
      <Spinner aria-label={words.saving} box="small" tone="muted" />
    {/if}
  </div>

  <OptionGroup
    aria-label={words.account.groupLabel}
    class="mt-space-1"
    {disabled}
    layout="chips"
    value={[selectedAccountValue]}
  >
    <OptionGroupItem
      onclick={(event) => {
        event.preventDefault();
        pickAccount(FLEET_VALUE);
      }}
      value={FLEET_VALUE}
    >
      <span class="mark-line flex min-w-0 items-center gap-x-space-2">
        <span
          aria-hidden="true"
          class="size-space-2 flex-none rounded-pill border border-ink-muted"
          data-box
        ></span>
        <span>{words.account.fleetRouting}</span>
        {#if accountPending && pressedAccount === FLEET_VALUE}
          <Spinner
            aria-label={words.saving}
            box="small"
            class="flex-none"
            tone="muted"
          />
        {/if}
      </span>
    </OptionGroupItem>

    {#each record.accounts as account (account.id)}
      {#if !account.signedIn}
        <Tip label={words.account.signedOut}>
          {#snippet children(props)}
            <OptionGroupItem
              {...props}
              onclick={(event) => {
                event.preventDefault();
                if (typeof props.onclick === "function") {
                  props.onclick(event);
                }
                pickAccount(account.id);
              }}
              value={account.id}
            >
              {@render accountChipContent(account)}
            </OptionGroupItem>
          {/snippet}
        </Tip>
      {:else}
        <OptionGroupItem
          onclick={(event) => {
            event.preventDefault();
            pickAccount(account.id);
          }}
          value={account.id}
        >
          {@render accountChipContent(account)}
        </OptionGroupItem>
      {/if}
    {/each}
  </OptionGroup>

  <ControlRefusal
    {disabled}
    onretry={() => onretry("account")}
    reason={refused.account}
  />

  <p class="m-0 mt-space-1 type-meta text-ink-muted">
    {record.account.chosen === null
      ? words.account.scopeFleet
      : words.account.scopeNamed}
  </p>

  {#if chosenSignedOut && chosenAccount}
    <Alert class="mt-space-2" variant="destructive">
      <IconAlert aria-hidden="true" />
      <AlertDescription>
        <span class="flex flex-col items-start gap-space-1">
          <span>{words.account.signedOutAlert(chosenAccount.name)}</span>
          <Button href={hrefOf("accounts")} size="xs" variant="link">
            <span>{words.account.openAccounts}</span>
            <IconChevronRight aria-hidden="true" class="size-icon-sm" />
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  {/if}

  {#if record.account.chosen !== null}
    <div
      class="mt-space-2 flex flex-col gap-space-1 border-t border-border-hairline pt-space-2"
    >
      <div class="mark-line flex items-center justify-between gap-space-2">
        <span class="type-label text-ink-strong"
          >{words.account.atLimitHeading}</span
        >
        {#if limitPending && pressedLimit === null}
          <Spinner aria-label={words.saving} box="small" tone="muted" />
        {/if}
      </div>

      <OptionGroup
        aria-label={words.account.atLimitGroupLabel}
        {disabled}
        layout="chips"
        value={[record.account.atLimit]}
      >
        <ChoiceChip
          label={words.account.atLimitWait.name}
          onpick={() => pickAtLimit("wait")}
          sending={limitPending && pressedLimit === "wait"}
          value="wait"
        />

        <ChoiceChip
          label={words.account.atLimitMove.name}
          onpick={() => pickAtLimit("move")}
          sending={limitPending && pressedLimit === "move"}
          value="move"
        />
      </OptionGroup>

      <p class="m-0 type-meta text-ink-muted">
        {record.account.atLimit === "wait"
          ? words.account.atLimitWait.note
          : words.account.atLimitMove.note}
      </p>

      <ControlRefusal
        {disabled}
        onretry={() => onretry("atLimit")}
        reason={refused.atLimit}
      />
    </div>
  {/if}
</div>
