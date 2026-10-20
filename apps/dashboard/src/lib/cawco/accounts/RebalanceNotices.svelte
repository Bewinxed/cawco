<script lang="ts">
  /**
   * What adding an account, or one coming back from its bench, set moving,
   * nobody has acknowledged yet: one group of Caw's panel, MovedLogins'
   * shape: a head led by the group glyph in muted ink (the entries wear the
   * account tiles), "Sessions rebalanced" and
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
  import { IconAccounts } from "#lib/icons.js";

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
</script>

<div data-slot="group" class="group">
  <NoticeRow
    dismissLabel="Dismiss all {notices.length} rebalances"
    label="Sessions rebalanced"
    ondismiss={() => ondismiss(notices.map((one) => one.id))}
  >
    {#snippet lead()}
      <span data-slot="glyph" class="grid place-items-center text-ink-muted"
        ><IconAccounts aria-hidden="true" class="size-icon-md" /></span
      >
    {/snippet}
    <h3 data-slot="head" class="type-label m-0 pe-(--x-room) text-ink-strong">
      Sessions rebalanced <span
        data-slot="count"
        class="type-meta num text-ink-muted">{notices.length}</span
      >
    </h3>
    <p data-slot="explainer" class="type-meta m-0 text-ink-muted">
      An account came, so sessions moved off accounts about to run out and held
      ones were placed again.
    </p>
  </NoticeRow>
  <ul
    data-slot="entries"
    class="m-0 flex list-none flex-col px-0 pt-0 pb-space-2"
  >
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
          <span
            data-slot="title"
            class="type-body truncate pe-(--x-room) text-ink-row"
            >{words.title}</span
          >
          {#each words.lines as line, n (n)}
            <span class="type-meta wrap-anywhere text-ink-muted">{line}</span>
          {/each}
        </NoticeRow>
      </li>
    {/each}
  </ul>
</div>
