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
  <!-- An entry under the group's head: body type in row ink, a step under the
       head's label, so the head reads as the heading and the entries as its
       list. The name gives way first (The Truncate Inside Rule). -->
  <span data-slot="name" class="pe-(--x-room) type-body text-ink-row truncate"
    >{one.name}</span
  >
  <!-- Where it was found, and the to-do at the line's trailing edge; the
       to-do wraps under it when both don't fit. -->
  <span
    data-slot="sub"
    class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-space-2"
  >
    <span data-slot="from" class="type-meta text-ink-muted wrap-anywhere"
      >{one.from}</span
    >
    {#if one.missing > 0}
      <!-- Its chevron's ink ends on the panel's trailing edge: the link hangs
           past it by the 12px chevron's side bearing (its stroke ends at 15.75
           of 24). -->
      <a
        data-slot="todo"
        class="mark-line me-(--hang) ms-auto inline-flex items-center gap-space-row rounded-xs type-meta text-link-ink no-underline whitespace-nowrap transition-[opacity] dur-control ease-out hover:text-link-hover active:opacity-72"
        href="/config/accounts/{one.account.id}"
        onclick={onchoose}
        style:--hang="calc(-12px * 8.25 / 24)"
        ><span>Sign in on {plural(one.missing, "machine")}</span>
        <IconChevronRight aria-hidden="true" class="size-icon-sm" /></a
      >
    {:else}
      <span
        data-slot="done"
        class="mark-line ms-auto inline-flex items-center gap-space-1 type-meta text-ink-muted whitespace-nowrap"
        ><IconSuccess aria-hidden="true" class="size-icon-sm" /><span
          >Signed in everywhere</span
        ></span
      >
    {/if}
  </span>
</NoticeRow>
