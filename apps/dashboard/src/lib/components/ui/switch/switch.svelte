<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: set a hairline down, on its label's first line. */
  const switchVariants = tv({
    variants: { align: { "first-line": "mt-px" } },
  });

  type SwitchLooks = VariantProps<typeof switchVariants>;
</script>

<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    checked = $bindable(false),
    size = "default",
    align,
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> &
    SwitchLooks & {
      size?: "sm" | "default";
    } = $props();
</script>

<SwitchPrimitive.Root
  class={cn(
    "peer group/switch relative inline-flex shrink-0 items-center",
    "rounded-pill border border-transparent focus-halo",
    /* Its track's colour turns over --duration-base, and it takes the press
       every compact control takes (DESIGN.md, The Press Rule) where motion
       is welcome. Its hit area (`hitbox`) is `pointer-area`'s 24px on a pointer device
       and `touch-area`'s 44px on a touch screen; the drawn track and the
       layout do not change. */
    "hitbox pointer-coarse:hitbox:touch-area pointer-fine:hitbox:pointer-area",
    "[transition:background-color_var(--duration-base)_var(--ease-out),transform_var(--duration-base)_var(--ease-out)]",
    "motion-safe:active:not-data-[disabled]:[transform:scale(var(--press-scale))]",
    "aria-invalid:border-danger",
    "data-[size=default]:h-[calc(var(--spacing-icon-md)+2px)] data-[size=sm]:h-[calc(var(--spacing-icon-sm)+2px)]",
    "data-[size=default]:w-[calc(2*var(--spacing-icon-md))] data-[size=sm]:w-[calc(2*var(--spacing-icon-sm))]",
    "data-disabled:cursor-not-allowed data-checked:bg-accent",
    "data-unchecked:bg-tx-2 data-disabled:opacity-50",
    "dark:aria-invalid:border-danger",
    switchVariants({ align }),
    className
  )}
  data-size={size}
  data-slot="switch"
  bind:checked
  bind:ref
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-switch-block
    class="rounded-pill bg-bg group-data-[size=default]/switch:size-icon-md group-data-[size=sm]/switch:size-icon-sm group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-on-accent group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-tx motion-safe:[transition:translate_var(--duration-base)_var(--ease-in-out)] pointer-events-none block ring-0 rtl:data-[state=checked]:not-group-data-[size=default]/switch:not-group-data-[size=sm]/switch:translate-x-[calc(-100%)]"
    data-slot="switch-thumb"
  />
</SwitchPrimitive.Root>
