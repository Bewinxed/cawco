<script lang="ts">
  /**
   * A heavy canvas's card, as the pairing sheet's is: a cloud of dots, each
   * drifting on a loop of its own, over a button with hover, focus and
   * press. Probe kit only (component-canvas leg 23).
   */
  let { dots = 300, label = "Pair" }: { dots?: number; label?: string } = $props();
</script>

<div class="cloud">
  <div class="dots" aria-hidden="true">
    {#each { length: dots } as _, at (at)}
      <i style:--at={at}></i>
    {/each}
  </div>
  <button class="go">{label}</button>
</div>

<style>
  .cloud {
    display: grid;
    gap: 12px;
    inline-size: 320px;
    padding: 16px;
    border-radius: var(--radius);
    background: #f4f6fb;
  }
  .dots {
    display: grid;
    grid-template-columns: repeat(20, 8px);
    gap: 4px;
  }
  .dots i {
    display: block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: #2f5bd8;
    animation: drift 1800ms ease-in-out calc(var(--at) * -37ms) infinite alternate;
  }
  .go {
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 8px 14px;
    font: 500 14px/1.2 system-ui, sans-serif;
    background: #2f5bd8;
    color: white;
    transition: background-color 160ms ease-out;
  }
  .go:hover {
    background: #1f46b8;
  }
  .go:focus-visible {
    outline: 2px solid #e65d46;
  }
  .go:active {
    background: #17378f;
  }
  @keyframes drift {
    to {
      opacity: 0.3;
      translate: 0 3px;
    }
  }
</style>
