<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const inputGroupButtonVariants = tv({
    base: "flex items-center gap-space-2 rounded-sm text-label shadow-none",
    variants: {
      size: {
        xs: "h-c-btn-h-xs gap-space-1 px-space-2 [&>svg:not([class*='size-'])]:size-icon-sm",
        sm: "",
        "icon-xs": "size-c-btn-h-xs p-0 has-[>svg]:p-0",
        "icon-sm": "size-space-8 p-0 has-[>svg]:p-0",
      },
      /**
       * Its face: the surface's own font and ink (`surface`), as every
       * button on a surface that sets them takes them (the new-session
       * dialog, `.ns-theme`), over the kit's label type and strong ink. Its
       * transition is the kit Button's press (`press: scale`): the control
       * colours on --dur-control and the press's scale on --dur-toggle.
       */
      face: {
        surface: "font-inherit text-inherit",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  });

  export type InputGroupButtonLooks = VariantProps<
    typeof inputGroupButtonVariants
  >;
  export type InputGroupButtonSize = InputGroupButtonLooks["size"];
</script>

<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    type = "button",
    variant = "ghost",
    size = "xs",
    face,
    ...restProps
  }: Omit<ComponentProps<typeof Button>, "href" | "size" | "face"> & {
    size?: InputGroupButtonSize;
    face?: InputGroupButtonLooks["face"];
  } = $props();
</script>

<Button
  class={cn(inputGroupButtonVariants({ size, face }), className)}
  data-size={size}
  {type}
  {variant}
  bind:ref
  {...restProps}
>
  {@render children?.()}
</Button>
