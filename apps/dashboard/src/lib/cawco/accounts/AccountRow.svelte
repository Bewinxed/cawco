<script lang="ts">
  /**
   * One account in the list: its tile, its name (the editor's link), its
   * plan, a chip per machine saying where it is signed in, and its ⋯ menu.
   * Under 640px of row the chips take a line of their own under the name.
   */
  import type { Account } from "@cawco/core";
  import RowMenu from "#lib/cawco/config/RowMenu.svelte";
  import { IconPenLine, IconTrash } from "#lib/icons.js";
  import AccountName from "./AccountName.svelte";
  import AccountTile from "./AccountTile.svelte";
  import { nameOf, planOf } from "./model.svelte";
  import SigninChips from "./SigninChips.svelte";

  let {
    account,
    onedit,
    onremove,
  }: {
    account: Account;
    onedit: () => void;
    onremove: () => void;
  } = $props();
</script>

<li class="arow" data-flip="">
  <AccountTile hue={account.hue} />
  <a class="name focus-inset" href="/config/accounts/{account.id}">
    <AccountName {account} />
  </a>
  <span class="plan">{planOf(account)}</span>
  <div class="where"><SigninChips {account} /></div>
  <span class="menu">
    <RowMenu
      actions={[
        { label: "Edit account", icon: IconPenLine, onselect: onedit },
        {
          label: "Remove account",
          icon: IconTrash,
          destructive: true,
          onselect: onremove,
        },
      ]}
      label={nameOf(account)}
    />
  </span>
</li>

<style>
  .arow {
    display: grid;
    grid-template-columns: 32px minmax(170px, 240px) 72px minmax(0, 1fr) auto;
    grid-template-areas: "tile name plan where menu";
    align-items: center;
    gap: var(--space-4);
    min-height: 56px;
    padding: var(--space-3) var(--space-2);
    border-block-start: 1px solid var(--border-hairline);
  }
  .arow > :global(:first-child) {
    grid-area: tile;
  }
  .name {
    grid-area: name;
    display: flex;
    min-width: 0;
    border-radius: var(--radius-xs);
    color: inherit;
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .name:hover :global(b) {
      color: var(--link-ink);
    }
  }
  .plan {
    grid-area: plan;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .where {
    grid-area: where;
    min-width: 0;
  }
  .menu {
    grid-area: menu;
  }
  @container accounts (width < 640px) {
    .arow {
      grid-template-columns: 32px minmax(0, 1fr) auto;
      grid-template-areas:
        "tile name menu"
        "tile plan menu"
        ". where where";
      row-gap: var(--space-1);
      column-gap: var(--space-3);
    }
    .where {
      padding-block-start: var(--space-2);
    }
  }
</style>
