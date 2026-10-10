<script lang="ts">
  /**
   * One login moved into CawCo from a machine's own Claude Code, pi or
   * OpenCode store, as an entry of its group in Caw's panel (MovedLogins,
   * NoticeRow): the account's tile, its name (a key leads with its
   * provider, model `namedForNotice`), then where it was found with what is
   * left to do at the line's trailing edge, wrapping under it when both
   * don't fit: a link to the account while online machines that could use
   * it lack it (its page names them), else that it is signed in everywhere.
   * Its ✕ acknowledges it alone.
   */
  import AccountTile from "#lib/cawco/accounts/AccountTile.svelte";
  import type { MovedLogin } from "#lib/cawco/accounts/model.svelte.js";
  import { IconChevronRight, IconSuccess } from "#lib/icons.js";
  import { plural } from "../updates/model";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    one,
    ondismiss,
    onchoose,
  }: {
    one: MovedLogin;
    ondismiss: () => void;
    /** The to-do was chosen: it opens, and the panel closes. */
    onchoose: () => void;
  } = $props();
</script>

<NoticeRow
  dismissLabel="Dismiss {one.name}"
  label={one.name}
  nested
  {ondismiss}
>
  {#snippet lead()}
    <AccountTile
      hue={one.account.hue}
      provider={one.account.provider}
      size={28}
    />
  {/snippet}
  <span class="name">{one.name}</span>
  <span class="sub">
    <span class="from">{one.from}</span>
    {#if one.missing > 0}
      <a
        class="todo"
        href="/config/accounts/{one.account.id}"
        onclick={onchoose}
        ><span>Sign in on {plural(one.missing, "machine")}</span>
        <IconChevronRight aria-hidden="true" /></a
      >
    {:else}
      <span class="done"
        ><IconSuccess aria-hidden="true" />Signed in everywhere</span
      >
    {/if}
  </span>
</NoticeRow>

<style>
  /* An entry under the group's head: body type in row ink, a step under the
     head's label, so the head reads as the heading and the entries as its
     list. The name gives way first (The Truncate Inside Rule). */
  .name {
    overflow: hidden;
    padding-inline-end: var(--x-room);
    font: var(--type-body);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Where it was found, and the to-do at the line's trailing edge; the
     to-do wraps under it when both don't fit. */
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    column-gap: var(--space-2);
    min-inline-size: 0;
  }
  .from {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .todo {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-inline-start: auto;
    border-radius: var(--radius-xs);
    font: var(--type-meta);
    color: var(--link-ink);
    text-decoration: none;
    white-space: nowrap;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .todo:hover {
      color: var(--link-hover);
    }
  }
  .todo:active {
    opacity: 0.72;
  }
  .todo :global(svg) {
    width: 12px;
    height: 12px;
  }
  .done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .done :global(svg) {
    width: 12px;
    height: 12px;
  }
</style>
