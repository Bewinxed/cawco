<script lang="ts">
  import Badge from "./Badge.svelte";
  import Button from "./Button.svelte";

  let { title = "Deploy", note = "Ready to ship" }: { title?: string; note?: string } = $props();
</script>

<article class="card">
  <header class="flex items-center gap-2"><h3>{title}</h3><Badge text="Live" /></header>
  <p class="chip rounded px-1 hover:underline">{note}</p>
  <Button label="Open" tone="quiet" />
</article>

<style>
  .card {
    display: grid;
    gap: 8px;
    padding: 16px;
    inline-size: 260px;
    border-radius: var(--radius);
    border: 1px solid light-dark(#dcdce2, #34343c);
    & h3 {
      margin: 0;
      font: 600 16px/1.2 system-ui, sans-serif;
    }
    &:hover {
      border-color: #2f5bd8;
    }
  }
  @scope (.card) {
    p:hover {
      color: #2f5bd8;
    }
  }
</style>
