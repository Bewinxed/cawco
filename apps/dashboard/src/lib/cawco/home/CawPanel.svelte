<script lang="ts">
  /**
   * What Caw's popover holds (NeedsCaw): one list in two sections. Needs you
   * first, longest wait first (home `needs`), each a NeedsCard row; then
   * Notices, the update notice, the logins moved in and what an account's
   * arrival set moving, each with its ✕, and `Clear all` at the head's
   * trailing edge acknowledging every one. A notice never outranks an ask.
   * A section with nothing in it is not drawn; with neither, the empty
   * block says what he knows (The Claim Of Nothing Rule).
   *
   * Every row stands on one grid: its mark in one lead column, its words in
   * one text column, and its last control (a wait, Approve, Clear all, a ✕,
   * Reload, a sign-in link) at one trailing edge. The two sections part
   * with a vermillion hairline, each head led by its glyph.
   *
   * The panel is the notices' one surface: there is no update toast and no
   * Home card. Rows arrive and leave on the Nothing Jumps Rule (`reflow`),
   * and the popover tweens to its new height (`morph`). What it lists and
   * where its acts land is its `feed` (caw-feed): NeedsCaw's live fleet, or
   * the dev bench's fixture (/motion/caw-notices).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou, IconNotices } from "#lib/icons.js";
  import RebalanceNotices from "../accounts/RebalanceNotices.svelte";
  import { reflow } from "../motion/rows.svelte";
  import type { Notice } from "../updates/model";
  import CawFace from "./CawFace.svelte";
  import type { CawFeed } from "./caw-feed.svelte";
  import MovedLogins from "./MovedLogins.svelte";
  import NeedsCard from "./NeedsCard.svelte";
  import UpdateCard, { forgetFold } from "./UpdateCard.svelte";

  let {
    feed,
    quiet,
    onchoose,
  }: {
    feed: CawFeed;
    /** What he says with nothing to count (NeedsCaw `quiet`). */
    quiet: string;
    /** A row was chosen: the panel closes as it opens. */
    onchoose: () => void;
  } = $props();

  const stale = $derived(!feed.live);
  const needs = $derived(feed.needs);
  const updated = $derived(feed.updated);
  const moved = $derived(feed.moved);
  const rebalanced = $derived(feed.rebalanced);

  /**
   * Reload was chosen: the row says its goodbye until the tab goes, also
   * once acknowledging has dropped the notice from `updated`.
   */
  let reloading = $state(false);
  const updateShown = $derived(updated !== null || reloading);
  /** The notices standing: the update, and each moved login and rebalance. */
  const noticeCount = $derived(
    (updateShown ? 1 : 0) + moved.length + rebalanced.length
  );
  /** Every notice but a goodbye has an id to acknowledge. */
  const clearable = $derived(
    updated !== null || moved.length > 0 || rebalanced.length > 0
  );
  /** The update is all the panel holds: there is room for its notes. */
  const alone = $derived(
    needs.length === 0 && moved.length === 0 && rebalanced.length === 0
  );

  function dismissUpdate(notice: Notice): void {
    forgetFold(notice);
    feed.dismissUpdate(notice);
  }

  function act(notice: Notice, action: NonNullable<Notice["action"]>): void {
    if (action === "reload") {
      if (reloading) {
        return;
      }
      reloading = true;
    }
    feed.actOnUpdate(notice, action);
  }

  /** Clear all: every notice acknowledged at once; the section leaves with its rows. */
  function clearAll(): void {
    if (updated) {
      dismissUpdate(updated);
    }
    const ids = [
      ...moved.map((one) => one.id),
      ...rebalanced.map((one) => one.id),
    ];
    if (ids.length > 0) {
      feed.acknowledge(ids);
    }
  }
</script>

<!-- More than the panel holds: the house edge fade at the foot while more
     is below, and at the head once scrolled. -->
