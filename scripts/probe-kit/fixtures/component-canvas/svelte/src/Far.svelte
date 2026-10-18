<script lang="ts">
  import { far_a } from "./far/a.js";
  import { far_b } from "./far/b.js";
  import { far_c } from "./far/c.js";

  let { value = 1 }: { value?: number } = $props();
</script>

<p class="far">{far_a(value)} · {far_b(value)} · {far_c(value)}</p>

<style>
  .far { margin: 0; padding: 12px; border-radius: var(--radius); background: light-dark(#eef4ff, #1c2433); }
</style>
