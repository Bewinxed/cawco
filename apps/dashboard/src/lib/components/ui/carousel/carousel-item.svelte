<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { getEmblaContext } from "./context.js";

  /** One slide: the carousel's whole width, its gutter on its leading side. */
  let { children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();

  const emblaCtx = getEmblaContext("<Carousel.Item/>");
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: fieldset would add unwanted default border/legend semantics to a carousel slide -->
<div
  aria-roledescription="slide"
  class={[
    "min-w-0 shrink-0 grow-0 basis-full",
    emblaCtx.orientation === "horizontal" ? "ps-space-4" : "pt-space-4",
  ]}
  data-embla-slide=""
  data-slot="carousel-item"
  role="group"
  {...restProps}
>
  {@render children?.()}
</div>
