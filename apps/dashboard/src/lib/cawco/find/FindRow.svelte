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
   * wrapping rather than clipping (up to three lines, its row of the grid
   * growing with them so the meta line stands under its last), and a ⌄ at
   * the trailing end (a 44px target) that unfolds the peek in place while
   * the row body opens.
   *
   * It is an option of the finder's listbox: the field keeps the focus and
   * names this row as its active descendant.
   */
  import { IconChevronDown as ChevronDown } from "#lib/icons.js";
  import { loopInStep } from "#lib/platform/motion/in-step.svelte.js";
  import { age, type Row } from "./find-rows";
  import { said } from "./said";

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
    posinset,
    setsize,
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
    /** Its position in a list drawn only near the view, from 1, and that list's length: what a screen reader says of it. */
    posinset?: number;
    setsize?: number;
  } = $props();

  const ago = $derived(row.clock ?? age(row.at, now));
  /** The title's runs: its own, drawn as said only when one is a secret; otherwise its words, plain. */
  const titleRuns = $derived(
    row.titleParts.some((part) => part.secret)
      ? row.titleParts
      : [{ matched: false, text: row.title }]
  );
</script>

<div
  data-slot="slot"
  class="relative flex flex-none flex-col"
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
    class="group/row relative box-border grid min-h-13 w-full cursor-default grid-cols-(--row-cols) grid-rows-(--row-rows) items-center gap-x-space-2 rounded-sm border-none border-current bg-transparent px-space-3 mark-line py-space-2 text-start outline-off select-none active:bg-ui data-peekable:pe-control-lg data-phone:min-h-14 data-phone:py-space-3"
    aria-describedby={peeked ? `${id}-peek` : undefined}
    aria-label={row.spoken}
    aria-posinset={posinset}
    aria-selected={active}
    aria-setsize={setsize}
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
    style="--row-cols: var(--spacing-icon-md) minmax(0, 1fr) auto; --row-rows: minmax(var(--spacing-icon-lg), auto) auto"
  >
    <span
      data-slot="glyph"
      class="col-start-1 row-start-1 grid h-icon-lg w-icon-md place-items-center text-tx-2 loops group-data-phone/row:self-box-start data-breathes:breathe tone-attn:text-orange tone-fail:text-red tone-live:text-cyan"
      data-breathes={row.breathes ? "" : undefined}
      {@attach loopInStep}
      data-tone={row.state.tone}
      aria-hidden="true"
      data-box
    >
      <row.glyph class="size-icon-md" />
    </span>
    <!-- Its words trimmed to their x-height on the mark line, so the box clips
         (Gecko does not trim a scroll container). On a phone it wraps under
         a line clamp, a -webkit-box the trim does not reach: it is a box
         there (`data-box`), its lines whole and unpadded, and its row of the
         grid grows with them. -->
    <span
      data-slot="title"
      data-box={phone || undefined}
      class="col-start-2 row-start-1 min-w-0 overflow-clip leading-icon-lg text-ellipsis whitespace-nowrap text-tx type-label group-data-phone/row:line-clamp-3 group-data-phone/row:overflow-clip group-data-phone/row:leading-icon-lg group-data-phone/row:font-medium group-data-phone/row:whitespace-normal group-data-phone/row:type-body group-data-phone/row:line-clamp-std-3"
      {@attach said(titleRuns, shown)}
    ></span>
    {#if ago}
      <span
        data-slot="num"
        class="col-start-3 row-start-1 leading-icon-lg text-tx-2 type-meta num group-data-phone/row:self-box-start"
        aria-hidden="true">{ago}</span
      >
    {/if}
    {#if row.state.word || row.meta.length > 0}
      <span
        data-slot="meta"
        class="col-start-2 col-end-4 row-start-2 line-clamp-2 leading-icon-md text-tx-2 type-meta group-data-phone/row:leading-icon-md group-data-phone/row:font-normal group-data-phone/row:type-label"
        aria-hidden="true"
        data-box
      >
        <span
          class="font-medium text-tx-2 tone-attn:text-orange tone-fail:text-red tone-live:text-cyan"
          data-tone={row.state.tone}>{row.state.word}</span
        >
        {#each row.meta as word (word)}
          <span class="px-space-1">·</span>{word}
        {/each}
      </span>
    {/if}
    {#if row.reason}
      <!-- One box, its words clipped in it: a grid item is a block, so it
           ellipsizes (and on a phone clamps) its own line, as wide as its
           column. -->
      <span
        data-slot="reason"
        class="col-start-2 col-end-4 row-start-3 min-w-0 overflow-clip leading-space-4 text-ellipsis whitespace-nowrap text-tx-2 type-meta group-data-phone/row:line-clamp-2 group-data-phone/row:overflow-clip group-data-phone/row:leading-icon-md group-data-phone/row:font-normal group-data-phone/row:whitespace-normal group-data-phone/row:type-label group-data-phone/row:line-clamp-std-2"
        aria-hidden="true"
        data-box
        {@attach said(row.reason.parts, shown, {
          before: ` ${row.reason.source} “`,
          after: "”",
        })}><span class="pe-space-1">↳</span></span
      >
    {/if}
  </button>
  {#if peekable}
    <button
      class="group/disclose absolute inset-y-0 end-0 grid min-h-0 w-control-lg place-items-center rounded-sm border-none border-current bg-transparent p-0 text-tx-2 select-none active:bg-ui"
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
        class="size-icon-md group-aria-expanded/disclose:rotate-180 motion-safe:transition-[rotate] motion-safe:duration-(--duration-base) motion-safe:ease-in-out"
      />
    </button>
  {/if}
</div>
