<script lang="ts" module>
  const NONE: ReadonlySet<string> = new Set();

  /** The hidden secret a press landed on, by key; null for anywhere else. */
  export const hiddenAt = (event: MouseEvent): string | null =>
    event.target instanceof Element
      ? (event.target
          .closest("[data-secret]:not([data-shown])")
          ?.getAttribute("data-secret") ?? null)
      : null;
</script>

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
  import { IconChevronDown as ChevronDown } from "#lib/icons.js";
  import { age, type Row } from "./find-rows";
  import Said from "./Said.svelte";

  let {
    row,
    id,
    now,
    active = false,
    phone = false,
    peekable = false,
    peeked = false,
    shown = NONE,
    onpick,
    onpeek,
    onhover,
    onsecret,
  }: {
    row: Row;
    id: string;
    now: number;
    active?: boolean;
    phone?: boolean;
    /** A ⌄ that unfolds the peek (a phone's touch target; the desk peeks with →). */
    peekable?: boolean;
    peeked?: boolean;
    /** The secrets the person showed, by key; the rest are dots. */
    shown?: ReadonlySet<string>;
    onpick: () => void;
    onpeek?: () => void;
    onhover?: () => void;
    /** A press on a hidden secret: show it, rather than opening the row. */
    onsecret?: (key: string) => void;
  } = $props();

  const ago = $derived(age(row.at, now));
</script>

<div
  data-slot="slot"
  class="relative flex flex-col flex-none"
  data-flip
  data-key={row.key}
  data-phone={phone || undefined}
  role="none"
>
  <!-- The glyph, title and age are the mark line (DESIGN.md The Mark Line
       Rule): the glyph's cell is a box on it, and the meta and reason lines
       stand under it, boxes the recipe leaves as they are. -->
  <button
    data-slot="row"
    {id}
    class="group/row mark-line relative grid grid-cols-(--row-cols) grid-rows-(--row-rows) gap-x-space-2 items-center w-full min-h-c-find-row-h px-space-3 py-space-2 border-none border-current rounded-sm bg-transparent text-start box-border cursor-default outline-off select-none active:bg-surface-fill data-phone:min-h-c-find-row-h-phone data-phone:py-space-3 data-peekable:pe-c-btn-h-lg"
    aria-describedby={peeked ? `${id}-peek` : undefined}
    aria-label={row.spoken}
    aria-selected={active}
    data-active={active ? "" : undefined}
    data-find-row
    data-has-reason={row.reason === null ? undefined : ""}
    data-peekable={peekable || undefined}
    data-phone={phone || undefined}
    onclick={(event) => {
      const secret = hiddenAt(event);
      if (secret && onsecret) {
        onsecret(secret);
        return;
      }
      onpick();
    }}
    onpointermove={onhover}
    role="option"
    tabindex="-1"
    type="button"
    style:--row-cols="var(--icon-md) minmax(0, 1fr) auto"
    style:--row-rows="var(--icon-lg) auto"
  >
    <span
      data-slot="glyph"
      class="loops grid place-items-center row-start-1 col-start-1 w-icon-md h-icon-lg text-status-idle-glyph motion-safe:data-breathes:animate-breath tone-live:text-status-live-glyph tone-attn:text-status-attn-glyph tone-fail:text-status-fail-glyph group-data-phone/row:self-box-start"
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
      class="row-start-1 col-start-2 min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label leading-icon-lg text-ink-row group-data-phone/row:type-body group-data-phone/row:leading-icon-lg group-data-phone/row:font-medium group-data-phone/row:whitespace-normal group-data-phone/row:line-clamp-3 group-data-phone/row:line-clamp-std-3 group-data-phone/row:overflow-clip"
      >{#if row.titleParts.some((part) => part.secret)}<Said
          runs={row.titleParts}
          {shown}
        />{:else}{row.title}{/if}</span
    >
    {#if ago}
      <span
        data-slot="num"
        class="num row-start-1 col-start-3 type-meta leading-icon-lg text-ink-muted group-data-phone/row:self-box-start"
        aria-hidden="true">{ago}</span
      >
    {/if}
    <span
      data-slot="meta"
      class="row-start-2 col-start-2 col-end-4 line-clamp-2 type-meta leading-icon-md text-ink-muted group-data-phone/row:type-label group-data-phone/row:font-normal group-data-phone/row:leading-icon-md"
      aria-hidden="true"
      data-box
    >
      <span
        class="font-medium text-ink-muted tone-live:text-status-live-ink tone-attn:text-status-attn-ink tone-fail:text-status-fail-ink"
        data-tone={row.state.tone}>{row.state.word}</span
      >
      {#each row.meta as word (word)}
        <span class="px-space-1">·</span>{word}
      {/each}
    </span>
    {#if row.reason}
      <span
        data-slot="reason"
        class="row-start-3 col-start-2 col-end-4 flex min-w-0 type-meta leading-space-5 text-ink-subtle group-data-phone/row:type-label group-data-phone/row:font-normal group-data-phone/row:leading-icon-md"
        aria-hidden="true"
        data-box
      >
        <span class="truncate"
          ><span class="pe-space-1">↳</span>
          {row.reason.source}
          “<Said runs={row.reason.parts} {shown} />”</span
        >
      </span>
    {/if}
  </button>
  {#if peekable}
    <button
      class="select-none group/disclose absolute inset-y-0 end-0 grid place-items-center w-c-btn-h-lg min-h-0 p-0 border-none border-current rounded-sm bg-transparent text-ink-muted active:bg-surface-fill"
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
        class="size-icon-md motion-safe:transition-[rotate] motion-safe:duration-(--dur-toggle) motion-safe:ease-in-out group-aria-expanded/disclose:rotate-180"
      />
    </button>
  {/if}
</div>
