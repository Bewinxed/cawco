<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * Its callers' looks. `ink`: its placeholder's ink, the subtle ink
   * (`subtle`), as every field on a surface that sets it shows it (the
   * new-session dialog, `.ns-theme`), over the kit Input's muted one.
   */
  export const inputGroupInputVariants = tv({
    variants: {
      ink: {
        subtle: "placeholder:text-ink-subtle",
      },
    },
  });

  export type InputGroupInputLooks = VariantProps<
    typeof inputGroupInputVariants
  >;
</script>

<script lang="ts">
  import type { ComponentProps } from "svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ink,
    ...props
  }: ComponentProps<typeof Input> & InputGroupInputLooks = $props();
</script>

<Input
  class={cn(
    "flex-1 rounded-none border-0 bg-transparent shadow-none dark:bg-transparent",
    inputGroupInputVariants({ ink }),
    className
  )}
  data-slot="input-group-control"
  bind:ref
  bind:value
  {...props}
/>
