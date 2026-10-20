<script>
  /**
   * A bar whose ⋯ opens a 208px menu end-aligned under it, placed by
   * floating-ui as bits-ui's floating layer places one: flip and shift, no
   * boundary but the viewport.
   */
  import { computePosition, flip, shift } from "@floating-ui/dom";

  let { open = true } = $props();
  let trigger = $state();
  let menu = $state();
  let at = $state({ x: 0, y: 0 });

  $effect(() => {
    if (!(open && trigger && menu)) {
      return;
    }
    computePosition(trigger, menu, {
      placement: "bottom-end",
      strategy: "absolute",
      middleware: [flip(), shift()],
    }).then(({ x, y }) => {
      at = { x, y };
    });
  });
</script>

<div class="story">
  <div class="bar">
    <button bind:this={trigger} aria-controls="spend-menu" aria-expanded={open} class="more" type="button">⋯</button>
    <span>Spend this week</span>
  </div>
  {#if open}
    <ul bind:this={menu} class="menu" id="spend-menu" role="menu" style:left="{at.x}px" style:top="{at.y}px">
      <li role="menuitem">Rename</li>
      <li role="menuitem">Move to another board</li>
      <li role="menuitem">Archive</li>
    </ul>
  {/if}
</div>

<style>
  .story { position: relative; box-sizing: border-box; min-block-size: 220px; padding: 12px; font-size: 14px; }
  .bar { display: flex; align-items: center; gap: 8px; }
  .more { inline-size: 32px; block-size: 32px; font: inherit; }
  .menu { position: absolute; box-sizing: border-box; inline-size: 208px; margin: 0; padding: 4px; list-style: none; border: 1px solid #8889; border-radius: 8px; background: light-dark(#fff, #26262c); }
  .menu li { padding: 6px 8px; }
</style>
