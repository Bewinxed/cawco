<!--
  One stage's row: one line on its list's columns (subgrid), 44px tall
  (`c-row-h`), its words on the mark line beside its mark; while its handle
  carries it, it lifts and follows the pointer (HeldRow).
-->
<script lang="ts">
  import type { StageKind } from "@cawco/core/views";
  import type { Snippet } from "svelte";
  import type { HeldRow } from "./held-row.svelte.js";

  let {
    index,
    kind,
    held,
    describedby,
    children,
  }: {
    index: number;
    kind: StageKind;
    held: HeldRow;
    /** The head it stands under, when the list has heads. */
    describedby?: string;
    children: Snippet;
  } = $props();
</script>

<li
  aria-describedby={describedby}
  class="relative col-span-full grid min-h-c-row-h min-w-0 grid-cols-subgrid items-center rounded-md px-space-1 mark-line data-held:z-2 data-held:translate-y-(--held-y) data-held:bg-surface-lift data-held:shadow-md"
  data-held={held.at === index || undefined}
  data-kind={kind}
  data-row={index}
  data-slot="setup-stage"
  style:--held-y={held.at === index ? `${held.carried}px` : undefined}
>
  {@render children()}
</li>
