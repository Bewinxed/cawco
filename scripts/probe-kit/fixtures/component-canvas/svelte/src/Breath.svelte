<script lang="ts">
  let { text = "Working" }: { text?: string } = $props();
</script>

<span class="breath">{text}</span>

<style>
  .breath {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius);
    background: #e6ecfb;
    font: 500 12px/1.4 system-ui, sans-serif;
    animation: breath 1600ms ease-in-out infinite;
  }
  .breath:hover {
    background: #c9d6f7;
  }
  @keyframes breath {
    50% {
      opacity: 0.5;
    }
  }
</style>
