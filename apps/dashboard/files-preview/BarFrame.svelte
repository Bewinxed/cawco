<script lang="ts">
  /**
   * The session's top bar at a desk's 1440 × 44, real size, for judging
   * the count up close: the shelf the tabs stand on and its hairline (Shell
   * `.top.hosting`), the glass group at its trailing end where Shell stands
   * it (the page's 21px end inset, a group pad from the bar's top). The
   * page shows the bar's trailing end.
   */
  import FilesBar from "./FilesBar.svelte";
  import { type Count, filesOf } from "./fixtures";

  let { count: take }: { count: Count } = $props();
  const files = filesOf("typical");
</script>

<div class="bar">
  <div class="bar-end">
    <FilesBar
      count={files.artifacts.length + files.attachments.length}
      railed
      {take}
    />
  </div>
</div>

<style>
  :global(html[data-frame="bar"]),
  :global(html[data-frame="bar"] body) {
    margin: 0;
    overflow: hidden;
  }
  .bar {
    position: relative;
    block-size: var(--c-top-bar-h);
    background:
      linear-gradient(var(--border-hairline), var(--border-hairline)) bottom /
        100% 1px no-repeat,
      var(--surface-shelf);
  }
  .bar-end {
    position: absolute;
    inset-block-start: var(--c-bar-group-pad);
    inset-inline-end: var(--space-6);
  }
</style>
