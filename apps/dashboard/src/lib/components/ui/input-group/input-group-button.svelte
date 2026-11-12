<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const inputGroupButtonVariants = tv({
    /* In a bar's search field (InputGroup `look="bar"`, a capsule) it stands
       at the capsule's trailing end: concentric with it on that side, a
       small radius toward the field beside it, as a glass's last item. */
    base: "flex items-center gap-space-2 not-in-data-[look=bar]:rounded-sm in-data-[look=bar]:rounded-s-xs in-data-[look=bar]:rounded-e-pill type-label shadow-none",
    variants: {
      size: {
        xs: "h-c-btn-h-xs gap-space-1 px-space-2 [&>svg:not([class*='size-'])]:size-icon-sm",
        sm: "",
        "icon-xs": "size-c-btn-h-xs p-0 has-[>svg]:p-0",
        "icon-sm": "size-space-8 p-0 has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  });

  type InputGroupButtonSize = VariantProps<
    typeof inputGroupButtonVariants
  >["size"];
</script>

<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { cn } from "#lib/utils.js";
  import { groupLook } from "./look.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    type = "button",
    variant = "ghost",
    size = "xs",
    // In a bar's search capsule it presses as the glass's controls do, with
    // the tint on its own box (a kit Button in glass), never the scale.
    press = groupLook() === "bar" ? "tint" : "scale",
    ...restProps
  }: Omit<ComponentProps<typeof Button>, "href" | "size"> & {
    size?: InputGroupButtonSize;
  } = $props();
</script>

<Button
  class={cn(inputGroupButtonVariants({ size }), className)}
  data-size={size}
  {press}
  {type}
  {variant}
  bind:ref
  {...restProps}
>
  {@render children?.()}
</Button>
