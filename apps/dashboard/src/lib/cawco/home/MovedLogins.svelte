<script lang="ts">
  /**
   * Logins moved into CawCo from a machine's own Claude Code, pi or OpenCode
   * store, nobody has acknowledged yet: one row of Caw's panel (NeedsCaw,
   * NoticeRow), one entry each: the account's tile in the row's leading
   * column, then its name, where it came from, and, while a machine that
   * could use it still lacks it, a link to the account to sign it in there,
   * each on its own line so none runs into another; the name gives way
   * first. The ✕ on the first tile acknowledges every entry shown.
   */
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import { type MovedLogin, nameOf } from "#lib/cawco/accounts/model.svelte.js";
  import { IconChevronRight } from "#lib/icons.js";
  import NoticeRow from "./NoticeRow.svelte";

  let { moved, ondismiss }: { moved: MovedLogin[]; ondismiss: () => void } =
    $props();

  const first = $derived(moved[0]);
</script>

<NoticeRow
  dismissLabel="Dismiss moved logins"
  label="Logins moved into CawCo"
  {ondismiss}
>
  {#snippet lead()}
    {#if first}
      <AccountTile
        hue={first.account.hue}
        provider={first.account.provider}
        size={28}
      />
    {/if}
  {/snippet}
  <ul class="moves">
    {#each moved as one, at (one.id)}
      <li class="move" data-flip class:later={at > 0}>
        {#if at > 0}
          <span class="tile">
            <AccountTile
              hue={one.account.hue}
              provider={one.account.provider}
              size={28}
            />
          </span>
        {/if}
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
</NoticeRow>

<style>
  .moves {
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
  .move {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
    min-width: 0;
  }
  .name {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Where it came from wraps rather than losing the machine. */
  .from {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .there {
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
  /* A later entry: its tile in the row's leading column, its lines in the
     text column. */
  .move.later {
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    margin-inline-start: calc(-28px - var(--space-3));
  }
  .later .name,
  .later .from,
  .later .there {
    grid-column: 2;
  }
</style>
