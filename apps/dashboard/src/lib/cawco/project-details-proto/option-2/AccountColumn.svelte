<script lang="ts">
  import type { Account } from "@cawco/core/accounts";
  import AccountPickRows from "#lib/cawco/accounts/AccountPickRows.svelte";
  import { hueVar } from "#lib/cawco/accounts/model.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  /**
   * Stage 2's account: the house's account picker (AccountPickRows, the
   * rows a session's account chip and its menus' Account submenu list),
   * hung from a setting chip sized to its name: Any available first, then
   * each fleet account by its dot, its name and its room, or the limit it
   * is at (one signed in nowhere says Signed out there). Under it, what
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
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { OptionTiles } from "#lib/components/ui/option-group/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import {
    IconChevronDown,
    IconError,
    IconHourglass,
    IconTransfer,
  } from "#lib/icons.js";
  import {
    chosenAccountSignedOut,
    type HrefOf,
    type StageSends,
  } from "./changes";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    hrefOf,
  }: StageSends & { hrefOf: HrefOf } = $props();

  const uid = $props.id();

  /** The picker's popover stands open. */
  let open = $state(false);

  const disabled = $derived(!record.hubReachable);
  const chosenAccount = $derived(
    record.account.chosen === null
      ? null
      : (record.accounts.find((acc) => acc.id === record.account.chosen) ??
          null)
  );
  const chosenSignedOut = $derived(chosenAccountSignedOut(record));
  const shownName = $derived(chosenAccount?.name ?? words.account.fleetRouting);

  /** The fleet's accounts as the picker lists them, each by the name it carries everywhere. */
  const accounts = $derived<Account[]>(
    record.accounts.map((account, order) => ({
      atPlanLimit: "move",
      createdAt: 0,
      email: null,
      hue: account.hue,
      id: account.id,
      identity: null,
      kind: "subscription",
      label: account.name,
      neverBackup: false,
      order,
      provider: account.provider,
      reservePct: null,
      sessionReservePct: null,
    }))
  );

  function pick(next: string | null) {
    open = false;
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

<div class="flex min-w-0 flex-col gap-space-6">
  <section
    aria-labelledby="{uid}-account"
    class="flex min-w-0 flex-col gap-space-2"
  >
    <h3 class={sectionHeadVariants({ inset: "flush" })} id="{uid}-account">
      {words.account.heading}
    </h3>

    <div class="flex min-w-0" inert={disabled}>
      <NsPopover
        align="start"
        fit
        haspopup="listbox"
        id="work-path-account"
        label={`${words.account.heading}: ${shownName}`}
        onchange={(next) => {
          open = next;
        }}
        {open}
        rows="[data-pick-row]"
        triggerClass={chipVariants({
          variant: "setting",
          class: "min-w-0 max-w-full",
        })}
        triggerData={{ "data-tool": true, "data-account-chip": true }}
        width="calc(var(--spacing) * 64)"
      >
        {#snippet trigger()}
          {#if chosenAccount}
            <span
              aria-hidden="true"
              class="size-space-2 flex-none rounded-pill bg-(--c)"
              data-slot="dot"
              style:--c={hueVar(chosenAccount.hue)}
            ></span>
          {/if}
          <span data-account-chip data-slot="chip-label">{shownName}</span>
          <IconChevronDown data-slot="chevron" />
        {/snippet}
        <AccountPickRows
          {accounts}
          auto={{
            name: words.account.fleetRouting,
            detail: "",
            onpick: () => pick(null),
          }}
          note={(id) =>
            record.accounts.find((one) => one.id === id)?.signedIn === false
              ? words.account.signedOut
              : null}
          pick={(id) => pick(id)}
          picked={record.account.chosen}
        />
      </NsPopover>
    </div>
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
        <IconError aria-hidden="true" />
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
  </section>

  {#if record.account.chosen !== null}
    <section
      aria-labelledby="{uid}-limit"
      class="flex min-w-0 flex-col gap-space-2"
    >
      <h3 class={sectionHeadVariants({ inset: "flush" })} id="{uid}-limit">
        {words.account.atLimitHeading}
      </h3>
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
        glide
        glyph={limitGlyph}
        label={words.account.atLimitGroupLabel}
        wraps
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
    </section>
  {/if}
</div>
