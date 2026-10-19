<script lang="ts">
  /**
   * A fact file's lines drawn as a run of marks, one per line in file order
   * (report 1 §1, The Show Don't Tell Rule): current in muted ink, Formerly
   * in subtle ink, a Conflict side in the attention glyph's hue, a line that
   * does not read in the failure glyph's. 4px marks at a 2px pitch, never
   * wrapping: past `cap` it draws the first ones and "+n". Under them, once
   * the file passes 60% of the fold's threshold, a 2px meter filled to its
   * share of it, in the attention hue once past: why a fold gets proposed,
   * drawn rather than said.
   */
  import { type MemoryMark, memoryViewWords as words } from "@cawco/core";

  let {
    marks,
    chars,
    limit,
    cap = 24,
  }: {
    marks: MemoryMark[];
    chars: number;
    /** The fold's threshold, in characters (the hub's MEMORY_FILE_CHARS). */
    limit: number;
    cap?: number;
  } = $props();

  const shown = $derived(marks.slice(0, cap));
  const more = $derived(Math.max(0, marks.length - cap));
  const share = $derived(limit > 0 ? chars / limit : 0);
  const kilo = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
</script>

<span data-slot="line-run" class="run">
  <span aria-hidden="true" class="marks mark-line">
    {#each shown as mark, index (index)}
      <span class="mark" data-box data-mark={mark}></span>
    {/each}
    {#if more > 0}
      <span data-slot="more" class="more">{words.morePast(more)}</span>
    {/if}
  </span>
  {#if share >= 0.6}
    <span
      data-slot="size-meter"
      class="meter"
      data-over={share > 1 ? "" : undefined}
      role="img"
      aria-label={words.sizeHover(kilo(chars), kilo(limit))}
      title={words.sizeHover(kilo(chars), kilo(limit))}
      ><span class="fill" style:inline-size="{Math.min(1, share) * 100}%"
      ></span></span
    >
  {/if}
</span>

<style>
  .run {
    display: inline-flex;
    flex-direction: column;
    gap: var(--c-memory-mark-gap);
    min-inline-size: 0;
    max-inline-size: 100%;
    vertical-align: middle;
  }
  .marks {
    display: inline-flex;
    align-items: center;
    gap: var(--c-memory-mark-gap);
    block-size: var(--space-3);
    overflow: clip;
  }
  .mark {
    flex: none;
    inline-size: var(--c-memory-mark);
    block-size: 100%;
    border-radius: var(--radius-hair);
    background: var(--ink-muted);
  }
  .mark[data-mark="formerly"] {
    background: var(--ink-subtle);
    opacity: 0.6;
  }
  .mark[data-mark="conflict"] {
    background: var(--status-attn-glyph);
  }
  .mark[data-mark="unreadable"] {
    background: var(--status-fail-glyph);
  }
  .more {
    flex: none;
    margin-inline-start: var(--space-1);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-subtle);
  }
  .meter {
    display: block;
    block-size: var(--c-memory-meter-h);
    border-radius: var(--radius-hair);
    background: var(--surface-recess);
    overflow: clip;
  }
  .fill {
    display: block;
    block-size: 100%;
    background: var(--ink-muted);
  }
  .meter[data-over] .fill {
    background: var(--status-attn-glyph);
  }
</style>
