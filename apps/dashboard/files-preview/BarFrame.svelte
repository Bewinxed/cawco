<script lang="ts">
  /**
   * The bar's trailing end at 420 × 44, real size: the glass group with
   * Files in it, for judging the count up close. The bar behind is the
   * capture's by day, the shelf at night.
   */
  import BarGlass from "./BarGlass.svelte";
  import { type Count, filesOf, shotDesk } from "./fixtures";

  let { count: take }: { count: Count } = $props();
  const files = filesOf("typical");
</script>

<div class="bar" style:--shot="url({shotDesk})">
  <div class="bar-end">
    <BarGlass
      count={files.artifacts.length + files.attachments.length}
      mark={take === "mark"}
    />
  </div>
</div>

<style>
  :global(html[data-frame="bar"]),
  :global(html[data-frame="bar"] body) {
    margin: 0;
    overflow: hidden;
    background: var(--surface-shelf);
  }
  .bar {
    position: relative;
    inline-size: 420px;
    block-size: 44px;
    overflow: clip;
    background: var(--surface-shelf) var(--shot) no-repeat -1020px 0;
  }
  :global(html.dark) .bar {
    background-image: none;
  }
  .bar-end {
    position: absolute;
    inset-block: 0 1px;
    inset-inline-end: 0;
    display: flex;
    align-items: flex-start;
    padding-block-start: var(--c-bar-group-pad);
    padding-inline: var(--space-3) var(--space-6);
    background: var(--surface-shelf);
  }
</style>
