<script lang="ts">
  /**
   * The project page at a desk with Workflows chosen in its view strip:
   * the strip as the shell's bar holds it (the project page's `strip`
   * snippet: the kit Tabs, then Ask Caw), the project's head, the view's
   * own page, and what it opened beside it in the Split (SideSurface), a
   * run. The rail and Caw's dock are the shell's and are not drawn.
   */
  import type { Snippet } from "svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import Split from "#lib/cawco/side/Split.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import { IconSparkles } from "#lib/icons.js";
  import { PROJECT } from "./release";

  let {
    page,
    beside,
    sideTitle = "",
    sideSubtitle,
    sideActions,
    sideLabel = "Run",
  }: {
    /** The Workflows view's page. */
    page: Snippet;
    /** What stands beside it in the Split. */
    beside?: Snippet;
    sideTitle?: string;
    sideSubtitle?: string;
    sideActions?: Snippet;
    sideLabel?: string;
  } = $props();

  const VIEWS = [
    { value: "board", label: "Board" },
    { value: "table", label: "Table" },
    { value: "pipeline", label: "Pipeline" },
    { value: "routines", label: "Routines" },
    { value: "workflows", label: "Workflows" },
    { value: "decisions", label: "Decisions" },
  ];
</script>

<!-- The shell's tooltip provider (Overlays.svelte), which the kit's tips read. -->
<TooltipProvider>
<div
  data-slot="wf-desk"
  class="flex min-h-c-details-card-max-h min-w-0 flex-col bg-surface-recess text-ink-strong"
>
  <div
    data-slot="strip"
    class="flex h-c-top-bar-h min-w-0 flex-none items-center gap-space-3 border-b border-border-hairline bg-surface-shelf pe-space-3 ps-space-7"
  >
    <Tabs value="workflows">
      <TabsList aria-label="Views" scrollable>
        {#each VIEWS as view (view.value)}
          <TabItem label={view.label} value={view.value} />
        {/each}
      </TabsList>
    </Tabs>
    <span class="flex-auto"></span>
    <Button layout="wide" press="pressable" size="sm" variant="ghost">
      <IconSparkles />
      <span>Ask Caw</span>
    </Button>
  </div>
  <div class="flex min-h-0 min-w-0 flex-auto">
    <Split
      backLabel="Back to workflows"
      keys={{ expanded: "wf-preview:expanded", width: "wf-preview:width" }}
      open={beside !== undefined}
    >
      {#snippet main()}
        <div
          data-slot="page"
          class="flex min-w-0 flex-col gap-space-group pt-space-5 pe-space-6 pb-space-7 ps-space-7"
        >
          <header class="flex min-w-0 flex-col gap-space-1">
            <h1 class="m-0 type-title text-ink-strong">{PROJECT}</h1>
            <p class="m-0 type-meta text-ink-muted">
              obelisk · ~/code/release-app
            </p>
          </header>
          {@render page()}
        </div>
      {/snippet}
      {#snippet side()}
        {#if beside}
          <SideSurface
            actions={sideActions}
            label={sideLabel}
            onclose={() => undefined}
            recessed={false}
            subtitle={sideSubtitle}
            title={sideTitle}
          >
            {@render beside()}
          </SideSurface>
        {/if}
      {/snippet}
    </Split>
  </div>
</div>
</TooltipProvider>
