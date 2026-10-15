<script lang="ts">
  /**
   * A decision page's state, in its word and hue (DESIGN.md, Glyph, Word,
   * Hue): sent while its session works on it (`status-pill-live`), decided
   * once its record stands (`status-pill-done`). A page still being picked
   * has none (Idle Has No Fill). The tint and the word move with the state
   * over --dur-panel.
   */
  let {
    tone,
    word,
    who = null,
    title,
  }: {
    tone: "live" | "done";
    word: string;
    /** Who is on it, after the word ("· working"). */
    who?: string | null;
    /** The whole state, for a pointer that rests on it. */
    title?: string;
  } = $props();
</script>

<span class="state-pill" data-tone={tone} {title}>
  {word}
  {#if who}
    <span class="who">· {who}</span>
  {/if}
</span>

<style>
  .state-pill {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.3em;
    block-size: 24px;
    max-inline-size: 100%;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    font: var(--type-label);
    white-space: nowrap;
    transition:
      background-color var(--dur-panel) var(--ease-out),
      color var(--dur-panel) var(--ease-out);
  }
  .state-pill[data-tone="live"] {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
  .state-pill[data-tone="done"] {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
  .who {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
