<script lang="ts">
  /**
   * Files, the item the top bar's glass group leads with (DESIGN.md, Top
   * bar's trailing edge): the folder as the group's `.bar-symbol` in its
   * muted ink and, once there is anything, the number beside it as the
   * machines show theirs (MachinesButton's item-with-a-number recipe): the
   * number in the label role, `--space-2` past the folder, never on its
   * ink, so the folder keeps its shape (owner: "the count is bigger than
   * the icon … can't u put it as part of the integrated icon group?").
   * The folder is Solar's bold-duotone `folder-2`: its front at full ink
   * under a half-ink tab, a folder at 20px where `folder-with-files` read
   * as a half-ink square. A press shows Files in the glass's one card
   * (GlassCard), or shuts it.
   */
  import { mergeProps } from "bits-ui";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import IconFolder from "~icons/solar/folder-2-bold-duotone";
  import { barGlass } from "../bar-glass.svelte";

  let {
    count,
  }: {
    /** Its artifacts and attachments, once the artifacts are read. */
    count: number | null;
  } = $props();

  /* The number only above 0 (DESIGN.md, The Earned Count Rule). */
  const counted = $derived(count !== null && count > 0);
  const label = $derived(counted ? `Files, ${count}` : "Files");
</script>

<Tip label="Files">
  {#snippet children(tip)}
    <button
      data-bar-item
      {...mergeProps(tip, { onclick: () => barGlass.toggle("files") })}
      aria-expanded={barGlass.open === "files"}
      aria-haspopup="dialog"
      aria-label={label}
      class="bar-item files mark-line touch-hit press-tint"
      class:counted
      data-files-control
      type="button"
    >
      <IconFolder aria-hidden="true" class="bar-symbol" data-files-glyph />
      {#if counted}
        <span data-slot="num" class="num" data-files-count>{count}</span>
      {/if}
    </button>
  {/snippet}
</Tip>

<style>
  /* MachinesButton's item with its number: the symbol the plain item's
     inset in, the number --space-2 past it, and after the number the same
     inset and the symbol's grid margin, so its ink ends where a symbol's
     would and the group reads at one spacing. */
  .files.counted {
    --mark-inset: calc((var(--c-bar-item) - var(--c-bar-symbol)) / 2);
    gap: var(--space-2);
    padding-inline: var(--mark-inset)
      calc(var(--mark-inset) + var(--c-bar-symbol) / 12);
  }
  .num {
    font: var(--type-label);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
