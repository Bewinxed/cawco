<script lang="ts">
  let { text = "New" }: { text?: string } = $props();
</script>

<span class="badge">{text}</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius);
    background: light-dark(#fde9e4, #4a2620);
    font: 500 12px/1.4 system-ui, sans-serif;
  }
</style>
