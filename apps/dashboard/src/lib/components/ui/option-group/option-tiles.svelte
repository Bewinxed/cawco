<script lang="ts" generics="T extends string">
  /**
   * One pick among equal tiles (build spec §3.3): the house's radio group,
   * its roles and keys (arrows move, Space picks, a digit picks), each
   * option its name over its note. A disabled tile is dashed and its note
   * says why. The chosen tile wears the option chip's pick, the coral edge
   * on the recessed fill, never the focus ring.
   *
   * `cols` across, `colsPhone` under the phone line (one a row by default:
   * stacked). With `wraps`, `cols` is the most across: a row narrower than
   * `cols` tiles at the choice tile's least width
   * (`--spacing-c-choice-tile-min`) stands fewer, down to one.
   *
   * With `glide`, the pick is the kit's selection pill (OptionGroup
   * `glide`): it slides from the tile left to the one chosen.
   *
   * `glyph`, drawn for each option's id, leads its tile with a mark of what
   * picking it does, on its name's line; the note then hangs under the
   * name, so every tile's words start at one x.
   */
  import type { Snippet } from "svelte";
  import OptionGroup from "./option-group.svelte";
  import OptionGroupItem from "./option-group-item.svelte";

  let {
    value = $bindable(),
    options,
    cols,
    colsPhone = 1,
    label,
    disabled = false,
    digits = false,
    glyph,
    glide = false,
    wraps = false,
  }: {
    value: T | null;
    options: { disabled?: boolean; id: T; name: string; note?: string }[];
    /** Each option's mark, by its id: a Solar glyph at the control size, or a service's own logo. */
    glyph?: Snippet<[T]>;
    cols: number;
    colsPhone?: number;
    /** The group, as a screen reader names it. */
    label: string;
    disabled?: boolean;
    /** Each tile wears its digit, which picks it. */
    digits?: boolean;
    /** The pick slides from tile to tile (OptionGroup `glide`). */
    glide?: boolean;
    /** Fewer across where `cols` tiles would stand under the choice tile's least width. */
    wraps?: boolean;
  } = $props();

  /** The grid's tracks: `cols` equal ones, or with `wraps` as many as hold the least width, `cols` at most. */
  const tracks = $derived(
    wraps
      ? `repeat(auto-fit, minmax(min(100%, max(var(--spacing-c-choice-tile-min), calc((100% - ${cols - 1} * var(--spacing-space-2)) / ${cols}))), 1fr))`
      : `repeat(${cols}, minmax(0, 1fr))`
  );
</script>

<OptionGroup
  aria-label={label}
  bind:value={
    () => (value === null ? [] : [value]),
    (next) => {
      value = options.find((option) => option.id === next[0])?.id ?? null;
    }
  }
  {disabled}
  {glide}
  layout="tiles"
  style="--tiles-cols: {tracks}; --tiles-cols-phone: {wraps
    ? tracks
    : `repeat(${colsPhone}, minmax(0, 1fr))`}"
>
  {#each options as option, at (option.id)}
    <OptionGroupItem
      digit={digits && at < 9 ? at + 1 : undefined}
      disabled={option.disabled}
      value={option.id}
    >
      {#if glyph}
        <span
          class="mark-line grid w-full min-w-0 grid-cols-auto-fluid items-start gap-x-space-2"
        >
          <span class="mark-cell type-label" data-box
            >{@render glyph(option.id)}</span
          >
          <span class="type-label font-medium wrap-anywhere">{option.name}</span
          >
          {#if option.note}
            <span
              class="col-start-2 type-meta text-ink-muted text-pretty wrap-anywhere"
              >{option.note}</span
            >
          {/if}
        </span>
      {:else}
        <span class="type-label font-medium wrap-anywhere">{option.name}</span>
        {#if option.note}
          <span class="type-meta text-ink-muted text-pretty wrap-anywhere"
            >{option.note}</span
          >
        {/if}
      {/if}
    </OptionGroupItem>
  {/each}
</OptionGroup>
