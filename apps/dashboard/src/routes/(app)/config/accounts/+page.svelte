<script lang="ts">
  /**
   * Configure → Accounts: one grouped inset list per provider that has an
   * account, in the picker's order. A group's header is the provider's logo
   * and name, and Routing once it has two accounts to route between; its
   * card holds the accounts in fill-first order, each row one link to the
   * account. Groups and rows arriving or leaving reflow (motion/rows).
   */
  import { hasRouting, accountsWords as words } from "@cawco/core";
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

<SectionFrame
  purpose={section.purpose}
  ready={cawco.accounts !== null}
  title={section.label}
>
  {#snippet actions(down)}
    <Button
      disabled={down !== null}
      href="/config/accounts/new"
      title={down ?? undefined}
    >
      <IconPlus />
      <span>{words.add}</span>
    </Button>
  {/snippet}

  {#if groups.length === 0}
    <EmptyState icon={section.icon} title={words.addFirst}>
      {#snippet action()}
        <Button
          href="/config/accounts/new"
          icon={IconPlus}
          label={words.add}
          size="sm"
        />
      {/snippet}
    </EmptyState>
  {:else}
    <div class="flex min-w-0 flex-col gap-space-6" {@attach reflow()}>
      {#each groups as group (group.provider)}
        <section
          data-slot="group"
          aria-labelledby="provider-{group.provider}"
          class="flex min-w-0 flex-col gap-space-2"
          data-flip
        >
          <header
            data-slot="head"
            class="mark-line flex min-h-c-btn-h-xs items-center gap-space-2 px-space-2"
          >
            <ProviderMark provider={group.provider} />
            <h2
              data-slot="name"
              class="type-label min-w-0 flex-auto text-ink-muted"
              id="provider-{group.provider}"
            >
              {group.name}
            </h2>
            {#if hasRouting(group.accounts.length)}
              <a
                class="mark-line type-label inline-flex flex-none items-center gap-space-row rounded-xs text-link-ink no-underline transition-[opacity] dur-control ease-out hover:text-link-hover active:opacity-72"
                data-box
                data-flip="pop"
                href="/config/accounts/{encodeURIComponent(
                  group.provider
                )}/routing"
              >
                <span>{words.routing}</span>
                <IconChevronRight class="size-icon-sm" aria-hidden="true" />
              </a>
            {/if}
          </header>
          <!-- Flat rows on the section's own surface, as the live list draws
               them: the rows' hairlines are the only rule. -->
          <ul
            aria-labelledby="provider-{group.provider}"
            class="m-0 flex min-w-0 list-none flex-col p-0"
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
