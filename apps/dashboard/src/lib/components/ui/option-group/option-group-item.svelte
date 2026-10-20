<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { useOptionGroup } from "./state.svelte.js";

  /**
   * One option of an OptionGroup: a `radio` (one pick) or a `checkbox`
   * (several), drawn as the kit's option chip (ui/chip `option`), with a
   * finger's 44px area (`touch-hit`) and its ring on its own border box
   * (`focus-inset`), so a clipping scroller round the group never cuts it.
   * In a `list` group it is a full-width row whose keycap stands on the
   * label's first line.
   *
   * `digit` is the keycap it wears, which picks it while focus is in its
   * group. A click runs the option's own `onclick` first; one that prevents
   * the default (an "Other" that opens its field instead) is not a pick.
   */
  let {
    ref = $bindable(null),
    value,
    digit,
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
  } = $props();

  const group = useOptionGroup();
  $effect(() => group.register(value));
  const chosen = $derived(group.chosen(value));
</script>

<!-- biome-ignore lint/a11y/useAriaPropsSupportedByRole: its role is radio or checkbox, set from the group, and both take aria-checked. -->
<button
  class={cn(
    chipVariants({ variant: "option" }),
    "touch-hit focus-inset",
    group.layout === "list" &&
      "items-box-start grid min-w-0 grid-cols-auto-fluid",
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
