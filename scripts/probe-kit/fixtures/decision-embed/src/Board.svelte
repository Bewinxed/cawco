<script>
  /** A board's summary at its story's own width: a desk's 640px or a phone's 390px, words at 14px, a title at 16px. */
  let { title = "This week", rows = [], note = "" } = $props();
</script>

<section class="board">
  <h3><span>{title}</span></h3>
  <ul>
    {#each rows as row}
      <li><span>{row[0]}</span><span>{row[1]}</span></li>
    {/each}
  </ul>
  {#if note}<p>{note}</p>{/if}
</section>

<style>
  .board { box-sizing: border-box; display: grid; gap: 10px; padding: 18px; inline-size: 100%; font-size: 14px; line-height: 20px; border-radius: 10px; background: light-dark(#f4f4f7, #23232a); color: light-dark(#1d1d22, #ececf1); }
  .board h3 { margin: 0; font-size: 16px; }
  .board ul { margin: 0; padding: 0; display: grid; gap: 6px; list-style: none; }
  .board li { display: flex; justify-content: space-between; gap: 12px; }
  .board p { margin: 0; }
</style>
