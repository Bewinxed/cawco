<script lang="ts">
  import { hueVar } from "#lib/cawco/accounts/model.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  /**
   * Stage 2's account: the fleet's own routing and every fleet account
   * standing open as one row of option chips (the account's hue and name;
   * one signed in nowhere wears the fail glyph, "Signed out" in its
   * accessible name and tip), what the pick does under them, the alert when
   * the named account is signed out everywhere, and, with an account named,
   * what its sessions do at its limit as two of the house's tiles, each led
   * by its glyph. Every pick moves at the press (changes.ts `withAsked`); a
   * refusal puts it back and stands under its control (RowFault).
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconAlert, IconHourglass, IconTransfer } from "#lib/icons.js";
  import {
    chosenAccountSignedOut,
    type HrefOf,
    type StageSends,
  } from "./changes";
  import type { FleetAccount } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    hrefOf,
  }: StageSends & { hrefOf: HrefOf } = $props();

  const FLEET_VALUE = "__fleet__";

  const disabled = $derived(!record.hubReachable);
  const chosenAccount = $derived(
    record.account.chosen === null
      ? null
      : (record.accounts.find((acc) => acc.id === record.account.chosen) ??
          null)
  );
  const chosenSignedOut = $derived(chosenAccountSignedOut(record));

  function pickAccount(value: string | undefined) {
    if (value === undefined) {
      return;
    }
    const next = value === FLEET_VALUE ? null : value;
    if (next !== record.account.chosen) {
      onchange({ key: "account", value: next });
    }
  }
</script>

{#snippet accountName(account: FleetAccount)}
  <span class="mark-line flex min-w-0 items-center gap-x-space-2">
    <span
      aria-hidden="true"
      class="size-space-2 flex-none rounded-pill bg-(--hue)"
      data-box
      style:--hue={hueVar(account.hue)}
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
  </span>
{/snippet}

{#snippet limitGlyph(choice: "wait" | "move")}
  {#if choice === "wait"}
    <IconHourglass aria-hidden="true" class="size-icon-md text-ink-muted" />
  {:else}
    <IconTransfer aria-hidden="true" class="size-icon-md text-ink-muted" />
  {/if}
{/snippet}

<section
  aria-labelledby="work-path-account"
  class="flex min-w-0 flex-col gap-space-2"
>
  <h3 class={sectionHeadVariants({ inset: "flush" })} id="work-path-account">
    {words.account.heading}
  </h3>

  <OptionGroup
    aria-label={words.account.groupLabel}
    bind:value={
      () => [record.account.chosen ?? FLEET_VALUE],
      (next) => pickAccount(next[0])
    }
    {disabled}
    layout="chips"
  >
    <OptionGroupItem value={FLEET_VALUE}>
      <span class="mark-line flex min-w-0 items-center gap-x-space-2">
        <span
          aria-hidden="true"
          class="size-space-2 flex-none rounded-pill border border-ink-muted"
          data-box
        ></span>
        <span>{words.account.fleetRouting}</span>
      </span>
    </OptionGroupItem>
    {#each record.accounts as account (account.id)}
      {#if account.signedIn}
        <OptionGroupItem value={account.id}>
          {@render accountName(account)}
        </OptionGroupItem>
      {:else}
        <Tip label={words.account.signedOut}>
          {#snippet children(props)}
            <OptionGroupItem {...props} value={account.id}>
              {@render accountName(account)}
            </OptionGroupItem>
          {/snippet}
        </Tip>
      {/if}
    {/each}
  </OptionGroup>
  <RowFault
    again={() => onretry("account")}
    againLabel={words.retryChange}
    reason={refused.account}
  />

  {#if record.account.chosen !== null}
    <p class="m-0 type-meta text-pretty text-ink-muted">
      {words.account.scopeNamed}
    </p>
  {/if}

  {#if chosenSignedOut && chosenAccount}
    <Alert layout="row" variant="destructive">
      <IconAlert aria-hidden="true" />
      <AlertDescription>
        {words.account.signedOutAlert(chosenAccount.name)}
      </AlertDescription>
      <AlertAction>
        <Button
          href={hrefOf("accounts")}
          label={words.account.openAccounts}
          size="xs"
          variant="outline"
        />
      </AlertAction>
    </Alert>
  {/if}

  {#if record.account.chosen !== null}
    <h4 class={[sectionHeadVariants({ inset: "flush" }), "mt-space-3"]}>
      {words.account.atLimitHeading}
    </h4>
    <OptionTiles
      bind:value={
        () => record.account.atLimit,
        (next) => {
          if (next !== null && next !== record.account.atLimit) {
            onchange({ key: "atLimit", value: next });
          }
        }
      }
      cols={2}
      {disabled}
      glyph={limitGlyph}
      label={words.account.atLimitGroupLabel}
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
    />
    <RowFault
      again={() => onretry("atLimit")}
      againLabel={words.retryChange}
      reason={refused.atLimit}
    />
  {/if}
</section>
