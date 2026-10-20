<script>
  /** A page head that stacks under 640px, by its CSS and by what its script asks matchMedia as it mounts. */
  let { title = "Spend" } = $props();
  const narrow = window.matchMedia("(max-width: 639px)").matches;
</script>

<header class="head" data-narrow={narrow}>
  <h3>{title}</h3>
  <span>Ask · New session</span>
</header>

<style>
  .head { display: flex; flex-direction: row; gap: 8px; padding: 12px; font-size: 14px; }
  .head h3 { margin: 0; font-size: 16px; }
  @media (max-width: 639px) { .head { flex-direction: column; } }
</style>
