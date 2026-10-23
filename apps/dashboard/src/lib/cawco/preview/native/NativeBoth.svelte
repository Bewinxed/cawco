<script lang="ts">
  /**
   * Both, one tree in two places: the preview panel's live stream with the
   * app's tree over it (NativePane), beside the canvas's section of stills
   * with the same tree over each (NativeStills). Wire in the panel's band
   * draws every box in both. Side by side on a desk, the panel first;
   * stacked where the room is narrower.
   */
  import NativePane from "./NativePane.svelte";
  import NativeStills from "./NativeStills.svelte";

  let wire = $state(false);
</script>

<div class="@container/both min-w-0" data-slot="native-both">
  <div class="grid min-w-0 gap-space-5 p-space-4 @wide/both:grid-cols-2">
    <div class="grid min-w-0 content-start gap-space-2">
      <span class="text-ink-muted type-label"
        >In the preview panel: the running app</span
      >
      <div class="relative h-c-bench-phone-h min-w-0">
        <NativePane
          bind:wire
          kind="stream"
          same="· same node as the canvas's Default"
          still
        />
      </div>
    </div>
    <div class="grid min-w-0 content-start gap-space-2">
      <span class="text-ink-muted type-label"
        >On the canvas: a still per state</span
      >
      <div
        class="min-w-0 rounded-lg border border-border-hairline bg-surface-page"
      >
        <NativeStills same="same node as the panel's" {wire} />
      </div>
    </div>
  </div>
</div>
