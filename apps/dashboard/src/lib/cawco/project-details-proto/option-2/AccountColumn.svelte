<script lang="ts">
  import { hueVar } from "#lib/cawco/accounts/model.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import AccountChip, {
    type AccountTool,
  } from "#lib/cawco/spawn/AccountChip.svelte";
  /**
   * Stage 2's account: the New session form's account chip (AccountChip),
   * its popover listing Any available first and every fleet account by its
   * full name and hue (one signed in nowhere says Signed out on its line),
   * what the pick does under it, the alert when
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
  import { OptionTiles } from "#lib/components/ui/option-group/index.js";
  import { sectionHeadVariants } from "#lib/components/ui/section-header/index.js";
  import { IconError, IconHourglass, IconTransfer } from "#lib/icons.js";
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

  /** The account chip's popover stands open. */
  let open = $state(false);

  const disabled = $derived(!record.hubReachable);
  const chosenAccount = $derived(
    record.account.chosen === null
      ? null
      : (record.accounts.find((acc) => acc.id === record.account.chosen) ??
          null)
  );
  const chosenSignedOut = $derived(chosenAccountSignedOut(record));

  /** The fleet's accounts as the chip offers them: Any available first, then each by its full name and hue. */
  const tool = $derived<AccountTool>({
    auto: { id: null, name: words.account.fleetRouting, why: "" },
    value: record.account.chosen,
    onpick: (next) => {
      if (!disabled && next !== record.account.chosen) {
        onchange({ key: "account", value: next });
      }
    },
    options: record.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      nick: null,
      email: null,
      color: hueVar(account.hue),
      disabled: false,
      line: account.signedIn ? [] : [words.account.signedOut],
      ring: null,
    })),
  });
</script>

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

  <div class="flex min-w-0" inert={disabled}>
    <AccountChip
      id="work-path"
      onchange={(next) => {
        open = next;
      }}
      {open}
      {tool}
    />
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
