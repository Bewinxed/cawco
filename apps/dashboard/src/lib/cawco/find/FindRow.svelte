<script lang="ts">
  /**
   * The one finder row (find-rows.ts `Row`): glyph, title, age; the state
   * word first on the meta line; the reason it is here on a third line when
   * a purpose, a report or a moment matched. Fixed heights: 52px for two
   * lines and 70px with the reason on the desk; on a phone 56px, the title
   * wrapping rather than clipping, and a ⌄ at the trailing end (a 44px
   * target) that unfolds the peek in place while the row body opens.
   *
   * It is an option of the finder's listbox: the field keeps the focus and
   * names this row as its active descendant.
   */
  import ChevronDown from "~icons/solar/alt-arrow-down-linear";
  import { age, type Row } from "./find-rows";

  let {
    row,
    id,
    now,
    active = false,
    phone = false,
    peekable = false,
    peeked = false,
    onpick,
    onpeek,
    onhover,
  }: {
    row: Row;
    id: string;
    now: number;
    active?: boolean;
    phone?: boolean;
    /** A ⌄ that unfolds the peek (a phone's touch target; the desk peeks with →). */
    peekable?: boolean;
    peeked?: boolean;
    onpick: () => void;
    onpeek?: () => void;
    onhover?: () => void;
  } = $props();

  const ago = $derived(age(row.at, now));
</script>

<!-- literal: 44px -->
<div
  data-slot="slot"
  class="relative flex flex-col flex-none"
  data-flip
  data-key={row.key}
  data-phone={phone || undefined}
  role="none"
  style:--hit="44px"
>
  <!-- The glyph, title and age are the mark line (DESIGN.md The Mark Line
       Rule): the glyph's cell is a box on it, and the meta and reason lines
       stand under it, boxes the recipe leaves as they are. -->
  <!-- literal: 20px, 16px, 18px, 8px, 10px, 56px, 0.35em, 0.25em, minmax(0, 1fr) -->
  <button
    data-slot="row"
    {id}
    class="group/row mark-line relative grid grid-cols-(--row-cols) grid-rows-(--row-rows) gap-x-space-2 items-center w-full min-h-(--row-min) px-space-3 py-(--row-pad) border-0 rounded-sm bg-transparent text-start box-border cursor-default outline-none select-none active:bg-surface-fill data-phone:min-h-(--row-min-phone) data-phone:py-(--row-pad-phone) data-peekable:pe-(--hit)"
    aria-describedby={peeked ? `${id}-peek` : undefined}
    aria-label={row.spoken}
    aria-selected={active}
    data-active={active ? "" : undefined}
    data-find-row
    data-has-reason={row.reason !== null ? "" : undefined}
    data-peekable={peekable || undefined}
    data-phone={phone || undefined}
    onclick={onpick}
    onpointermove={onhover}
    role="option"
    tabindex="-1"
    type="button"
    style:--line-1="20px"
    style:--line-meta="16px"
    style:--line-reason="18px"
    style:--row-cols="var(--icon-md) minmax(0, 1fr) auto"
    style:--row-rows="var(--line-1) auto"
    style:--row-min="calc(var(--line-1) + var(--line-meta) + 16px)"
    style:--row-min-phone="56px"
    style:--row-pad="8px"
    style:--row-pad-phone="10px"
    style:--title-fs-phone="16px"
    style:--sep-pad="0.35em"
    style:--arrow-pad="0.25em"
  >
    <span
      data-slot="glyph"
      class="grid place-items-center row-start-1 col-start-1 w-icon-md h-(--line-1) text-status-idle-glyph tone-live:text-status-live-glyph tone-attn:text-status-attn-glyph tone-fail:text-status-fail-glyph group-data-phone/row:self-start"
      data-breathes={row.breathes ? "" : undefined}
      data-tone={row.state.tone}
      aria-hidden="true"
      data-box
    >
      <row.glyph class="size-icon-md" />
    </span>
    <!-- Its words trimmed to their x-height on the mark line, so the box clips
         (Gecko does not trim a scroll container). -->
    <span
      data-slot="title"
      class="row-start-1 col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap font-body text-size-label font-medium leading-(--line-1) text-ink-row group-data-phone/row:text-(length:--title-fs-phone) group-data-phone/row:whitespace-normal group-data-phone/row:line-clamp-3"
      >{row.title}</span
    >
    {#if ago}
      <span
        data-slot="num"
        class="num row-start-1 col-start-3 font-body text-size-meta font-normal leading-(--line-1) text-ink-muted group-data-phone/row:self-start"
        aria-hidden="true">{ago}</span
      >
    {/if}
    <span
      data-slot="meta"
      class="row-start-2 col-start-2 col-end-4 line-clamp-2 font-body text-size-meta font-normal leading-(--line-meta) text-ink-muted group-data-phone/row:text-size-label"
      aria-hidden="true"
      data-box
    >
      <span
        class="font-medium text-ink-muted tone-live:text-status-live-ink tone-attn:text-status-attn-ink tone-fail:text-status-fail-ink"
        data-tone={row.state.tone}>{row.state.word}</span
      >
      {#each row.meta as word (word)}
        <span class="px-(--sep-pad)">·</span>{word}
      {/each}
    </span>
    {#if row.reason}
      <span
        data-slot="reason"
        class="row-start-3 col-start-2 col-end-4 flex min-w-0 font-body text-size-meta font-normal leading-(--line-reason) text-ink-subtle group-data-phone/row:text-size-label group-data-phone/row:leading-(--line-meta)"
        aria-hidden="true"
        data-box
      >
        <span class="truncate"
          ><span class="pe-(--arrow-pad)">↳</span>
          {row.reason.source}
          “{#each row.reason.parts as part, i (i)}{#if part.matched}<mark
                class="bg-transparent text-ink-strong font-medium"
                >{part.text}</mark
              >{:else}{part.text}{/if}{/each}”</span
        >
      </span>
    {/if}
  </button>
  {#if peekable}
    <button
      class="group/disclose absolute inset-y-0 end-0 grid place-items-center w-(--hit) min-h-0 p-0 border-0 rounded-sm bg-transparent text-ink-muted active:bg-surface-fill"
      aria-controls={`${id}-peek`}
      aria-expanded={peeked}
      aria-label={peeked ? "Fold" : "Peek"}
      onclick={(event) => {
        event.stopPropagation();
        onpeek?.();
      }}
      type="button"
    >
      <ChevronDown
        class="size-icon-md motion-safe:transition-[rotate] motion-safe:dur-toggle motion-safe:ease-in-out group-aria-expanded/disclose:rotate-180"
      />
    </button>
  {/if}
</div>

<style>
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-breathes] {
      animation: find-breathe var(--breath) var(--ease-in-out) infinite
        alternate;
    }
  }
  @keyframes find-breathe {
    to {
      opacity: 0.45;
    }
  }
</style>
