<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconTick } from "#lib/icons.js";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { useOptionGroup } from "./state.svelte.js";

  /**
   * One option of an OptionGroup: a `radio` (one pick) or a `checkbox`
   * (several), drawn as the kit's option chip (ui/chip `option`, which
   * carries a finger's 44px area), with its ring on its own border box
   * (`focus-inset`), so a clipping scroller round the group never cuts it.
   * In a `list` group it is a full-width row whose keycap stands on the
   * label's first line.
   *
   * `digit` is the keycap it wears, which picks it while focus is in its
   * group. In a `tiles` group it is a tile (`tile`): its words, on the
   * chip's own radius (one radius for every form of the option: chip, row
   * and tile), or a picture on a square. A click runs the option's own `onclick` first; one that prevents
   * the default (an "Other" that opens its field instead) is not a pick.
   *
   * In a `chips` or `list` group it leads with the mark of its kind, so the
   * set reads as a choice before anything is picked (fuck-dropdowns' peer
   * options, "a mark each"; HIG, Toggles: radio buttons and checkboxes): a
   * circle for one pick, a square for several, empty at rest, filled in
   * coral when chosen, with a dot or a tick on it. A tile is its own mark.
   */
  let {
    ref = $bindable(null),
    value,
    digit,
    tile = "words",
    disabled = false,
    class: className,
    onclick,
    onfocus,
    children,
    ...restProps
  }: WithElementRef<
    Omit<HTMLButtonAttributes, "value" | "type" | "role">,
    HTMLButtonElement
  > & {
    value: string;
    digit?: number;
    /** In a `tiles` group: its name over its note, or a picture filling a square tile. */
    tile?: "words" | "picture";
  } = $props();

  const group = useOptionGroup();
  $effect(() => group.register(value));
  const chosen = $derived(group.chosen(value));
</script>

<!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: its role is radio or checkbox, set from the group, and both take aria-checked. -->
<button
  class={cn(
    "select-none",
    chipVariants({ variant: "option" }),
    "focus-inset",
    // Gliding, the group's pill is the pick (look "card": the picked edge
    // over the recess); the option stands over it, clear while chosen.
    group.glide && "relative z-2 control-glide",
    group.layout === "list" &&
      "grid min-w-0 grid-cols-auto-fluid content-center items-box-start",
    group.layout === "tiles" &&
      (tile === "picture"
        ? "size-16 min-h-0 place-items-center justify-center rounded-lg p-space-1"
        : "row-span-2 grid h-full min-w-0 grid-rows-subgrid items-box-start justify-items-start gap-y-space-1 control-dashed-off mark-py-space-2 text-start disabled:bg-transparent disabled:text-tx-2"),
    className
  )}
  aria-checked={chosen}
  aria-keyshortcuts={digit === undefined ? undefined : String(digit)}
  data-digit={digit}
  data-slot="option"
  disabled={disabled || group.disabled}
  onclick={(event) => {
    onclick?.(event);
    if (!event.defaultPrevented) {
      group.pick(value);
    }
  }}
  onfocus={(event) => {
    onfocus?.(event);
    group.active = value;
  }}
  role={group.multiple ? "checkbox" : "radio"}
  tabindex={group.stop === value ? 0 : -1}
  type="button"
  bind:this={ref}
  {...restProps}
>
  {#if group.layout !== "tiles"}
    <!-- The chip's mark (a mark box's `mark-icon`): centred on the label's
         first line however many lines the option runs to. -->
    <span
      aria-hidden="true"
      class={[
        "mark-icon grid size-icon-md place-items-center transition-[border-color,border-width,background-color] duration-(--duration-fast) ease-out",
        group.multiple ? "rounded-xs" : "rounded-pill",
        !chosen && "border border-ui-3 bg-bg",
        chosen &&
          (group.multiple
            ? "border border-accent bg-accent text-on-accent"
            : "radio-on"),
      ]}
      data-slot="option-mark"
    >
      {#if chosen && group.multiple}
        <IconTick class="size-icon-sm" />
      {/if}
    </span>
  {/if}
  {@render children?.()}
</button>
