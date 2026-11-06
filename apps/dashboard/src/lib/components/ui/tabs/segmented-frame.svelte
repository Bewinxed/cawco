<script lang="ts">
  /**
   * The segmented control in a frame of its own (its states file's): the
   * kit's Tabs list, the groove round its lifted thumb under the chosen
   * segment (thumb.ts), so the thumb's and the segments' corners are read
   * against the groove's (DESIGN.md, Segmented; The Concentric Rule).
   */
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";

  let {
    segments,
    chosen,
    tips = false,
  }: {
    /** The segments, each its words. */
    segments: string[];
    /** The chosen segment's words. */
    chosen: string;
    /** Each segment named in a tooltip (Tip round its trigger): it keeps its own slot, so the thumb still finds the chosen one. */
    tips?: boolean;
  } = $props();

  // The story's chosen segment, until a press picks another (it follows
  // the story's args while mounted: house/follows-props).
  let value = $derived(chosen);
</script>

<div class="p-space-5">
  <Tabs.Root bind:value>
    <Tabs.List>
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
