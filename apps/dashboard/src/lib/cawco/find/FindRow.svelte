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

<div class={["slot", { phone }]} data-flip data-key={row.key} role="none">
  <button
    {id}
    class={["row", { phone, "has-reason": row.reason !== null }]}
    aria-describedby={peeked ? `${id}-peek` : undefined}
    aria-label={row.spoken}
    aria-selected={active}
    data-active={active ? "" : undefined}
    data-find-row
    onclick={onpick}
    onpointermove={onhover}
    role="option"
    tabindex="-1"
    type="button"
  >
    <span
      class={["glyph", { breathes: row.breathes }]}
      data-tone={row.state.tone}
      aria-hidden="true"
    >
      <row.glyph />
    </span>
    <span class="title"><span class="clip">{row.title}</span></span>
    {#if ago}
      <span class="age num" aria-hidden="true">{ago}</span>
    {/if}
    <span class="meta" aria-hidden="true">
      <span class="state" data-tone={row.state.tone}>{row.state.word}</span>
      {#each row.meta as word (word)}
        <span class="dot">·</span>{word}
      {/each}
    </span>
    {#if row.reason}
      <span class="reason" aria-hidden="true">
        <span class="clip"
          ><span class="arrow">↳</span>
          {row.reason.source}
          “{#each row.reason.parts as part, i (i)}{#if part.matched}<mark
                >{part.text}</mark
              >{:else}{part.text}{/if}{/each}”</span
        >
      </span>
    {/if}
  </button>
  {#if peekable}
    <button
      class={["disclose", { open: peeked }]}
      aria-controls={`${id}-peek`}
      aria-expanded={peeked}
      aria-label={peeked ? "Fold" : "Peek"}
      onclick={(event) => {
        event.stopPropagation();
        onpeek?.();
      }}
      type="button"
    >
      <ChevronDown />
    </button>
  {/if}
</div>

<style>
  .slot {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: none;
  }
  .row {
    --line-1: 20px;
    --line-meta: 16px;
    --line-reason: 18px;
    position: relative;
    display: grid;
    inline-size: 100%;
    border: 0;
    background: none;
    font: inherit;
    text-align: start;
    color: inherit;
    grid-template-columns: var(--icon-md) minmax(0, 1fr) auto;
    grid-template-rows: var(--line-1) auto;
    column-gap: var(--space-2);
    align-items: center;
    box-sizing: border-box;
    min-block-size: calc(var(--line-1) + var(--line-meta) + 16px);
    padding: 8px var(--space-3);
    border-radius: var(--radius-sm);
    cursor: default;
    outline: none;
    user-select: none;

    &:active {
      background: var(--surface-fill);
    }
  }

  .glyph {
    display: grid;
    place-items: center;
    grid-row: 1;
    grid-column: 1;
    inline-size: var(--icon-md);
    block-size: var(--line-1);
    color: var(--status-idle-glyph);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &[data-tone="live"] {
      color: var(--status-live-glyph);
    }
    &[data-tone="attn"] {
      color: var(--status-attn-glyph);
    }
    &[data-tone="fail"] {
      color: var(--status-fail-glyph);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .breathes {
      animation: find-breathe var(--breath) var(--ease-in-out) infinite
        alternate;
    }
  }
  @keyframes find-breathe {
    to {
      opacity: 0.45;
    }
  }

  .title {
    grid-row: 1;
    grid-column: 2;
    display: flex;
    min-inline-size: 0;
    font: var(--type-label);
    line-height: var(--line-1);
    color: var(--ink-row);
  }
  .clip {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .age {
    grid-row: 1;
    grid-column: 3;
    font: var(--type-meta);
    line-height: var(--line-1);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }

  .meta {
    grid-row: 2;
    grid-column: 2 / 4;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font: var(--type-meta);
    line-height: var(--line-meta);
    color: var(--ink-muted);
  }
  .state {
    font-weight: var(--weight-strong);
    color: var(--ink-muted);

    &[data-tone="live"] {
      color: var(--status-live-ink);
    }
    &[data-tone="attn"] {
      color: var(--status-attn-ink);
    }
    &[data-tone="fail"] {
      color: var(--status-fail-ink);
    }
  }
  .dot {
    padding-inline: 0.35em;
  }

  .reason {
    grid-row: 3;
    grid-column: 2 / 4;
    display: flex;
    min-inline-size: 0;
    font: var(--type-meta);
    line-height: var(--line-reason);
    color: var(--ink-subtle);

    & mark {
      background: none;
      color: var(--ink-strong);
      font-weight: var(--weight-strong);
    }
  }
  .arrow {
    padding-inline-end: 0.25em;
  }

  /* A phone: 16px titles that wrap whole, 13px meta, a ⌄ at the end. */
  .phone {
    --line-1: 20px;
    --line-meta: 20px;
    min-block-size: 56px;

    & .title {
      font: var(--type-body);
      font-size: 16px;
      line-height: var(--line-1);
      font-weight: var(--weight-strong);
    }
    & .title .clip {
      white-space: normal;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }
    & .glyph {
      align-self: start;
    }
    & .age {
      align-self: start;
    }
    & .meta,
    & .reason {
      grid-column: 2 / 4;
      font: var(--type-label);
      font-weight: 400;
      line-height: var(--line-meta);
    }
    & .state {
      font-weight: var(--weight-strong);
    }
  }

  .slot:has(.disclose) .row {
    padding-inline-end: 44px;
  }

  /* The ⌄: the row's trailing 44px, its whole height, beside the option. */
  .disclose {
    position: absolute;
    inset-block: 0;
    inset-inline-end: 0;
    display: grid;
    place-items: center;
    inline-size: 44px;
    min-block-size: 0;
    border: 0;
    padding: 0;
    background: none;
    color: var(--ink-muted);
    border-radius: var(--radius-sm);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .disclose :global(svg) {
      transition: rotate var(--dur-toggle) var(--ease-in-out);
    }
  }
  .disclose.open :global(svg) {
    rotate: 180deg;
  }
</style>
