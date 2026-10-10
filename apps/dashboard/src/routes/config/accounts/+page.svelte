<script lang="ts">
  /**
   * Configure → Accounts: one grouped inset list per provider that has an
   * account, in the picker's order. A group's header is the provider's logo
   * and name, and Routing once it has two accounts to route between; its
   * card holds the accounts in fill-first order, each row one link to the
   * account. Groups and rows arriving or leaving reflow (motion/rows).
   */
  import AccountListRow from "#lib/cawco/accounts/AccountListRow.svelte";
  import { groupsOf } from "#lib/cawco/accounts/model.svelte.js";
  import ProviderMark from "#lib/cawco/accounts/ProviderMark.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { IconChevronRight, IconPlus } from "#lib/icons.js";

  const section = sectionOf("accounts");
  const groups = $derived(groupsOf());
</script>

<SectionFrame ready={cawco.accounts !== null} title={section.label}>
  {#snippet actions(
    down
  )}
    <Button
      disabled={down !== null}
      href="/config/accounts/new"
      title={down ?? undefined}
    >
      <IconPlus />
      Add account
    </Button>
  {/snippet}

  {#if groups.length === 0}
    <EmptyState icon={section.icon} title="Add your first account">
      {#snippet action()}
        <Button
          href="/config/accounts/new"
          icon={IconPlus}
          label="Add account"
          size="sm"
        />
      {/snippet}
    </EmptyState>
  {:else}
    <div class="groups" {@attach reflow()}>
      {#each groups as group (group.provider)}
        <section
          aria-labelledby="provider-{group.provider}"
          class="group"
          data-flip
        >
          <header class="head">
            <ProviderMark provider={group.provider} />
            <h2 class="name" id="provider-{group.provider}">{group.name}</h2>
            {#if group.accounts.length > 1}
              <a
                class="routing"
                data-flip="pop"
                href="/config/accounts/{encodeURIComponent(
                  group.provider
                )}/routing"
              >
                Routing
                <IconChevronRight aria-hidden="true" />
              </a>
            {/if}
          </header>
          <ul
            aria-labelledby="provider-{group.provider}"
            class="rows"
            data-flip="box"
            {@attach highlight({ rows: ".link" })}
          >
            {#each group.accounts as account (account.id)}
              <AccountListRow {account} />
            {/each}
          </ul>
        </section>
      {/each}
    </div>
  {/if}
</SectionFrame>

<style>
  .groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--c-btn-h-xs);
    padding-inline: var(--space-2);
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .routing {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
    border-radius: var(--radius-xs);
    font: var(--type-label);
    color: var(--link-ink);
    text-decoration: none;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .routing:hover {
      color: var(--link-hover);
    }
  }
  .routing:active {
    opacity: 0.72;
  }
  .routing :global(svg) {
    width: 12px;
    height: 12px;
  }
  /* Flat rows on the section's own surface, as the live list draws them:
     the rows' hairlines are the only rule. */
  .rows {
    display: flex;
    flex-direction: column;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
