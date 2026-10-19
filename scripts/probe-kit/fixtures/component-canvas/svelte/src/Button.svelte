<script lang="ts">
  let { label = "Save", tone = "primary", disabled = false }: { label?: string; tone?: "primary" | "quiet"; disabled?: boolean } = $props();
</script>

<button class="btn" data-tone={tone} {disabled}>{label}</button>

<style>
  .btn {
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 8px 14px;
    font: 500 14px/1.2 system-ui, sans-serif;
    background: #2f5bd8;
    color: white;
    transition: background-color 160ms ease-out, transform 120ms ease-out;
  }
  .btn[data-tone="quiet"] {
    background: transparent;
    color: var(--ink);
    border-color: light-dark(#c8c8d0, #44444c);
  }
  .btn:hover {
    background: #1f46b8;
  }
  .btn:focus-visible {
    outline: 2px solid #e65d46;
    outline-offset: 2px;
  }
  .btn:active {
    transform: scale(0.97);
  }
</style>
