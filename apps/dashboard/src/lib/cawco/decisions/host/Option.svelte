<!--
  One option: a cell of its card's options on the rows they share (a
  subgrid), so every chip, line, cost and media starts on one line across
  the columns. Its first row is the pick, the kit's option (ui/option-group
  item: the 30px option chip with its keycap, its place in its decision),
  then the Recommended and Current badges after it; then its line (what it
  gets), its cost (what it costs) and its media, each in its row. The
  overlay stores a press on its `data-option` (pick.ts) and the group draws
  it chosen. The line and the cost are labels of the chip, so a press on
  their words picks too; the pick is named by its label alone, and its line,
  cost and badges are its description. Its media (its design, drawn live)
  stands in its own row, outside the pick, so a click, a hover or a scroll in
  it is the embed's own and never picks.
-->
<script lang="ts">
  import { getContext } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { OptionGroupItem } from "#lib/components/ui/option-group/index.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

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
    current?: unknown;
  }> = $props();

  const order = getContext<(() => string[]) | undefined>("decision-options");
  /** The rows the card's options share: each part's track, 0 where none has it. */
  const rows = getContext<
    | (() => { line: number; cost: number; media: number; span: number })
    | undefined
  >("decision-rows");
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
      props.current === true ? `${uid}-now` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
  const SPAN = {
    1: "row-span-1",
    2: "row-span-2",
    3: "row-span-3",
    4: "row-span-4",
  } as const;
  const ROW = { 2: "row-start-2", 3: "row-start-3", 4: "row-start-4" } as const;
  const at = $derived(rows?.() ?? { line: 2, cost: 3, media: 4, span: 4 });
  const rowOf = (track: number) => ROW[track as keyof typeof ROW];
</script>

<div
  class={[
    "grid min-w-0 grid-rows-subgrid gap-y-space-2",
    SPAN[at.span as keyof typeof SPAN],
  ]}
  data-slot="option-cell"
>
  <div class="flex min-w-0 flex-wrap items-center gap-space-2">
    <OptionGroupItem
      aria-describedby={described}
      aria-labelledby="{uid}-label"
      data-option={id}
      digit={keycap > 0 && keycap < 10 ? keycap : undefined}
      id="{uid}-chip"
      value={id}
    >
      {#if keycap > 0}<Kbd aria-hidden="true" data-box look="keycap"
          >{keycap}</Kbd
        >{/if}<span
        class="min-w-0 wrap-anywhere text-pretty"
        data-slot="option-label"
        id="{uid}-label">{String(props.label ?? id)}</span
      >
    </OptionGroupItem>
    {#if props.recommended === true}
      <Badge id="{uid}-tag">Recommended</Badge>
    {/if}
    {#if props.current === true}
      <Badge id="{uid}-now">Current</Badge>
    {/if}
  </div>
  {#if props.line}
    <label
      class={[
        "type-body min-w-0 text-pretty text-ink-strong wrap-anywhere",
        rowOf(at.line),
      ]}
      data-option-for={id}
      for="{uid}-chip"
      id="{uid}-line">{String(props.line)}</label
    >
  {/if}
  {#if props.cost}
    <label
      class={[
        "type-meta min-w-0 text-pretty text-ink-muted wrap-anywhere",
        rowOf(at.cost),
      ]}
      data-option-for={id}
      for="{uid}-chip"
      id="{uid}-cost">Cost: {String(props.cost)}</label
    >
  {/if}
  {#if media.length > 0}
    <div class={["min-w-0", rowOf(at.media)]} data-slot="option-media">
      {@render renderNode(media)}
    </div>
  {/if}
</div>
