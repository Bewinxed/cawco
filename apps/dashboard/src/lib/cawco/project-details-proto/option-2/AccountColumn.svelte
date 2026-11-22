<script lang="ts">
  import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import AccountSwitch from "#lib/cawco/accounts/AccountSwitch.svelte";
  import { minuteClock } from "#lib/cawco/accounts/minute-clock.svelte.js";
  import { chipQuota } from "#lib/cawco/accounts/room.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { usageStore } from "#lib/cawco/stores/usage.svelte.js";
  import { firstToStop, limitRows } from "#lib/cawco/usage.js";
  /**
   * Account & usage limits: the house's account chip (AccountSwitch, the
   * one a session card's account line is) fed this project's account: Any
   * available first, then each fleet account by its dot, its name and its
   * room, or the limit it is at (one signed in nowhere says Signed out
   * there). Under it, what
   * the pick does, the alert when the named account is signed out
   * everywhere, and, with an account named, what its sessions do at its
   * limit as two of the house's tiles, each led by its glyph. Every pick
   * moves at the press (changes.ts `withAsked`); a refusal puts it back and
   * stands under its control (RowFault).
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconError, IconHourglass, IconTransfer } from "#lib/icons.js";
  import {
    chosenAccountSignedOut,
    type HrefOf,
    pickAccounts,
    type StageSends,
  } from "./changes";
  import PickTiles from "./PickTiles.svelte";
  import { CARD_GROUP, GROUP_LABEL } from "./section-card";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    hrefOf,
  }: StageSends & { hrefOf: HrefOf } = $props();

  const uid = $props.id();

  /** The clock the rooms are read against, a minute at a time. */
  const clock = minuteClock();

  /** The named account's room for the window that stops it first, as a session card's account chip draws it (AccountSwitch `quota`). */
  const quota = $derived.by(() => {
    const account = record.accounts.find(
      (one) => one.id === record.account.chosen
    );
    const claude =
      account?.signedIn && account.provider === CLAUDE_PROVIDER
        ? usageStore.claudeLimits[account.id]
        : undefined;
    const limit = claude
      ? firstToStop(limitRows("Claude", claude, clock.now))
      : null;
    return limit && claude
      ? chipQuota(limit, claude.fetchedAt, clock.now)
      : null;
  });

  const disabled = $derived(!record.hubReachable);
  const chosenAccount = $derived(
    record.account.chosen === null
      ? null
      : (record.accounts.find((acc) => acc.id === record.account.chosen) ??
          null)
  );
  const chosenSignedOut = $derived(chosenAccountSignedOut(record));

  /** The fleet's accounts as the picker lists them, each by the name it carries everywhere. */
  const accounts = $derived(pickAccounts(record));

  function pick(next: string | null) {
    if (!disabled && next !== record.account.chosen) {
      onchange({ key: "account", value: next });
    }
  }
</script>

{#snippet limitGlyph(choice: "wait" | "move")}
  {#if choice === "wait"}
    <IconHourglass aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconTransfer aria-hidden="true" class="size-icon-md text-ink-muted" />
  {/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-space-4">
  <section aria-labelledby="{uid}-account" class={CARD_GROUP}>
    <p class={GROUP_LABEL} id="{uid}-account">{words.account.heading}</p>

    <!-- The house's account chip (AccountSwitch, a session card's), fed
         this project's account. -->
    <div class="flex min-w-0">
      <AccountSwitch
        choice={{
          id: "work-path-account",
          accounts,
          picked: record.account.chosen,
          auto: { name: words.account.fleetRouting },
          note: (id) =>
            record.accounts.find((one) => one.id === id)?.signedIn === false
              ? words.account.signedOut
              : null,
          onpick: pick,
        }}
        {quota}
        readonly={disabled}
      />
    </div>
    <RowFault
      again={() => onretry("account")}
      againLabel={words.retryChange}
      reason={refused.account}
    />

    {#if chosenSignedOut && chosenAccount}
      <Alert layout="row" variant="destructive">
        <IconError aria-hidden="true" />
        <AlertDescription>
          {words.account.signedOutAlert(chosenAccount.name)}
        </AlertDescription>
        <AlertAction>
          <Button
            href={hrefOf("accounts")}
            label={words.account.openAccounts}
            size="sm"
            variant="outline"
          />
        </AlertAction>
      </Alert>
    {/if}
  </section>

  {#if record.account.chosen !== null}
    <section aria-labelledby="{uid}-limit" class={CARD_GROUP}>
      <p class={GROUP_LABEL} id="{uid}-limit">
        {words.account.atLimitHeading}
      </p>
      <PickTiles
        cols={2}
        {disabled}
        glyph={limitGlyph}
        label={words.account.atLimitGroupLabel}
        onpick={(next) => {
          if (next !== record.account.atLimit) {
            onchange({ key: "atLimit", value: next });
          }
        }}
        options={[
          {
            id: "wait",
            name: words.account.atLimitWait.name,
            note: words.account.atLimitWait.note,
          },
          {
            id: "move",
            name: words.account.atLimitMove.name,
            note: words.account.atLimitMove.note,
          },
        ]}
        value={record.account.atLimit}
      />
      <RowFault
        again={() => onretry("atLimit")}
        againLabel={words.retryChange}
        reason={refused.atLimit}
      />
    </section>
  {/if}
</div>
