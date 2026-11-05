<script lang="ts">
  /**
   * How far a choice set is picked, drawn and said (DESIGN.md, The Show
   * Don't Tell Rule): a short meter, then "3 of 9 picked" in tabular
   * figures. Home's Decisions open and the Decisions page draw it alike.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import Progress from "#lib/components/ui/progress/progress.svelte";

  let { picked, total }: { picked: number; total: number } = $props();
  const said = $derived(words.needs.picked(picked, total));
</script>

<span class="flex items-center gap-space-2">
  <Progress
    aria-label={said}
    class="w-c-decision-meter-w"
    max={total}
    value={picked}
  />
  <span class="type-meta text-ink-muted tabular-nums">{said}</span>
</span>
