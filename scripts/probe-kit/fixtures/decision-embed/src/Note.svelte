<script>
  /** A short pinned note: the section a canvas reaches only past the ledger. */
  let { text = "Pinned" } = $props();
</script>

<p class="note"><span>{text}</span></p>

<style>
  .note { box-sizing: border-box; margin: 0; padding: 12px; inline-size: 240px; font-size: 14px; border-radius: 8px; background: light-dark(#eef4ff, #1c2433); }
</style>
