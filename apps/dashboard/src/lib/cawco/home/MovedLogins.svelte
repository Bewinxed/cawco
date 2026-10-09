<script lang="ts">
  /**
   * Logins moved into CawCo from a machine's own Claude Code, pi or OpenCode
   * store, nobody has acknowledged yet: one card in the Home cards' recipe
   * (UpdateCard's), one line each: the account's tile and name, where it
   * came from, and, while a machine that could use it still lacks it, a link
   * to the account to sign it in there. The ✕ acknowledges every line shown.
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
        <AccountTile
          hue={one.account.hue}
          provider={one.account.provider}
          size={28}
        />
        <span class="text">
          <span class="name">{nameOf(one.account)}</span>
          <span class="from">{one.from}</span>
        </span>
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
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-3) var(--space-3) var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .moves {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .move {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }
  .text {
    display: flex;
    flex: 1 1 auto;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
    min-width: 0;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .from {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .there {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 2px;
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
    flex: none;
    color: var(--ink-muted);
  }
</style>
