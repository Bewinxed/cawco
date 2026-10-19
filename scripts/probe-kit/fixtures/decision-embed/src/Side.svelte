<script>
  /** A side card, 360px wide by its story's viewport: wider than a decision card's media on a phone. */
  let { title = "Spend this week", lines = [] } = $props();
</script>

<section class="side">
  <h3><span>{title}</span></h3>
  <ul>
    {#each lines as line}
      <li><span>{line}</span></li>
    {/each}
  </ul>
</section>

<style>
  .side { box-sizing: border-box; display: grid; gap: 8px; padding: 16px; inline-size: 100%; font-size: 14px; border-radius: 8px; background: light-dark(#f4f4f7, #23232a); }
  .side h3 { margin: 0; font-size: 16px; }
  .side ul { margin: 0; padding: 0 0 0 18px; display: grid; gap: 4px; }
</style>
