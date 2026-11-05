<script lang="ts">
  /**
   * One group of the briefing (and of a place's page): its name as a
   * heading with its count beside it, the way to its whole at the head's
   * trailing edge, and its rows on a raised card below. The name is always
   * drawn; a count of none is not (DESIGN.md, The Earned Count Rule). While
   * the hub is not live the count's place says "stale since …" in muted
   * ink and the rows below stay, marked (PRODUCT.md, How state is shown);
   * a group whose own read failed says so under its head, the rest live.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronRight } from "#lib/icons.js";

  let {
    title,
    count = 0,
    staleAt,
    failed,
    seeAll,
    card = true,
    level = 2,
    children,
  }: {
    title: string;
    /** What it holds; 0 draws no figure. */
    count?: number;
    /** The hub is not live: when its last good read was. */
    staleAt?: string;
    /** This group's read failed: when, and the hub's reason. */
    failed?: { at: string; why: string };
    /** The place its See all opens, by name. */
    seeAll?: string;
    /** Its rows stand on a raised card (a list); off for a strip of chips. */
    card?: boolean;
    level?: 2 | 3;
    children: Snippet;
  } = $props();
</script>

<section class="flex min-w-0 flex-col gap-space-2" data-group={title}>
  <header
    class="flex min-h-c-section-head-h items-center gap-space-2 ps-space-1"
  >
    <svelte:element
      this={`h${level}`}
      class="mark-line m-0 flex min-w-0 items-baseline gap-space-2 type-label text-ink-strong"
    >
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{title}</span
      >
      {#if staleAt}
        <span class="type-meta font-normal text-ink-muted">
          {words.staleSince(staleAt)}
        </span>
      {:else if count > 0}
        <span class="type-meta font-normal text-ink-muted tabular-nums">
          {count}
        </span>
      {/if}
    </svelte:element>
    {#if seeAll}
      <Button
        class="ms-auto"
        aria-label={words.seeAllOf(seeAll)}
        data-icon="inline-end"
        size="xs"
        tone="quiet"
        variant="ghost"
      >
        <span>{words.seeAll}</span>
        <IconChevronRight aria-hidden="true" />
      </Button>
    {/if}
  </header>
  {#if failed}
    <p class="m-0 ps-space-1 type-meta text-ink-muted text-pretty">
      {words.readFailed(failed.at, failed.why)}
    </p>
  {/if}
  {#if card}
    <div
      class={[
        "min-w-0 overflow-clip rounded-lg bg-surface-raised shadow-tile",
        (staleAt || failed) && "opacity-75",
      ]}
      data-stale={staleAt || failed ? "" : undefined}
    >
      {@render children()}
    </div>
  {:else}
    {@render children()}
  {/if}
</section>
