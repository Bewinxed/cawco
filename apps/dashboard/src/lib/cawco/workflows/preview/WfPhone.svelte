<script lang="ts">
  /**
   * The project page on a phone with Workflows chosen: the head (the
   * project's name and its ⋯), the view's blocks stacked, and the views bar
   * docked at the foot (ViewBar) with Workflows in its picker. A run opens
   * as its own page instead (`back`): Back and the run's name, then its
   * pane. The bar the shell floats over both is not drawn.
   */
  import type { Snippet } from "svelte";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import { IconChevronLeft, IconMore } from "#lib/icons.js";
  import { PROJECT } from "./release";

  let {
    children,
    back = null,
    line,
  }: {
    children: Snippet;
    /** A page of its own: what Back's page is named, and this page's title. */
    back?: { title: string } | null;
    /** The meta line under a page's title. */
    line?: string;
  } = $props();

  const VIEWS = [
    "Board",
    "Table",
    "Pipeline",
    "Routines",
    "Workflows",
    "Decisions",
  ].map((label) => ({
    label,
    value: label.toLowerCase(),
    count: 0,
    draft: false,
  }));
</script>

<!-- The shell's tooltip provider (Overlays.svelte), which the kit's tips read. -->
<TooltipProvider>
<div
  data-slot="wf-phone"
  class="relative flex min-h-c-address-phone-h min-w-0 flex-col bg-surface-recess text-ink-strong"
>
  <header
    class={[
      "flex min-w-0 items-center gap-space-2 pt-space-4 pe-space-3 pb-space-3",
      back ? "ps-space-2" : "ps-space-5",
    ]}
  >
    {#if back}
      <Button
        aria-label="Back to Workflows"
        data-back
        size="icon-sm"
        variant="ghost"
      >
        <IconChevronLeft />
      </Button>
    {/if}
    <span class="flex min-w-0 flex-auto flex-col gap-space-row">
      <h1
        class="m-0 overflow-clip text-ellipsis whitespace-nowrap type-title text-ink-strong"
      >
        {back ? back.title : PROJECT}
      </h1>
      {#if line}
        <span class="type-meta text-ink-muted">{line}</span>
      {/if}
    </span>
    <Button aria-label="More" size="icon-sm" variant="ghost">
      <IconMore />
    </Button>
  </header>
  <!-- Clear of the views bar docked over the page's foot. -->
  <div
    class={[
      "flex min-w-0 flex-auto flex-col gap-space-group px-space-3",
      back ? "pb-space-3" : "pb-c-page-head-h",
    ]}
  >
    {@render children()}
  </div>
  {#if !back}
    <ViewBar
      current="workflows"
      needs={0}
      needsOn={false}
      onchoose={() => undefined}
      onnewsession={() => undefined}
      ontoggleneeds={() => undefined}
      views={VIEWS}
    />
  {/if}
</div>
</TooltipProvider>
