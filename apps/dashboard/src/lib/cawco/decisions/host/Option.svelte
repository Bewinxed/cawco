<!--
  One option: the kit's chip (page.css `.dp-opt`), its keycap its place in
  its decision. Picking is the overlay's: a click on `data-option` inside the
  card's `data-cawco-choice` stores it, and the overlay sets
  `data-cawco-picked` and `aria-pressed` from what the hub kept.
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
  }> = $props();

  const order = getContext<(() => string[]) | undefined>("decision-options");
  const id = $derived(String(props.id ?? ""));
  const keycap = $derived((order?.().indexOf(id) ?? -1) + 1);
</script>

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
  {#if Array.isArray(props.media) && props.media.length > 0}
    <span class="media">{@render renderNode(props.media)}</span>
  {/if}
  {#if props.recommended === true}<span class="dp-tag">Recommended</span>{/if}
</button>

<style>
  .media {
    display: block;
    min-inline-size: 0;
    margin-block-start: var(--space-2);
    pointer-events: none;
  }
</style>
