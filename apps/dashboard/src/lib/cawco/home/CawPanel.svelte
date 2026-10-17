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
  import { damagedHubRecordWords } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNeedsYou, IconNotices } from "#lib/icons.js";
  import RebalanceNotices from "../accounts/RebalanceNotices.svelte";
  import { echoBeat } from "../motion/echo.svelte";
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

  /**
   * The list runs past what the panel holds: only then does it wear the
   * house edge fade. A list that fits fades no edge (the recipe's own
   * rule), but WebKit still drew it through the recipe's mask, opaque, on
   * every paint, and the panel is painted afresh as it opens.
   */
  let overflowing = $state(false);
  function measured(list: HTMLElement) {
    const read = () => {
      overflowing = list.scrollHeight > list.clientHeight;
    };
    // Its own box (the window, its cap) and each section's (rows arriving,
    // notes folding), the sections that come later too.
    const sized = new ResizeObserver(read);
    const watch = () => {
      sized.observe(list);
      for (const child of list.children) {
        sized.observe(child);
      }
      read();
    };
    watch();
    const rows = new MutationObserver(watch);
    rows.observe(list, { childList: true, subtree: true });
    return () => {
      sized.disconnect();
      rows.disconnect();
    };
  }
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
  /** The hub's notices record is damaged: one row says so, with Reset. */
  const damaged = $derived(feed.noticesDamaged);
  /** The notices standing: the update, each moved login and rebalance, or the damaged record. */
  const noticeCount = $derived(
    (updateShown ? 1 : 0) + moved.length + rebalanced.length + (damaged ? 1 : 0)
  );

  let resetting = $state(false);
  let resetProblem = $state<string | null>(null);
  /** Reset: the row goes once the hub's board says the record is whole again. */
  async function reset(): Promise<void> {
    resetting = true;
    resetProblem = null;
    try {
      await feed.resetNotices();
    } catch (error) {
      resetProblem = error instanceof Error ? error.message : String(error);
    } finally {
      resetting = false;
    }
  }
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
     is below, and at the head once scrolled. The kit's edge fade at its
     full length on every width: a phone's short fade (the recipe's, for a
     narrow track's edge) lands in the gap between a row's words and its
     buttons and shows nothing; the panel's foot must read as "more below".
     On a phone the composer's row stays reachable under it: the bar, the
     gap, the home indicator and the composer's own row are kept clear.
     Sections part with a vermillion hairline: 1px of the brand's vermillion
     (`brand-solid`) at `tab-rim-mix` (the strength a status rim holds 3:1
     at), across the rows' width. Increase Contrast draws it solid. -->
<!-- literal: 40px; 560px, 120px; 44px, 96px -->
<div
  data-slot="list"
  class={[
    "flex max-h-(--list-max) flex-col overflow-y-auto overscroll-contain has-data-stuck:mask-(--stuck-fade) max-phone:max-h-(--list-max-phone) [&>[data-slot=section]+[data-slot=section]]:mt-space-2 [&>[data-slot=section]+[data-slot=section]]:border-t [&>[data-slot=section]+[data-slot=section]]:border-bs-brand-solid/(--tab-rim-mix) [&>[data-slot=section]+[data-slot=section]]:pt-space-2 contrast-more:[&>[data-slot=section]+[data-slot=section]]:border-bs-brand-solid",
    overflowing && "kit-edge-fade-block",
  ]}
  data-safe-bottom
  style:--fade-len="40px"
  style:--list-max="min(560px, calc(100dvh - 120px))"
  style:--list-max-phone={"calc(100dvh - 44px - var(--space-3) - var(--safe-bottom) - 96px)"}
  style:--stuck-fade={"linear-gradient(to bottom, transparent, var(--mask-opaque) var(--fade-start), var(--mask-opaque))"}
  {@attach reflow()}
  {@attach measured}
