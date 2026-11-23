<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  /**
   * The three surfaces on the ladder. A panel stands in the page's flow and
   * rises one step; a float (a popover's or a menu's card) and a dialog open
   * over what they come from and rise two.
   */
  const elevatedVariants = tv({
    base: "surface relative border",
    variants: {
      look: {
        panel: "rounded-lg border-border-hairline p-space-4",
        float: "rounded-lg border-border-control p-space-2",
        dialog: "rounded-xl border-border-control p-space-4",
      },
    },
    defaultVariants: { look: "float" },
  });

  type ElevatedLooks = VariantProps<typeof elevatedVariants>;
</script>

<script lang="ts">
  /**
   * A surface on the ladder (theme.css `surface`): its ground and shadow
   * stand above the surface it opens in, and whatever opens inside it rises
   * from it in turn.
   */
  import { type Snippet, untrack } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";
  import { rise } from "./surface-level.svelte.js";

  let {
    look = "float",
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> &
    ElevatedLooks & { children: Snippet } = $props();

  // A surface takes its place on the ladder once, as it opens.
  const level = rise(untrack(() => (look === "panel" ? "panel" : "float")));
</script>

<div
  data-slot="elevated"
  data-level={level}
  class={cn(elevatedVariants({ look }), className)}
  style:--surface-level={level}
  {...rest}
>
  {@render children()}
</div>
