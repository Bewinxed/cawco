<!--
  One option: a cell of its card's options on the rows they share (a
  subgrid), so every chip, line, cost and media starts on one line across
  the columns. A pictured option left alone on its card's last row spans it
  (Decision.svelte `lone`), on the first column's edge. Its first row is the pick, the kit's option (ui/option-group
  item: the 30px option chip with its keycap, its place in its decision,
  drawn only where there is a keyboard to press it, as Send's keys are),
  then the Recommended and Current badges after it; then its line (what it
  gets), its cost (what it costs), its builds (what picking it means
  building or changing) and its media, 11px apart, each in its row, each the
  writer's own sentence with no label before it; each piece of its media on
  a row of its own, the row every option's piece at that place shares, so
  two designs shown a state per piece compare state beside state. The
  overlay stores a press on its `data-option` (pick.ts) and the group draws
  it chosen. The line and the cost are labels of the chip, so a press on
  their words picks too; the pick is named by its label alone, and its line,
  cost, builds and badges are its description. Its media (its design, drawn live)
  stands in its own row, outside the pick, so a click, a hover or a scroll in
  it is the embed's own and never picks; a Preview, drawing or diagram
  stands at its real size and its well tells the card its width, which lays
  the options out by it; a picture fits the option's column, and pressed
  opens over the page at its own size (Image.svelte).
-->
<script lang="ts">
  import { decisionsWords as words } from "@cawco/core/words/decisions";
  import { getContext, setContext } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { OptionGroupItem } from "#lib/components/ui/option-group/index.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import {
    MEDIA_WIDTHS,
    type MediaWidths,
    PIECE_NAME,
    type PieceNames,
  } from "./page.svelte.js";
  import Words from "./Words.svelte";
  import { plainOf, runsOf } from "./words";

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
    builds?: unknown;
  }> = $props();

  const order = getContext<(() => string[]) | undefined>("decision-options");
  // Its media's wells tell the card their real widths as an option's: the
  // options' pitch is the widest of them (Decision.svelte).
  setContext(
    MEDIA_WIDTHS,
    getContext<MediaWidths | undefined>("decision-option-widths")
  );
  /** The rows the card's options share: each part's track, 0 where none has it. */
  const rows = getContext<
    | (() => {
        line: number;
        cost: number;
        builds: number;
        media: number;
        span: number;
      })
    | undefined
  >("decision-rows");
  const id = $derived(String(props.id ?? ""));
  /** Its media name themselves by its label (page.svelte.ts `pieceName`). */
  /** Its line's type; its cost's and builds'. */
  const LINE_LOOK =
    "type-body min-w-0 max-w-c-measure text-pretty text-ink-strong wrap-anywhere";
  const META_LOOK =
    "type-meta min-w-0 max-w-c-measure text-pretty text-ink-muted wrap-anywhere";
  setContext<PieceNames>(PIECE_NAME, () => plainOf(String(props.label ?? id)));
  const keycap = $derived((order?.().indexOf(id) ?? -1) + 1);
  const media = $derived(Array.isArray(props.media) ? props.media : []);
  const decision = getContext<(() => string) | undefined>("decision-id");
  /** Its parts' ids, from its decision's id and its own: a pin or ink anchored to one holds across revisions. */
  const uid = $derived(`option-${decision?.() ?? ""}--${id}`);
  const described = $derived(
    [
      props.line ? `${uid}-line` : "",
      props.cost ? `${uid}-cost` : "",
      props.builds ? `${uid}-builds` : "",
      props.recommended === true ? `${uid}-tag` : "",
      props.current === true ? `${uid}-now` : "",
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
  const at = $derived(
    rows?.() ?? { line: 2, cost: 3, builds: 4, media: 5, span: 5 }
  );
</script>

<!-- Its line, cost or builds: a label of its chip, so a press on its words picks. Words that name a `cawco:` reference draw it as its chip (Words.svelte), which opens what it names; a label holds no control but its own, so they stand as a line beside the chip instead, the chip still described by them. -->
{#snippet optionPart(
  part: "line" | "cost" | "builds",
  text: unknown,
  look: string
)}
  {#if text}
    {@const said = String(text)}
    {#if runsOf(said).some((run) => "href" in run)}
      <p
        class={[look, "row-start-(--row)"]}
        data-option-for={id}
        id="{uid}-{part}"
        style:--row={at[part]}
      >
        <Words text={said} />
      </p>
    {:else}
      <label
        class={[look, "row-start-(--row)"]}
        data-option-for={id}
        for="{uid}-chip"
        id="{uid}-{part}"
        style:--row={at[part]}>{said}</label
      >
    {/if}
  {/if}
{/snippet}

<div
  class="grid min-w-0 row-span-(--span) grid-rows-subgrid gap-y-space-2 group-data-lone/options:last:col-span-full"
  data-slot="option-cell"
  style:--span={at.span}
>
  <!-- Its lines packed at the row's top (`content-start`): the row is stretched to the track every cell's first row shares, and a stretched line centred the chip there, so a cell whose badge wrapped stood its chip 14px higher than its neighbours'. Each chip stands on the row's first line, its badges centred beside it or wrapped under it. -->
  <div class="flex min-w-0 flex-wrap content-start items-center gap-space-2">
    <OptionGroupItem
      aria-describedby={described}
      aria-labelledby="{uid}-label"
      data-option={id}
      digit={keycap > 0 && keycap < 10 ? keycap : undefined}
      id="{uid}-chip"
      value={id}
    >
      {#if keycap > 0}<Kbd
          aria-hidden="true"
          data-box
          look="keycap"
          reach="keyboard">{keycap}</Kbd
        >{/if}<span
        class="min-w-0 wrap-anywhere text-pretty"
        data-slot="option-label"
        id="{uid}-label"><Words still text={String(props.label ?? id)} /></span
      >
    </OptionGroupItem>
    {#if props.recommended === true}
      <Badge id="{uid}-tag"><span>{words.recommended}</span></Badge>
    {/if}
    {#if props.current === true}
      <Badge id="{uid}-now"><span>{words.current}</span></Badge>
    {/if}
  </div>
  {@render optionPart("line", props.line, LINE_LOOK)}
  {@render optionPart("cost", props.cost, META_LOOK)}
  {@render optionPart("builds", props.builds, META_LOOK)}
  {#each media as piece, place (place)}
    <!-- Each piece on its own row, shared with every option's piece at the same place (Decision.svelte `rows`): a state beside the same state. -->
    <div
      class="row-start-(--row) flex min-w-0 flex-col"
      data-slot="option-media"
      style:--row={at.media + place}
    >
      {@render renderNode(piece)}
    </div>
  {/each}
</div>
