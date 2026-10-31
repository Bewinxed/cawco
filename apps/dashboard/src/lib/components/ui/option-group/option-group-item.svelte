<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
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
   * group. In a `tiles` group it is a tile (`tile`): its words, or a
   * picture on a square. A click runs the option's own `onclick` first; one that prevents
   * the default (an "Other" that opens its field instead) is not a pick.
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
    group.layout === "list" &&
      "items-box-start grid min-w-0 grid-cols-auto-fluid",
    group.layout === "tiles" &&
      (tile === "picture"
        ? "size-c-pose-tile min-h-0 place-items-center justify-center rounded-lg p-space-1"
        : "h-full min-w-0 flex-col items-start justify-start gap-0 rounded-md px-space-3 py-space-2 disabled:border-dashed disabled:bg-transparent disabled:text-ink-muted"),
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
  {@render children?.()}
</button>
