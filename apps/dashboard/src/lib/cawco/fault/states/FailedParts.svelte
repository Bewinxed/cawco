<script lang="ts" module>
  /** Where the failure stands, each the place it is wired in the dashboard. */
  export type Place = "side" | "sheet" | "page" | "tabs" | "composer";
</script>

<script lang="ts">
  /**
   * The failure states' frames (FailedParts.stories.ts): each a part of the
   * dashboard stopped on a render error, drawn by the real boundary and face
   * in the real place it is wired, with what stands round it working.
   *
   * - `side`: the real split beside a conversation on a desk, a task's
   *   card in it as SideSplit draws a failed one (RegionBoundary with
   *   FailedSurface round it); the task's pane throws (Throws). Its Close
   *   puts the card away.
   * - `sheet`: the preview's sheet on a phone (SideSplit's sheets): the
   *   boundary and the card round its face as SideSplit draws them.
   * - `page`, `tabs`, `composer`: a page's body, a pane's tab strip under
   *   the phone's bar, the composer's pill (RegionBoundary's faces).
   *
   * `stuck`: every rebuild throws the same way, so Try again turns the face
   * to Reload page at once.
   */
  import RegionBoundary from "../../RegionBoundary.svelte";
  import FailedSurface from "../../side/FailedSurface.svelte";
  import Split from "../../side/Split.svelte";
  import Throws from "./Throws.svelte";

  let {
    place,
    stuck = false,
    width,
    height,
  }: {
    place: Place;
    stuck?: boolean;
    /** The window's size, as the story's frame. */
    width: number;
    height: number;
  } = $props();

  const builds = { n: 0 };
  /** The side card's Close, live: the card goes, as the split's does. */
  let closed = $state(false);
</script>

{#snippet stand()}
  <div class="size-full bg-surface-well"></div>
{/snippet}

{#snippet transcript(pill = true)}
  <div
    class="flex min-h-0 flex-1 flex-col justify-end gap-space-4 bg-tab-sheet px-space-6 pb-space-4"
  >
    <p class="m-0 max-w-c-measure text-pretty text-ink-strong type-body">
      The side panel crash: your console shows a list that got two items with
      the same key.
    </p>
    {#if pill}
      <div
        class="flex h-c-input-h max-w-c-composer-w items-center rounded-lg border border-border-control bg-surface-raised px-space-3 text-ink-subtle shadow-tile type-body"
      >
        Write to Claude Code
      </div>
    {/if}
  </div>
{/snippet}

{#snippet conversation()}
  {@render transcript()}
{/snippet}

{#snippet sideCard()}
  <RegionBoundary part="task">
    <Throws {builds} {stuck}>{@render stand()}</Throws>
    {#snippet chrome(face)}
      <FailedSurface
        onclose={() => {
          closed = true;
        }}
        title="tsk-165"
        what="task"
      >
        {@render face()}
      </FailedSurface>
    {/snippet}
  </RegionBoundary>
{/snippet}

<div
  data-slot="failed-parts"
  class="relative flex h-(--frame-h) w-(--frame-w) min-w-0 flex-col overflow-hidden bg-surface-recess text-ink-strong"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  {#if place === "side"}
    <!-- The real split beside a conversation, the task's card in it as
         SideSplit draws a failed one: its name and Close round the face. -->
    <Split
      active
      backLabel="Back to conversation"
      keys={{
        width: "cawco.failed-parts.width",
        expanded: "cawco.failed-parts.expanded",
      }}
      main={conversation}
      open={!closed}
      side={sideCard}
      visible
    />
  {:else if place === "sheet"}
    {@render transcript()}
    <div class="absolute inset-x-0 top-2/5 bottom-0 flex flex-col">
      <div
        data-preview-sheet
        class="relative flex min-h-0 flex-1 flex-col rounded-t-lg bg-surface-raised pt-space-3 shadow-drawer"
      >
        <span
          aria-hidden="true"
          class="mx-auto mb-space-1 block h-c-grabber-h w-c-grabber-w flex-none rounded-full bg-border-control"
        ></span>
        <RegionBoundary part="preview">
          <Throws {builds} {stuck}>{@render stand()}</Throws>
          {#snippet chrome(face)}
            <FailedSurface
              onclose={() => undefined}
              title="goo-card"
              what="preview"
            >
              {@render face()}
            </FailedSurface>
          {/snippet}
        </RegionBoundary>
      </div>
    </div>
  {:else if place === "page"}
    <header
      class="flex h-c-top-bar-h flex-none items-center px-space-3 text-ink-strong type-label"
    >
      Sessions
    </header>
    <div class="flex min-h-0 flex-1 flex-col">
      <RegionBoundary face="page" part="workspace">
        <Throws {builds} {stuck}>{@render stand()}</Throws>
      </RegionBoundary>
    </div>
  {:else if place === "tabs"}
    <RegionBoundary barOver face="strip" part="tabs">
      <Throws {builds} {stuck} />
    </RegionBoundary>
    {@render transcript()}
  {:else}
    <div class="relative flex min-h-0 flex-1 flex-col">
      {@render transcript(false)}
      <div class="pointer-events-none absolute inset-0 z-1">
        <RegionBoundary face="composer" part="composer">
          <Throws {builds} {stuck} />
        </RegionBoundary>
      </div>
    </div>
  {/if}
</div>
