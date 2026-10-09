<script lang="ts">
  /**
   * Logins moved into CawCo from a machine's own Claude Code, pi or OpenCode
   * store, nobody has acknowledged yet: one card in the Home cards' recipe
   * (UpdateCard's), one entry each: the account's tile, then its name, where
   * it came from, and, while a machine that could use it still lacks it, a
   * link to the account to sign it in there, each on its own line so none
   * runs into another; the name gives way first. The ✕ acknowledges every
   * entry shown.
   */
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import { type MovedLogin, nameOf } from "#lib/cawco/accounts/model.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight, IconClose } from "#lib/icons.js";

  let { moved, ondismiss }: { moved: MovedLogin[]; ondismiss: () => void } =
    $props();
</script>

<article aria-label="Logins moved into CawCo" class="card" data-flip="box">
  <ul class="moves">
    {#each moved as one (one.id)}
      <li class="move" data-flip>
        <span class="tile">
          <AccountTile
            hue={one.account.hue}
            provider={one.account.provider}
            size={28}
          />
        </span>
        <span class="name">{nameOf(one.account)}</span>
        <span class="from">{one.from}</span>
        {#if one.missing}
          <a class="there" href="/config/accounts/{one.account.id}"
            >Sign in there<IconChevronRight aria-hidden="true" /></a
          >
        {/if}
      </li>
    {/each}
  </ul>
  <Button
    aria-label="Dismiss moved logins"
    class="close"
    icon={IconClose}
    onclick={ondismiss}
    size="icon-xs"
    variant="ghost"
  />
</article>

<style>
  .card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .moves {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The tile spans the entry's lines; each line has the text column to itself. */
  .move {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: 2px;
    align-items: center;
    min-width: 0;
  }
  .tile {
    display: flex;
    grid-row: 1 / span 3;
    align-self: start;
  }
  .name,
  .from {
    grid-column: 2;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .from {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .there {
    grid-column: 2;
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-block-start: 2px;
    border-radius: var(--radius-xs);
    font: var(--type-label);
    color: var(--link-ink);
    text-decoration: none;
    white-space: nowrap;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .there:hover {
      color: var(--link-hover);
    }
  }
  .there:active {
    opacity: 0.72;
  }
  .there :global(svg) {
    width: 12px;
    height: 12px;
  }
  .card :global(.close) {
    color: var(--ink-muted);
  }
</style>
