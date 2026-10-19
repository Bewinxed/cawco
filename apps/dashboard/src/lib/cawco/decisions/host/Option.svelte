<!--
  One option: the kit's chip (page.css `.dp-opt`), its keycap its place in
  its decision, its line what it gets and its cost line what it costs. The
  chip is the pick: the overlay stores a click on its `data-option` and
  sets `data-cawco-picked` and `aria-pressed` from what the hub kept. The
  option's media (its design, drawn live) stands under the chip in the same
  cell, outside the pick, so a click, a hover or a scroll in it is the
  embed's own and never picks.
-->
<script lang="ts">
  import { getContext } from "svelte";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import { bridge } from "./page.svelte.js";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    id: unknown;
    label: unknown;
    line?: unknown;
    recommended?: unknown;
    media?: unknown[];
    cost?: unknown;
  }> = $props();

  const order = getContext<(() => string[]) | undefined>("decision-options");
  const id = $derived(String(props.id ?? ""));
  const keycap = $derived((order?.().indexOf(id) ?? -1) + 1);
  const media = $derived(Array.isArray(props.media) ? props.media : []);
</script>

<div class="dp-optcell">
  <button
    aria-pressed="false"
    class="dp-opt"
    data-option={id}
    disabled={!bridge()}
    type="button"
  >
    <b
      >{#if keycap > 0}<span aria-hidden="true" class="dp-kc">{keycap}</span
        >{/if}{String(props.label ?? id)}</b
    >
    {#if props.line}<span>{String(props.line)}</span>{/if}
    {#if props.cost}<span class="dp-cost">Cost: {String(props.cost)}</span>{/if}
    {#if props.recommended === true}<span class="dp-tag">Recommended</span>{/if}
  </button>
  {#if media.length > 0}
    <div class="dp-optmedia">{@render renderNode(media)}</div>
  {/if}
</div>
