<script lang="ts">
  let { boom = true }: { boom?: boolean } = $props();
  if (boom) {
    throw new Error("boom");
  }
</script>

<p>never</p>
