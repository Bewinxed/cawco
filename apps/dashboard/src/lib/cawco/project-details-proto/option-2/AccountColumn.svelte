<script lang="ts">
  /**
   * Stage 2 right column ("Account"): Fleet routing plus every fleet account
   * standing open in a list OptionGroup with its identity hue dot and
   * signed-out mark, a crimson blocker alert if the chosen account is signed
   * out everywhere, and the At its limit two-choice group when an account is
   * named.
   */
  import {
    Alert,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconAlert, IconChevronRight } from "#lib/icons.js";
  import type { Change, ChangeKey } from "./changes";
  import ControlRefusal from "./ControlRefusal.svelte";
  import type { AccountHue, HowItRunsRecord } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    pending,
    refused,
    onchange,
    onretry,
    hrefOf,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
  } = $props();

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
  const chosenSignedOut = $derived(
    chosenAccount !== null && !chosenAccount.signedIn
  );

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

<div
  class="flex min-w-0 flex-col rounded-well border border-border-well bg-surface-well px-space-3 py-space-2 @setup:px-space-4 @setup:py-space-3"
  data-slot="well"
>
  <div class="flex items-center justify-between gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">{words.account.heading}</h3>
    {#if accountPending && pressedAccount === null}
      <Spinner aria-label={words.saving} box="small" tone="muted" />
    {/if}
  </div>

  <OptionGroup
    aria-label={words.account.groupLabel}
    class="mt-space-2 gap-space-row coarse:gap-y-space-4"
    {disabled}
    layout="list"
    value={[selectedAccountValue]}
  >
    <OptionGroupItem
      class="items-center px-space-2 py-space-1"
      onclick={(event) => {
        event.preventDefault();
        pickAccount(FLEET_VALUE);
      }}
      value={FLEET_VALUE}
    >
      <span
        aria-hidden="true"
        class="size-space-2 flex-none self-center rounded-pill border border-ink-muted"
        data-box
      ></span>
      <span class="flex min-w-0 items-center justify-between gap-space-2">
        <span class="min-w-0 truncate type-label text-ink-strong"
          >{words.account.fleetRouting}</span
        >
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
      <OptionGroupItem
        class="items-center px-space-2 py-space-1"
        onclick={(event) => {
          event.preventDefault();
          pickAccount(account.id);
        }}
        value={account.id}
      >
        <span
          aria-hidden="true"
          class={[
            "size-space-2 flex-none self-center rounded-pill",
            ACCOUNT_DOT[account.hue],
          ]}
          data-box
        ></span>
        <span class="flex min-w-0 items-center justify-between gap-space-2">
          <span class="min-w-0 truncate type-label text-ink-strong"
            >{account.name}</span
          >
          <span class="flex flex-none items-center gap-space-1">
            {#if !account.signedIn}
              <span
                class="mark-line inline-flex items-center gap-space-1 type-meta text-status-fail-ink"
              >
                <IconAlert
                  aria-hidden="true"
                  class="size-icon-sm flex-none text-status-fail-glyph"
                />
                <span>{words.account.signedOut}</span>
              </span>
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
        </span>
      </OptionGroupItem>
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
      <AlertDescription class="flex flex-col items-start gap-space-1 type-meta">
        <span>{words.account.signedOutAlert(chosenAccount.name)}</span>
        <Button
          class="h-auto px-0 type-meta text-status-fail-ink underline-offset-3"
          href={hrefOf("accounts")}
          size="xs"
          variant="link"
        >
          <span>{words.account.openAccounts}</span>
          <IconChevronRight aria-hidden="true" class="size-icon-sm" />
        </Button>
      </AlertDescription>
    </Alert>
  {/if}

  {#if record.account.chosen !== null}
    <div
      class="mt-space-2 flex flex-col gap-space-1 border-t border-border-hairline pt-space-2"
    >
      <div class="flex items-center justify-between gap-space-2">
        <span class="type-label text-ink-strong"
          >{words.account.atLimitHeading}</span
        >
        {#if limitPending && pressedLimit === null}
          <Spinner aria-label={words.saving} box="small" tone="muted" />
        {/if}
      </div>

      <OptionGroup
        aria-label={words.account.atLimitGroupLabel}
        class="grid-cols-1 gap-space-1 max-phone:grid-cols-1 @table-766px:grid-cols-2 coarse:gap-y-space-4"
        {disabled}
        layout="tiles"
        value={[record.account.atLimit]}
      >
        <OptionGroupItem
          class="px-space-2 py-space-1"
          onclick={(event) => {
            event.preventDefault();
            pickAtLimit("wait");
          }}
          value="wait"
        >
          <span class="flex w-full min-w-0 items-center justify-between gap-space-1">
            <span class="type-label text-ink-strong wrap-anywhere"
              >{words.account.atLimitWait.name}</span
            >
            {#if limitPending && pressedLimit === "wait"}
              <Spinner
                aria-label={words.saving}
                box="small"
                class="flex-none"
                tone="muted"
              />
            {/if}
          </span>
          <span class="type-meta text-ink-muted"
            >{words.account.atLimitWait.note}</span
          >
        </OptionGroupItem>

        <OptionGroupItem
          class="px-space-2 py-space-1"
          onclick={(event) => {
            event.preventDefault();
            pickAtLimit("move");
          }}
          value="move"
        >
          <span class="flex w-full min-w-0 items-center justify-between gap-space-1">
            <span class="type-label text-ink-strong wrap-anywhere"
              >{words.account.atLimitMove.name}</span
            >
            {#if limitPending && pressedLimit === "move"}
              <Spinner
                aria-label={words.saving}
                box="small"
                class="flex-none"
                tone="muted"
              />
            {/if}
          </span>
          <span class="type-meta text-ink-muted"
            >{words.account.atLimitMove.note}</span
          >
        </OptionGroupItem>
      </OptionGroup>

      <ControlRefusal
        {disabled}
        onretry={() => onretry("atLimit")}
        reason={refused.atLimit}
      />
    </div>
  {/if}
</div>
