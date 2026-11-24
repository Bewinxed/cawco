<script lang="ts">
  /**
   * Fixture part for a session's screen on the design graph: the shelf over
   * its conversation, as the app's shell draws it: the session's tab (its
   * Needs-you hand while anything waits on the person), then the bar's
   * trailing glass on a desk, a step of room above it for the glass's
   * corner. The tab and the glass are the shell's own components.
   */
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconFilesLinear,
    IconNeedsYou,
    IconSearch,
    IconServerLinear,
  } from "#lib/icons.js";

  let {
    title,
    needsYou,
  }: {
    /** The session's title, its tab's words. */
    title: string;
    /** Something of the session waits on the person. */
    needsYou: boolean;
  } = $props();
</script>

<div
  class="relative z-2 box-content flex h-c-top-bar-h flex-none items-end gap-space-3 pbs-space-3 ps-space-3 pe-space-2"
>
  <div class="relative min-w-0 flex-auto">
    <Tabs value="this" variant="folder">
      <TabsList aria-label="Sessions">
        <TabItem label={title} value="this">
          {#snippet lead()}
            {#if needsYou}
              <IconNeedsYou
                aria-hidden="true"
                class="size-icon-md text-status-attn-glyph"
              />
            {/if}
          {/snippet}
        </TabItem>
      </TabsList>
    </Tabs>
  </div>
  <div class="relative flex-none self-center max-desk:hidden">
    <BarGlass form="group">
      <BarItem count={100} icon={IconFilesLinear} label="Files, 100" />
      <BarItem label="Jump to session">
        <IconSearch aria-hidden="true" class="size-icon-md text-ink-muted" />
      </BarItem>
      <BarItem count={4} icon={IconServerLinear} label="4 machines" />
    </BarGlass>
  </div>
</div>
