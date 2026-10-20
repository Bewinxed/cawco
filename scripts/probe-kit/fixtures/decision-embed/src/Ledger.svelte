<script>
  /** A month of the ledger: `rows` lines, each 48px tall. */
  let { month = "January", rows = 10 } = $props();
</script>

<ol class="ledger">
  {#each { length: rows } as _, at}
    <li><span>{month} {at + 1}: spend logged</span></li>
  {/each}
</ol>

<style>
  .ledger { box-sizing: border-box; margin: 0; padding: 0 0 0 24px; inline-size: 240px; font-size: 14px; }
  .ledger li { block-size: 48px; line-height: 48px; border-block-end: 1px solid light-dark(#e4e4ea, #2e2e36); }
</style>
