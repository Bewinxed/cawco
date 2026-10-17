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

<!-- literal: 24px, 10px, 0.3em (padding: 0 10px is padding-inline 10px) -->
<span
  data-slot="state-pill"
  class="type-label inline-flex max-w-full flex-none items-center gap-(--pill-gap) h-(--pill-h) px-(--pill-pad) rounded-pill whitespace-nowrap transition-[background-color,color] dur-panel ease-out tone-live:bg-status-live-bg tone-live:text-status-live-ink tone-done:bg-status-done-bg tone-done:text-status-done-ink"
  data-tone={tone}
  style:--pill-gap="0.3em"
  style:--pill-h="24px"
  style:--pill-pad="10px"
  {title}
>
  {word}
  {#if who}
    <span data-slot="who" class="min-w-0 truncate">· {who}</span>
  {/if}
</span>
