<script lang="ts">
  /**
   * Account anchor on Caw's seat: shows the project's account (identity hue dot
   * + name), Fleet routing, or crimson Signed out. Opens its glide-popover
   * directly onto open account chips, scope line, signed-out alert and (when an
   * account is named) At account limit chips.
   */
  import { PROJECT_AT_LIMIT, type ProjectAtLimit } from "@cawco/core/accounts";
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconChevronDown,
    IconExternalLinear,
    IconHourglass,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import { hubReading, isPending, refusalFor } from "./format";
  import HubAwayNote from "./HubAwayNote.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import type { SubjectProps } from "./records";
  import { words } from "./words";

  const FLEET_VALUE = "__fleet__";

  let { record, changes, onchange }: SubjectProps = $props();

  let open = $state(false);
  let lastAccountAttempt = $state<string | null | undefined>(undefined);
  let lastLimitAttempt = $state<ProjectAtLimit | null>(null);

  const { asOfTime, reachable, staleMeta } = $derived(hubReading(record));

  const currentAccount = $derived(
    record.project.account
      ? (record.accounts.find((a) => a.id === record.project.account) ?? null)
      : null
  );
  const isSignedOut = $derived(
    Boolean(currentAccount && !currentAccount.signedIn)
  );

  const triggerText = $derived.by(() => {
    if (!currentAccount) {
      return words.account.fleetRouting;
    }
    return isSignedOut
      ? `${currentAccount.name} · ${words.account.signedOut}`
      : currentAccount.name;
  });
  const triggerTone = $derived.by(() => {
    if (isSignedOut) {
      return "fail";
    }
    return currentAccount ? undefined : "muted";
  });

  const accountPending = $derived(isPending(changes, "account"));
  const accountRefusal = $derived(refusalFor(changes, "account"));
  const limitPending = $derived(isPending(changes, "atLimit"));
  const limitRefusal = $derived(refusalFor(changes, "atLimit"));

  function pickAccount(value: string) {
    if (!reachable || accountPending) {
      return;
    }
    const nextAccount = value === FLEET_VALUE ? null : value;
    if (nextAccount === record.project.account) {
      return;
    }
    lastAccountAttempt = nextAccount;
    onchange({ key: "account", account: nextAccount });
  }

  function retryAccount() {
    if (!reachable || accountPending || lastAccountAttempt === undefined) {
      return;
    }
    onchange({ key: "account", account: lastAccountAttempt });
  }

  function pickAtLimit(atLimit: ProjectAtLimit) {
    if (
      !reachable ||
      limitPending ||
      atLimit === record.project.accountAtLimit
    ) {
      return;
    }
    lastLimitAttempt = atLimit;
    onchange({ key: "atLimit", atLimit });
  }

  function retryAtLimit() {
    if (!reachable || limitPending || lastLimitAttempt === null) {
      return;
    }
    onchange({ key: "atLimit", atLimit: lastLimitAttempt });
  }
</script>

<NsPopover
  id="project-account"
  align="center"
  label={words.account.triggerAria(
    isSignedOut && currentAccount
      ? `${currentAccount.name} — ${words.account.signedOut}`
      : triggerText,
    staleMeta
  )}
  onchange={(next) => {
    open = next;
  }}
  {open}
  triggerClass={cn(
    chipVariants({ variant: "setting", tone: triggerTone }),
    "max-w-44 @[960px]/project:max-w-64"
  )}
  triggerData={{ "data-account-chip": true }}
  width="calc(var(--spacing) * 85)"
