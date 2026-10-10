<script lang="ts">
  /**
   * What Caw's popover holds (NeedsCaw): one list in two sections. Needs you
   * first, longest wait first (home `needs`), each a NeedsCard row; then
   * Notices, the update notice, the logins moved in and what an account's
   * arrival set moving, each a row with its ✕. A notice never outranks an
   * ask. A section with nothing in it is not drawn; with neither, the empty
   * block says what he knows (The Claim Of Nothing Rule).
   *
   * The panel is the notices' one surface: there is no update toast and no
   * Home card. Rows arrive and leave on the Nothing Jumps Rule (`reflow`),
   * and the popover tweens to its new height (`morph`).
   */
  import RebalanceNotices from "../accounts/RebalanceNotices.svelte";
  import { reflow } from "../motion/rows.svelte";
  import { notices } from "../notices.svelte";
  import type { Notice } from "../updates/model";
  import { actOnUpdate, dismissUpdate } from "../updates/update-notice.svelte";
  import CawFace from "./CawFace.svelte";
  import { cawNotices } from "./caw-notices.svelte";
  import { home } from "./home-state.svelte";
  import MovedLogins from "./MovedLogins.svelte";
  import NeedsCard from "./NeedsCard.svelte";
  import UpdateCard from "./UpdateCard.svelte";

  let {
    quiet,
    onchoose,
  }: {
    /** What he says with nothing to count (NeedsCaw `quiet`). */
    quiet: string;
    /** A row was chosen: the panel closes as it opens. */
    onchoose: () => void;
  } = $props();

  const stale = $derived(!home.live);
  const needs = $derived(home.needs);
  const updated = $derived(cawNotices.updated);

  /**
   * Reload was chosen: the row says its goodbye until the tab goes, also
   * once acknowledging has dropped the notice from `updated`.
   */
  let reloading = $state(false);
  const updateShown = $derived(updated !== null || reloading);
  const noticeCount = $derived(
    cawNotices.count + (reloading && updated === null ? 1 : 0)
  );

  function act(notice: Notice, action: NonNullable<Notice["action"]>): void {
    if (action === "reload") {
      if (reloading) {
        return;
      }
      reloading = true;
    }
    actOnUpdate(notice, action);
  }
</script>

<!-- More than the panel holds: the house edge fade at the foot while more
     is below, and at the head once scrolled. -->
<div class="list kit-edge-fade-block" {@attach reflow()}>
  {#if needs.length > 0}
    <section aria-labelledby="caw-needs" class="section" data-flip="box">
      <div class="head">
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
        <span class="title" id="caw-notices">Notices</span>
        <span class="count">{noticeCount}</span>
      </div>
      <ul class="rows notices">
        {#if updateShown}
          <li data-flip>
            <UpdateCard
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
        {#if cawNotices.moved.length > 0}
          <li data-flip>
            <MovedLogins
              moved={cawNotices.moved}
              ondismiss={() => {
                // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
                void notices.acknowledge(cawNotices.moved.map((one) => one.id));
              }}
            />
          </li>
        {/if}
        {#if cawNotices.rebalanced.length > 0}
          <li data-flip>
            <RebalanceNotices
              notices={cawNotices.rebalanced}
              ondismiss={() => {
                // biome-ignore lint/complexity/noVoid: the hub's record comes back on the next board frame
                void notices.acknowledge(
                  cawNotices.rebalanced.map((one) => one.id)
                );
              }}
            />
          </li>
        {/if}
      </ul>
    </section>
  {/if}

  {#if needs.length === 0 && noticeCount === 0}
    <div class="empty" data-flip role="status" tabindex="-1">
      {#if home.status === "connected"}
        <CawFace size={48} status="ready" />
      {/if}
      <span>{quiet}</span>
    </div>
  {/if}
</div>

<style>
  .list {
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
  .section + .section {
    margin-block-start: var(--space-2);
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--border-hairline);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-1);
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
