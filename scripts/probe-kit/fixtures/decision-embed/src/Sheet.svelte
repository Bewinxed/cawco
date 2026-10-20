<script>
  /** A sheet whose surface is drawn on its ::before, as the kit's drawer-content.svelte draws one: its own box paints nothing. */
  let { title = "Spend this month", lines = [] } = $props();
</script>

<section class="sheet">
  <h3><span>{title}</span></h3>
  <ul>
    {#each lines as line}
      <li><span>{line}</span></li>
    {/each}
  </ul>
</section>

<style>
  .sheet { position: relative; isolation: isolate; box-sizing: border-box; inline-size: 100%; block-size: 200px; padding: 16px; font-size: 14px; }
  .sheet::before { content: ""; position: absolute; inset: 0; z-index: -1; border-radius: 12px; background: light-dark(#dfe8ff, #1d2a4a); }
  .sheet h3 { margin: 0; font-size: 14px; }
  .sheet ul { margin: 8px 0 0; padding: 0 0 0 18px; display: grid; gap: 4px; }
</style>
