<script lang="ts">
  /**
   * The segmented control in a frame of its own (its states file's): the
   * kit's Tabs list, the groove round its lifted thumb under the chosen
   * segment (thumb.ts), so the thumb's and the segments' corners are read
   * against the groove's (DESIGN.md, Segmented; The Concentric Rule).
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tabs from "#lib/components/ui/tabs/index.js";

  let {
    segments,
    chosen,
  }: {
    /** The segments, each its words. */
    segments: string[];
    /** The chosen segment's words. */
    chosen: string;
  } = $props();

  // svelte-ignore state_referenced_locally: the story's chosen segment is where it starts
  let value = $state(chosen);
</script>

<div class="p-space-5">
  <Tabs.Root bind:value>
    <Tabs.List>
      {#each segments as segment (segment)}
        <Tabs.Trigger value={segment}>{segment}</Tabs.Trigger>
      {/each}
    </Tabs.List>
  </Tabs.Root>
</div>
