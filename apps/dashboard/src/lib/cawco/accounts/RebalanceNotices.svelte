<script lang="ts">
  /**
   * What adding an account, or one coming back from its bench, set moving,
   * nobody has acknowledged yet: one row of Caw's panel (NeedsCaw,
   * NoticeRow; MovedLogins' recipe), one entry per pass: the tile of the
   * first account that came, then "design@ and marketing@ added on
   * obelisk", then a line per thing it did (core `rebalanceWords`): the
   * running sessions moved off accounts forecast to run out, and the held
   * sessions re-decided. The ✕ on the first tile acknowledges every entry
   * shown.
   */
  import { type RebalanceNotice, rebalanceWords } from "@cawco/core";
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import NoticeRow from "#lib/cawco/home/NoticeRow.svelte";

  let {
    notices,
    ondismiss,
  }: { notices: RebalanceNotice[]; ondismiss: () => void } = $props();

  const providerOf = (accountId: string) =>
    cawco.accounts?.accounts.find((one) => one.id === accountId)?.provider;
  const leader = $derived(notices[0]?.came[0]?.account);
  const leaderProvider = $derived(leader ? providerOf(leader.id) : undefined);
</script>

<NoticeRow
  dismissLabel="Dismiss rebalance notices"
  label="Sessions rebalanced"
  {ondismiss}
>
  {#snippet lead()}
    {#if leader && leaderProvider}
      <AccountTile hue={leader.hue} provider={leaderProvider} size={28} />
    {/if}
  {/snippet}
  <ul class="entries">
    {#each notices as notice, at (notice.id)}
      {@const words = rebalanceWords(notice)}
      {@const first = notice.came[0]?.account}
      {@const provider = first ? providerOf(first.id) : undefined}
      <li class="entry" data-flip class:later={at > 0}>
        {#if at > 0}
          <span class="tile">
            {#if first && provider}
              <AccountTile hue={first.hue} {provider} size={28} />
            {/if}
          </span>
        {/if}
        <span class="title">{words.title}</span>
        {#each words.lines as line, n (n)}
          <span class="line">{line}</span>
        {/each}
      </li>
    {/each}
  </ul>
</NoticeRow>

<style>
  .entries {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The first entry's tile is the row's lead; each later entry's tile stands
     in that same leading column, its lines in the text column. */
  .entry {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
  /* A later entry: its tile in the row's leading column, its lines in the
     text column. */
  .entry.later {
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    margin-inline-start: calc(-28px - var(--space-3));
  }
  .later .title,
  .later .line {
    grid-column: 2;
  }
</style>
