<script lang="ts">
  /**
   * Configure → Accounts: every Claude account, where each is signed in,
   * and, with two or more, how new sessions choose among them. A hollow
   * machine chip signs the account in there; the popover glides between
   * chips as one surface.
   */
  import type { Account } from "@cawco/core";
  import AccountRow from "#lib/cawco/accounts/AccountRow.svelte";
  import {
    accountsOf,
    nameOf,
    routingLine,
    routingOf,
  } from "#lib/cawco/accounts/model.svelte.js";
  import { cawco, deleteAccount } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { confirm } from "#lib/cawco/confirm.svelte.js";
  import HarnessLogo from "#lib/cawco/HarnessLogo.svelte";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconChevronRight, IconPlus } from "#lib/icons.js";
  import { goto } from "$app/navigation";

  const section = sectionOf("accounts");
  const accounts = $derived(accountsOf());
  const routing = $derived(routingOf());
  /** The second account is set up in steps; any other is signed in and named. */
  const addHref = $derived(
    accounts.length === 1
      ? "/config/accounts/new?setup"
      : "/config/accounts/new"
  );

  async function askRemove(account: Account) {
    await confirm({
      title: `Remove ${nameOf(account)}?`,
      body: "Each machine signed in to it signs it out with Claude Code's own logout and forgets it. New sessions stop being placed on it.",
      confirmLabel: "Remove account",
      destructive: true,
      pendingLabel: "Removing…",
      run: () => deleteAccount(account.id),
    });
  }
</script>

<SectionFrame
  purpose={section.purpose}
  ready={cawco.accounts !== null}
  title={section.label}
>
  {#snippet actions(
    down
  )}
    <Button disabled={down !== null} href={addHref} title={down ?? undefined}>
      <IconPlus />
      Add account
    </Button>
  {/snippet}

  {#if accounts.length === 0}
    <EmptyState
      icon={section.icon}
      line="Claude sessions run only on accounts signed in here. Add one and sign it in on each machine; add a second to share the work between them."
      title="Add your first Claude account"
    >
      {#snippet action()}
        <Button href={addHref} icon={IconPlus} label="Add account" size="sm" />
      {/snippet}
    </EmptyState>
  {:else}
    <section aria-labelledby="provider-claude" class="provider">
      <header class="head">
        <span aria-hidden="true" class="mark"
          ><HarnessLogo harness="claude" /></span
        >
        <h2 class="name" id="provider-claude">Claude</h2>
        {#if accounts.length > 1 && routing}
          <div class="routing">
            <span class="line">{routingLine(accounts, routing)}</span>
            <a class="change" href="/config/accounts/anthropic/routing">
              Change routing
              <IconChevronRight />
            </a>
          </div>
        {/if}
      </header>
      <NsPopoverGroup>
        <ul aria-label="Claude accounts" class="rows" {@attach reflow()}>
          {#each accounts as account (account.id)}
            <AccountRow
              {account}
              onedit={() => goto(`/config/accounts/${account.id}`)}
              onremove={() => askRemove(account)}
            />
          {/each}
        </ul>
      </NsPopoverGroup>
    </section>
  {/if}
</SectionFrame>

<style>
  .provider {
    display: flex;
    flex-direction: column;
    min-width: 0;
    container: accounts / inline-size;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
    min-height: 30px;
    padding: 0 var(--space-2) var(--space-3);
  }
  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-xs);
    background: var(--surface-fill-strong);
  }
  .mark :global(.harness-logo) {
    width: 14px;
    height: 14px;
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .routing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    margin-inline-start: auto;
    min-width: 0;
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .change {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border-radius: var(--radius-xs);
    font: var(--type-label);
    color: var(--link-ink);
    text-decoration: none;
    white-space: nowrap;
  }
  @media (hover: hover) and (pointer: fine) {
    .change:hover {
      color: var(--link-hover);
    }
  }
  .change :global(svg) {
    width: 12px;
    height: 12px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