>
  {#snippet trigger()}
    {#if isSignedOut}
      <IconWarningTriangle aria-hidden="true" class="text-status-fail-glyph" />
    {:else if currentAccount}
      <span
        aria-hidden="true"
        class="size-2.5 shrink-0 rounded-pill bg-(--hue)"
        data-box
        style:--hue={currentAccount.hue}
      ></span>
    {:else}
      <span
        aria-hidden="true"
        class="size-2.5 shrink-0 rounded-pill border border-border-contrast"
        data-box
      ></span>
    {/if}
    <span data-slot="chip-label">
      <MorphText text={triggerText} />
    </span>
    <IconChevronDown aria-hidden="true" data-slot="chevron" />
  {/snippet}

  <div class="grid gap-space-3 p-space-1">
    <HubAwayNote asOf={asOfTime} />

    <OptionGroup
      aria-label={words.account.groupLabel}
      disabled={!reachable || accountPending}
      layout="chips"
      bind:value={
        () => [record.project.account ?? FLEET_VALUE],
        (next) => {
          const [picked] = next;
          if (picked) {
            pickAccount(picked);
          }
        }
      }
    >
      <OptionGroupItem value={FLEET_VALUE}>
        <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
          <span
            aria-hidden="true"
            class="size-2 shrink-0 rounded-pill border border-border-contrast"
            data-box
          ></span>
          <span>{words.account.fleetRouting}</span>
          {#if accountPending && lastAccountAttempt === null}
            <Spinner box="small" tone="muted" />
          {/if}
        </span>
      </OptionGroupItem>

      {#each record.accounts as account (account.id)}
        {@const spinning = accountPending && lastAccountAttempt === account.id}
        <OptionGroupItem value={account.id}>
          <span class="inline-flex min-w-0 items-center gap-space-2 mark-line">
            <span
              aria-hidden="true"
              class="size-2 shrink-0 rounded-pill bg-(--hue)"
              data-box
              style:--hue={account.hue}
            ></span>
            <span class="wrap-anywhere">{account.name}</span>
            {#if !account.signedIn}
              <span
                class="mark-line inline-flex items-center gap-space-1 text-status-fail-ink type-meta"
                data-box
              >
                <IconWarningTriangle
                  aria-hidden="true"
                  class="size-icon-sm text-status-fail-glyph"
                />
                <span>{words.account.signedOut}</span>
              </span>
            {/if}
            {#if spinning}
              <Spinner box="small" tone="muted" />
            {/if}
          </span>
        </OptionGroupItem>
      {/each}
    </OptionGroup>

    {#if accountRefusal}
      <RefusalNote
        disabled={!reachable || accountPending}
        onretry={retryAccount}
        said={accountRefusal}
      />
    {/if}

    <p class="m-0 type-meta text-ink-muted text-pretty">
      {words.account.scopeLine}
    </p>

    {#if isSignedOut}
      <Alert variant="destructive">
        <IconWarningTriangle aria-hidden="true" />
        <AlertDescription>
          {words.account.signedOutAlert}
          <a
            class="mark-line ms-space-1 inline-flex items-center gap-space-1 font-medium underline underline-offset-3"
            href="#configure-accounts"
          >
            <span>{words.account.configureAccounts}</span>
            <IconExternalLinear aria-hidden="true" class="size-icon-sm" />
          </a>
        </AlertDescription>
      </Alert>
    {/if}

    {#if record.project.account !== null}
      <div class="grid gap-space-2 border-t border-border-hairline pt-space-3">
        <SectionHeader
          hue="var(--color-ink-muted)"
          icon={IconHourglass}
          label={words.account.atLimitHeading}
        />

        <OptionGroup
          aria-label={words.account.atLimitHeading}
          disabled={!reachable || limitPending}
          layout="tiles"
          style="--tiles-cols: 1fr; --tiles-cols-phone: 1fr"
          bind:value={
            () => [record.project.accountAtLimit],
            (next) => {
              const picked = PROJECT_AT_LIMIT.find((mode) => mode === next[0]);
              if (picked) {
                pickAtLimit(picked);
              }
            }
          }
        >
          {#each PROJECT_AT_LIMIT as mode (mode)}
            {@const copy = words.account.atLimitOptions[mode]}
            {@const spinning = limitPending && lastLimitAttempt === mode}
            <OptionGroupItem value={mode}>
              <span class="mark-line flex w-full items-center gap-space-2">
                <span class="type-label font-medium text-ink-strong">
                  {copy.name}
                </span>
                {#if spinning}
                  <Spinner box="small" class="ms-auto shrink-0" tone="muted" />
                {/if}
              </span>
              <span class="mt-space-1 type-meta text-ink-muted"
                >{copy.note}</span
              >
            </OptionGroupItem>
          {/each}
        </OptionGroup>

        {#if limitRefusal}
          <RefusalNote
            disabled={!reachable || limitPending}
            onretry={retryAtLimit}
            said={limitRefusal}
          />
        {/if}
      </div>
    {/if}
  </div>
</NsPopover>
