<script lang="ts">
  /**
   * Account: Fleet routes first, then one option chip per account by the
   * name it carries everywhere, all in view (no closed list). An account
   * signed in on no machine says so in its chip, by glyph and word. Only
   * while an account is named, At its limit: wait there and keep its
   * connectors, or move on and lose them, each its name over what it does.
   *
   * The chip in force is the hub's (`account`); a pick is asked through
   * `onaccount`, and the mark moves when the hub says so.
   */
  import type { ProjectAtLimit } from "@cawco/core/accounts";
  import { accountNames } from "@cawco/core/accounts";
  import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import BandGroup from "./BandGroup.svelte";
  import { bandWords } from "./words";

  let {
    accounts,
    account,
    atLimit,
    onaccount,
    onatlimit,
  }: {
    accounts: AccountsView;
    /** The account its sessions start on; null: the fleet's routing. */
    account: string | null;
    atLimit: ProjectAtLimit;
    onaccount: (account: string | null) => void;
    onatlimit: (atLimit: ProjectAtLimit) => void;
  } = $props();

  const words = bandWords.account;
  /** The fleet's routing stands as an option among the accounts. */
  const FLEET = "fleet";
  const names = $derived(accountNames(accounts.accounts));
  const signedIn = (id: string): boolean =>
    accounts.signins.some(
      (one) => one.accountId === id && one.state === "signed-in"
    );
</script>

<BandGroup title={words.title}>
  <OptionGroup
    aria-label={words.title}
    bind:value={
      () => [account ?? FLEET],
      (next) => {
        const [picked] = next;
        if (picked !== undefined) {
          onaccount(picked === FLEET ? null : picked);
        }
      }
    }
  >
    <OptionGroupItem value={FLEET}><span>{words.fleet}</span></OptionGroupItem>
    {#each accounts.accounts as one (one.id)}
      <OptionGroupItem value={one.id}>
        <span>{names.get(one.id)}</span>
        {#if !signedIn(one.id)}
          <span class="mark-line flex items-center gap-space-1">
            <IconWarningTriangle
              aria-hidden="true"
              class="size-icon-sm text-status-attn-glyph"
            />
            <span class="type-meta text-status-attn-ink">{words.signedOut}</span
            >
          </span>
        {/if}
      </OptionGroupItem>
    {/each}
  </OptionGroup>
  {#if account !== null}
    <div class="flex flex-col gap-space-2">
      <span class="type-meta text-ink-muted">{words.atLimit}</span>
      <OptionTiles
        cols={2}
        colsPhone={2}
        label={words.atLimit}
        options={[
          { id: "wait", name: words.wait, note: words.waitNote },
          { id: "move", name: words.move, note: words.moveNote },
        ]}
        bind:value={
          () => atLimit,
          (next) => {
            if (next !== null) {
              onatlimit(next);
            }
          }
        }
      />
    </div>
  {/if}
</BandGroup>
