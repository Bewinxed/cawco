<script lang="ts">
  /**
   * What adding an account, or one coming back from its bench, set moving,
   * nobody has acknowledged yet: one card in the Home cards' recipe
   * (MovedLogins'), one entry per pass: the tile of the first account that
   * came, then "design@ and marketing@ added on obelisk", then a line per
   * thing it did (core `rebalanceWords`): the running sessions moved off
   * accounts forecast to run out, and the held sessions re-decided. The ✕
   * acknowledges every entry shown.
   */
  import { type RebalanceNotice, rebalanceWords } from "@cawco/core";
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose } from "#lib/icons.js";

  let {
    notices,
    ondismiss,
  }: { notices: RebalanceNotice[]; ondismiss: () => void } = $props();

  const providerOf = (accountId: string) =>
    cawco.accounts?.accounts.find((one) => one.id === accountId)?.provider;
</script>

<article aria-label="Sessions rebalanced" class="card" data-flip="box">
  <ul class="entries">
    {#each notices as notice (notice.id)}
      {@const words = rebalanceWords(notice)}
      {@const first = notice.came[0]?.account}
      {@const provider = first ? providerOf(first.id) : undefined}
      <li class="entry" data-flip>
        <span class="tile">
          {#if first && provider}
            <AccountTile hue={first.hue} {provider} size={28} />
          {/if}
        </span>
        <span class="title">{words.title}</span>
        {#each words.lines as line, at (at)}
          <span class="line">{line}</span>
        {/each}
      </li>
    {/each}
  </ul>
  <Button
    aria-label="Dismiss rebalance notices"
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
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The tile spans the entry's lines; each line has the text column to itself. */
  .entry {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: 2px;
    align-items: center;
    min-width: 0;
  }
  .tile {
    display: flex;
    grid-row: 1 / span 4;
    align-self: start;
  }
  .title,
  .line {
    grid-column: 2;
    min-width: 0;
  }
  .title {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .card :global(.close) {
    color: var(--ink-muted);
  }
</style>
