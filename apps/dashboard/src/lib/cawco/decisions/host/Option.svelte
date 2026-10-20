<!--
  One option: the kit's chip (page.css `.dp-opt`), its keycap its place in
  its decision, its line what it gets and its cost line what it costs. The
  chip is the pick: the overlay stores a click on its `data-option` and
  sets `data-cawco-picked` and `aria-pressed` from what the hub kept. The
  option's media (its design, drawn live) stands under the chip in the same
  cell, outside the pick, so a click, a hover or a scroll in it is the
  embed's own and never picks. The pick is named by its label alone (its
  keycap is hidden from the name); its line, cost and Recommended tag are
  its description. Recommended stands first, over the label, so the line
  under the label reads as its reason.
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
  const decision = getContext<(() => string) | undefined>("decision-id");
  /** Its parts' ids, from its decision's id and its own: a pin or ink anchored to one holds across revisions. */
  const uid = $derived(`option-${decision?.() ?? ""}--${id}`);
  const described = $derived(
    [
      props.line ? `${uid}-line` : "",
      props.cost ? `${uid}-cost` : "",
      props.recommended === true ? `${uid}-tag` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
</script>

<div class="dp-optcell">
  <button
    aria-describedby={described}
    aria-labelledby="{uid}-label"
    aria-pressed="false"
    class="dp-opt"
    data-option={id}
    disabled={!bridge()}
    type="button"
  >
    {#if props.recommended === true}<span class="dp-tag" id="{uid}-tag"
        >Recommended</span
      >{/if}
    <b id="{uid}-label"
      >{#if keycap > 0}<span aria-hidden="true" class="dp-kc">{keycap}</span
        >{/if}<span>{String(props.label ?? id)}</span></b
    >
    {#if props.line}<span class="dp-line" id="{uid}-line"
        >{String(props.line)}</span
      >{/if}
    {#if props.cost}<span class="dp-cost" id="{uid}-cost"
        >Cost: {String(props.cost)}</span
      >{/if}
  </button>
  {#if media.length > 0}
    <div class="dp-optmedia">{@render renderNode(media)}</div>
  {/if}
</div>
