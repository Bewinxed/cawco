<script lang="ts" module>
  /**
   * A list's chosen row brought into view and focused as its popover opens
   * (the popover's `onOpenAutoFocus`): the kit's popover focuses its first
   * row, and on a phone the chosen length (Pop, 260 ms) stood scrolled out
   * of its list.
   */
  export const toChosen =
    (list: () => HTMLElement | undefined) => (event: Event) => {
      event.preventDefault();
      requestAnimationFrame(() => {
        const chosen =
          list()?.querySelector<HTMLElement>('[aria-selected="true"]') ??
          list()?.querySelector<HTMLElement>('[role="option"]');
        if (chosen) {
          bringIntoView(chosen);
        }
        chosen?.focus({ preventScroll: true });
      });
    };
</script>

<script lang="ts">
  /**
   * The face's one list of choices, in a popover under its trigger: the
   * moves under the title, a clip's lengths and its curves. Each row its
   * name, a figure or a curve's glyph where it has one, and the chosen
   * row's tick in its own column, under the kit's highlight pill
   * (DESIGN.md, Menu item: "a chosen item shows its tick"). The Moves menu
   * marked its pick with a dot and the Curve list with a tick; long names
   * wrap whole, their row growing round them.
   */
  import { bringIntoView } from "@cawco/core/bring-into-view";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { IconCheck } from "#lib/icons.js";

  let {
    label,
    options,
    value,
    onpick,
    ref = $bindable(),
  }: {
    /** The list's name for a reader. */
    label: string;
    options: {
      value: string;
      name: string;
      /** A figure after the name ("260 ms"). */
      meta?: string;
      /** A curve's glyph, an SVG path in a 24-unit box; null keeps its column empty. */
      glyph?: string | null;
    }[];
    value: string | null;
    onpick: (value: string) => void;
    ref?: HTMLElement;
  } = $props();
  const glyphs = $derived(options.some((one) => one.glyph !== undefined));
</script>

<div
  bind:this={ref}
  aria-label={label}
  class="flex flex-col"
  role="listbox"
  {@attach highlight({
    rows: '[data-slot="item"]',
    selected: '[aria-selected="true"]',
  })}
>
  {#each options as one (one.value)}
    <button
      aria-selected={one.value === value}
      class={menuItemVariants({
        class:
          "flex w-full items-center gap-space-2 px-space-3 py-space-1 text-start type-label text-ink-strong select-none focus-inset",
      })}
      data-menu-item
      data-slot="item"
      onclick={() => onpick(one.value)}
      role="option"
      type="button"
    >
      {#if glyphs}
        <span
          class="grid size-icon-md flex-none place-items-center text-ink-muted"
          data-box
        >
          {#if one.glyph}
            <svg
              aria-hidden="true"
              class="size-icon-md"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-width="1.5"
              viewBox="0 0 24 24"
            >
              <path d={one.glyph} />
            </svg>
          {/if}
        </span>
      {/if}
      <span class="min-w-0 flex-1 text-pretty">{one.name}</span>
      {#if one.meta}
        <span class="type-meta whitespace-nowrap text-ink-muted num"
          >{one.meta}</span
        >
      {/if}
      <span class="grid size-icon-md flex-none place-items-center" data-box>
        {#if one.value === value}
          <IconCheck class="size-icon-md" />
        {/if}
      </span>
    </button>
  {/each}
</div>
