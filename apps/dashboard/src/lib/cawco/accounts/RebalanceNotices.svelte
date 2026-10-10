<script lang="ts">
  /**
   * What adding an account, or one coming back from its bench, set moving,
   * nobody has acknowledged yet: one group of Caw's panel, MovedLogins'
   * shape: a head with the first account's tile, "Sessions rebalanced" and
   * how many, its ✕ acknowledging them all; one line saying what it means;
   * then an entry per pass, each with its own ✕: the tile of the first
   * account that came, "design@ and marketing@ added on obelisk", and a
   * line per thing it did (core `rebalanceWords`): the running sessions
   * moved off accounts forecast to run out, and the held sessions
   * re-decided.
   */
  import { type RebalanceNotice, rebalanceWords } from "@cawco/core";
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import NoticeRow from "#lib/cawco/home/NoticeRow.svelte";

  let {
    notices,
    ondismiss,
  }: {
    notices: RebalanceNotice[];
    /** These passes were acknowledged. */
    ondismiss: (ids: string[]) => void;
  } = $props();

  const providerOf = (accountId: string) =>
    cawco.accounts?.accounts.find((one) => one.id === accountId)?.provider;
  const leader = $derived(notices[0]?.came[0]?.account);
  const leaderProvider = $derived(leader ? providerOf(leader.id) : undefined);
</script>

<div class="group">
  <NoticeRow
    dismissLabel="Dismiss all {notices.length} rebalances"
    label="Sessions rebalanced"
    ondismiss={() => ondismiss(notices.map((one) => one.id))}
  >
    {#snippet lead()}
      {#if leader && leaderProvider}
        <AccountTile hue={leader.hue} provider={leaderProvider} size={28} />
      {/if}
    {/snippet}
    <h3 class="head">
      Sessions rebalanced <span class="count">{notices.length}</span>
    </h3>
    <p class="explainer">
      An account came, so sessions moved off accounts about to run out and held
      ones were placed again.
    </p>
  </NoticeRow>
  <ul class="entries">
    {#each notices as notice (notice.id)}
      {@const words = rebalanceWords(notice)}
      {@const first = notice.came[0]?.account}
      {@const provider = first ? providerOf(first.id) : undefined}
      <li data-flip>
        <NoticeRow
          dismissLabel="Dismiss {words.title}"
          label={words.title}
          nested
          ondismiss={() => ondismiss([notice.id])}
        >
          {#snippet lead()}
            {#if first && provider}
              <AccountTile hue={first.hue} {provider} size={28} />
            {/if}
          {/snippet}
          <span class="title">{words.title}</span>
          {#each words.lines as line, n (n)}
            <span class="line">{line}</span>
          {/each}
        </NoticeRow>
      </li>
    {/each}
  </ul>
</div>

<style>
  .head {
    margin: 0;
    padding-inline-end: var(--x-room);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .explainer {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  /* No indent: each pass is a row of the panel (MovedLogins' shape). */
  .entries {
    display: flex;
    flex-direction: column;
    margin: calc(-1 * var(--space-2)) 0 0;
    padding: 0 0 var(--space-2);
    list-style: none;
  }
  /* A step under the head's label: body type in row ink. */
  .title {
    overflow: hidden;
    padding-inline-end: var(--x-room);
    font: var(--type-body);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
</style>
