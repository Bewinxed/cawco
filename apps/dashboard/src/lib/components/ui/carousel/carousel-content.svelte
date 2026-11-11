<script lang="ts">
  import emblaCarouselSvelte from "embla-carousel-svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { getEmblaContext } from "./context.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

  const emblaCtx = getEmblaContext("<Carousel.Content/>");
</script>

<div
  class="overflow-hidden"
  data-slot="carousel-content"
  onemblaInit={emblaCtx.onInit}
  use:emblaCarouselSvelte={{
    options: {
      container: "[data-embla-container]",
      slides: "[data-embla-slide]",
      ...emblaCtx.options,
      axis: emblaCtx.orientation === "horizontal" ? "x" : "y",
    },
    plugins: emblaCtx.plugins,
  }}
>
  <div
    class={cn(
      "flex",
      emblaCtx.orientation === "horizontal"
        ? "-ms-space-4"
        : "-mt-space-4 flex-col",
      className
    )}
    data-embla-container=""
    bind:this={ref}
    {...restProps}
  >
    {@render children?.()}
  </div>
</div>
