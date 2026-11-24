<script lang="ts">
  /**
   * The kit's segmented tabs in a frame of their own (its states file's):
   * the track round its lens over the chosen tab (ui/segmented), so the
   * lens's and the segments' corners are read against the track's, and a
   * pick, a press and a drag are tried where they stand. `fill` runs the
   * track a fixed row's width, its tabs sharing it evenly.
   */
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    label,
    segments,
    chosen,
    tips = false,
    fill = false,
  }: {
    /** Its name, for the screen reader. */
    label: string;
    /** The tabs, each its words. */
    segments: string[];
    /** The chosen tab's words. */
    chosen: string;
    /** Each tab named in a tooltip (Tip round its trigger). */
    tips?: boolean;
    /** The track runs the frame's row, its tabs sharing it evenly. */
    fill?: boolean;
  } = $props();

  // The story's chosen tab, until a press picks another (it follows the
  // story's args while mounted: house/follows-props).
  let value = $derived(chosen);
</script>

<div class="w-90 max-w-full p-space-4">
  <Tabs.Root bind:value>
    <Tabs.List aria-label={label} {fill}>
      {#each segments as segment (segment)}
        {#if tips}
          <Tip label={`Show by ${segment.toLowerCase()}`}>
            {#snippet children(tip)}
              <Tabs.Trigger {...tip} value={segment}>{segment}</Tabs.Trigger>
            {/snippet}
          </Tip>
        {:else}
          <Tabs.Trigger value={segment}>{segment}</Tabs.Trigger>
        {/if}
      {/each}
    </Tabs.List>
  </Tabs.Root>
</div>