<div class="list kit-edge-fade-block" data-safe-bottom {@attach reflow()}>
  {#if needs.length > 0}
    <section aria-labelledby="caw-needs" class="section" data-flip="box">
      <div class="head">
        <span class="glyph needs"><IconNeedsYou aria-hidden="true" /></span>
        <span class="title" id="caw-needs">Needs you</span>
        <span class="count">{needs.length}</span>
      </div>
      <ul class="rows">
        {#each needs as item (item.key)}
          <li data-flip><NeedsCard {item} {onchoose} {stale} /></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if noticeCount > 0}
    <section aria-labelledby="caw-notices" class="section" data-flip="box">
      <div class="head">
        <span class="glyph"><IconNotices aria-hidden="true" /></span>
        <span class="title" id="caw-notices">Notices</span>
        <span class="count">{noticeCount}</span>
        {#if clearable}
          <Button
            aria-label="Clear all {noticeCount} notices"
            class="clear text-[var(--ink-muted)] hover:text-[var(--ink-strong)]"
            onclick={clearAll}
            size="xs"
            variant="ghost"
            >Clear all</Button
          >
        {/if}
      </div>
      <ul class="rows notices">
        {#if updateShown}
          <li data-flip>
            <UpdateCard
              {alone}
              notice={updated}
              onaction={(action) => {
                if (updated) {
                  act(updated, action);
                }
              }}
              ondismiss={() => {
                if (updated) {
                  dismissUpdate(updated);
                }
              }}
            />
          </li>
        {/if}
        {#if moved.length > 0}
          <li data-flip>
            <MovedLogins
              {moved}
              {onchoose}
              ondismiss={(ids) => feed.acknowledge(ids)}
            />
          </li>
        {/if}
        {#if rebalanced.length > 0}
          <li data-flip>
            <RebalanceNotices
              notices={rebalanced}
              ondismiss={(ids) => feed.acknowledge(ids)}
            />
          </li>
        {/if}
      </ul>
    </section>
  {/if}

  {#if needs.length === 0 && noticeCount === 0}
    <div class="empty" data-flip role="status" tabindex="-1">
      {#if feed.connected}
        <CawFace size={48} status="ready" />
      {/if}
      <span>{quiet}</span>
    </div>
  {/if}
</div>

<style>
  /* The panel hangs from his glass (`kit-hang`): its edge is the recipe's
     `::after`, drawn inside its box over the kit's 6px pad, so the pad
     takes the border's pixel back and the rows stand where they did. Its
     top shows its own surface across the cut, so its shadow has no night
     ring (`shadow-overlay-hung`): the ring is the edge's own pixel, hidden
     under the drawn edge, and across the cut (and down a phone's screen
     edge, where no edge is drawn) it was a seam. */
  :global(.kit-pop.caw-pop) {
    width: min(380px, calc(100vw - 24px));
    padding: 7px;
    box-shadow: var(--shadow-overlay-hung);
  }
  /* On a phone his glass is a tab tucked into the screen's trailing edge,
     and the panel hanging from it is too: its trailing side is the screen's
     edge, square and with no edge drawn there, as his glass's, and it keeps
     the phone's 12px margin on its leading side. */
  @media (max-width: 899px) {
    :global(.kit-pop.caw-pop) {
      width: min(380px, calc(100vw - 12px - env(safe-area-inset-right, 0px)));
      border-end-end-radius: 0;
    }
    :global(.kit-pop.caw-pop)::after {
      border-inline-end-width: 0;
    }
  }
  /* The kit's edge fade at its full length on every width: a phone's short
     fade (the recipe's, for a narrow track's edge) lands in the gap between
     a row's words and its buttons and shows nothing; the panel's foot must
     read as "more below". */
  .list {
    --fade-len: 40px;
    display: flex;
    flex-direction: column;
    max-block-size: min(560px, calc(100dvh - 120px));
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* On a phone the composer's row stays reachable under it: the bar, the
     gap, the home indicator and the composer's own row are kept clear. */
  @media (max-width: 639px) {
    .list {
      max-block-size: calc(
        100dvh -
        44px -
        var(--space-3) -
        var(--safe-bottom) -
        96px
      );
    }
  }
  /* While the update's footer holds at the list's foot (UpdateCard
     `data-stuck`), it draws the foot's fade itself, above it: the list's
     own fade at the foot gives way, and its head's stays. */
  .list:has(:global([data-stuck])) {
    mask-image: linear-gradient(
      to bottom,
      transparent,
      #000 var(--fade-start),
      #000
    );
  }
  /* Sections part with a vermillion hairline: 1px of the brand's vermillion
     (`brand-solid`) at the session tabs' rim strength (`tab-rim-mix`),
     across the rows' width. Increase Contrast draws it solid. */
  .section + .section {
    margin-block-start: var(--space-2);
    padding-block-start: var(--space-2);
    border-block-start: 1px solid
      color-mix(in oklab, var(--brand-solid) var(--tab-rim-mix), transparent);
  }
  @media (prefers-contrast: more) {
    .section + .section {
      border-block-start-color: var(--brand-solid);
    }
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-1);
  }
  /* The section's glyph centred in the panel's one lead column, so its
     title starts on the rows' text column. */
  .glyph {
    display: grid;
    flex: none;
    place-items: center;
    align-self: center;
    inline-size: 28px;
    margin-inline-end: calc(var(--space-3) - var(--space-2));
    color: var(--ink-muted);
  }
  .glyph.needs {
    color: var(--status-attn-glyph);
  }
  .glyph > :global(svg) {
    inline-size: 16px;
    block-size: 16px;
  }
  .title {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  /* Clear all: the kit's xs ghost at the panel's one trailing edge, always
     shown; it rides the head's line without making it taller. */
  .head > :global(.clear) {
    align-self: center;
    margin-block: -4px;
    margin-inline-start: auto;
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* Notices part with a hairline, as rows of one list do. */
  .notices > li + li {
    border-block-start: 1px solid var(--border-hairline);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-4) var(--space-5);
    font: var(--type-label);
    color: var(--ink-muted);
    outline: none;
  }
</style>