>
  {#if needs.length > 0}
    <section data-slot="section" aria-labelledby="caw-needs" data-flip="box">
      <div
        data-slot="head"
        class="mark-line flex items-center gap-space-2 px-space-3 pt-space-2 pb-space-1"
      >
        <!-- The section's glyph centred in the panel's one lead column, so
             its title starts on the rows' text column. -->
        <!-- literal: 28px -->
        <span
          data-slot="needs"
          data-caw-panel-glyph
          class="me-(--glyph-gap) grid w-(--glyph-w) flex-none place-items-center self-center text-status-attn-glyph"
          data-box
          style:--glyph-gap="calc(var(--space-3) - var(--space-2))"
          style:--glyph-w="28px"
          ><IconNeedsYou aria-hidden="true" class="size-icon-md" /></span
        >
        <span
          data-slot="title"
          class="type-label text-ink-strong"
          id="caw-needs">Needs you</span
        >
        <span data-slot="count" class="type-meta num text-ink-muted"
          >{needs.length}</span
        >
      </div>
      <ul class="m-0 list-none p-0" {@attach echoBeat()}>
        {#each needs as item (item.key)}
          <li data-flip><NeedsCard {item} {onchoose} {stale} /></li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if noticeCount > 0}
    <section data-slot="section" aria-labelledby="caw-notices" data-flip="box">
      <div
        data-slot="head"
        class="mark-line flex items-center gap-space-2 px-space-3 pt-space-2 pb-space-1"
      >
        <!-- literal: 28px -->
        <span
          data-slot="glyph"
          class="me-(--glyph-gap) grid w-(--glyph-w) flex-none place-items-center self-center text-ink-muted"
          data-box
          style:--glyph-gap="calc(var(--space-3) - var(--space-2))"
          style:--glyph-w="28px"
          ><IconNotices aria-hidden="true" class="size-icon-md" /></span
        >
        <span
          data-slot="title"
          class="type-label text-ink-strong"
          id="caw-notices">Notices</span
        >
        <span data-slot="count" class="type-meta num text-ink-muted"
          >{noticeCount}</span
        >
        {#if clearable}
          <!-- Clear all: the kit's xs ghost, always shown, its words ending
               on the panel's one trailing edge: it hangs past the edge by
               what stands between its box and its last letter's ink (the
               kit's 1px transparent border, the xs size's 8px padding and
               the l's side bearing in Figtree, 0.07em), so its box and its
               hover fill keep their size. It rides the head's line without
               making it taller. -->
          <!-- literal: -4px; 8px, 0.07em -->
          <Button
            data-clear
            aria-label="Clear all {noticeCount} notices"
            data-box
            class="ms-auto me-(--clear-hang) my-(--clear-pull) self-center"
            onclick={clearAll}
            size="xs"
            tone="quiet"
            style="--clear-pull: -4px; --clear-hang: calc(-1 * (1px + 8px + 0.07em));"
            variant="ghost">Clear all</Button
          >
        {/if}
      </div>
      <!-- Notices part with a hairline, as rows of one list do. -->
      <ul
        data-slot="notices"
        class="m-0 list-none p-0 [&>li+li]:border-t [&>li+li]:border-t-border-hairline"
      >
        {#if damaged}
          <!-- The damaged record: its words on the rows' text column, Reset
               at the panel's one trailing edge, the hub's refusal under
               them. -->
          <!-- literal: 1fr auto; 28px -->
          <li
            class="grid grid-cols-(--damaged-cols) items-start gap-x-space-2 gap-y-space-1 py-space-2 pr-space-3 pl-(--damaged-lead)"
            data-flip
            style:--damaged-cols="1fr auto"
            style:--damaged-lead="calc(var(--space-3) + 28px + var(--space-3))"
          >
            <p
              data-slot="words"
              class="m-0 type-meta text-status-fail-ink"
              role="alert"
            >
              {damagedHubRecordWords("notices", damaged)}
            </p>
            <Button
              failed={resetProblem !== null}
              label="Reset"
              onclick={reset}
              pending={resetting}
              pendingLabel="Resetting…"
              size="xs"
              variant="secondary"
            />
            {#if resetProblem}
              <p class="col-span-full m-0 type-meta text-ink-muted">
                {resetProblem}
              </p>
            {/if}
          </li>
        {/if}
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
    <!-- mark-line: Caw stands above the words, not beside them -->
    <div
      data-slot="caw-panel-empty"
      class="grid justify-items-center gap-space-2 px-space-4 pt-space-6 pb-space-5 type-label text-ink-muted outline-none"
      data-flip
      role="status"
      tabindex="-1"
    >
      {#if feed.connected}
        <CawFace size={48} status="ready" />
      {/if}
      <span>{quiet}</span>
    </div>
  {/if}
</div>
