<script lang="ts">
  import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import AccountPickRows from "#lib/cawco/accounts/AccountPickRows.svelte";
  import { minuteClock } from "#lib/cawco/accounts/minute-clock.svelte.js";
  import { hueVar } from "#lib/cawco/accounts/model.svelte.js";
  import { limitRowOf, meterOf } from "#lib/cawco/accounts/room.js";
  import { roomOf } from "#lib/cawco/accounts/room-of.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import { usageStore } from "#lib/cawco/stores/usage.svelte.js";
  import UsageRing from "#lib/cawco/usage/UsageRing.svelte";
  /**
   * Account & usage limits: the house's account picker (AccountPickRows,
   * the rows a session's account chip and its menus' Account submenu list),
   * hung from a setting chip as wide as its card, the name at its start and
   * the account's room at its end: Any available first, then
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
  import {
    IconChevronDown,
    IconError,
    IconHourglass,
    IconTransfer,
  } from "#lib/icons.js";
  import {
    chosenAccountSignedOut,
    type HrefOf,
    pickAccounts,
    type StageSends,
  } from "./changes";
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

  /** The named account's room, as its picker row says it: the ring's share and state, and its words. */
  const chosenRoom = $derived.by(() => {
    const account = record.accounts.find(
      (one) => one.id === record.account.chosen
    );
    if (!account?.signedIn || account.provider !== CLAUDE_PROVIDER) {
      return null;
    }
    const room = roomOf(usageStore.claudeLimits[account.id], null, clock.now);
    if (room === null) {
      return null;
    }
    const meter = meterOf(room);
    return meter === null
      ? null
      : {
          ...meter,
          words: limitRowOf(`account:${account.id}`, room, clock.now).detail,
        };
  });

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
  const accounts = $derived(pickAccounts(record));

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

<div class="flex min-w-0 flex-col gap-space-5">
  <section aria-labelledby="{uid}-account" class={CARD_GROUP}>
    <p class={GROUP_LABEL} id="{uid}-account">{words.account.heading}</p>

    <div class="flex min-w-0" inert={disabled}>
      <NsPopover
        align="start"
        fit
        haspopup="listbox"
        id="work-path-account"
        label={chosenRoom
          ? `${words.account.heading}: ${shownName}, ${chosenRoom.words}`
          : `${words.account.heading}: ${shownName}`}
        onchange={(next) => {
          open = next;
        }}
        {open}
        rows="[data-pick-row]"
        triggerClass={chipVariants({
          variant: "setting",
          class: "w-full min-w-0 justify-start",
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
          <!-- The account's room as the session card's account chip draws it
               (AccountSwitch `quota`): the ring and its figure one unit, at
               the field's end apart from the name. -->
          {#if chosenRoom}
            <span
              class="mark-line ms-auto inline-flex flex-none items-center gap-word text-ink-muted tabular-nums"
              data-box
              data-slot="quota"
            >
              <UsageRing share={chosenRoom.share} state={chosenRoom.state} />
              <span>{chosenRoom.words}</span>
            </span>
          {/if}
          <IconChevronDown
            class={chosenRoom ? undefined : "ms-auto"}
            data-slot="chevron"
          />
        {/snippet}
        <AccountPickRows
          {accounts}
          auto={{
            name: words.account.fleetRouting,
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
    <section aria-labelledby="{uid}-limit" class={CARD_GROUP}>
      <p class={GROUP_LABEL} id="{uid}-limit">
        {words.account.atLimitHeading}
      </p>
      <OptionTiles
        bind:value={
          () => record.account.atLimit,
          (next) => {
            if (next !== null && next !== record.account.atLimit) {
              onchange({ key: "atLimit", value: next });
            }
          }
        }
        cols={1}
        {disabled}
        glide="mark"
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
    </section>
  {/if}
</div>
