<script lang="ts">
  import { cn, type WithElementRef } from "#lib/utils.js";
  import {
    type CarouselAPI,
    type CarouselProps,
    type EmblaContext,
    setEmblaContext,
  } from "./context.js";

  let {
    ref = $bindable(null),
    opts = {},
    plugins = [],
    setApi = () => {
      // no-op default: caller didn't provide a setApi callback
    },
    orientation = "horizontal",
    class: className,
    children,
    ...restProps
  }: WithElementRef<CarouselProps> = $props();

  // svelte-ignore state_referenced_locally
  let carouselState = $state<EmblaContext>({
    api: undefined,
    scrollPrev,
    scrollNext,
    orientation,
    canScrollNext: false,
    canScrollPrev: false,
    handleKeyDown,
    options: opts,
    plugins,
    onInit,
    scrollSnaps: [],
    selectedIndex: 0,
    scrollTo,
  });

  setEmblaContext(carouselState);

  function scrollPrev() {
    carouselState.api?.scrollPrev();
  }

  function scrollNext() {
    carouselState.api?.scrollNext();
  }

  function scrollTo(index: number, jump?: boolean) {
    carouselState.api?.scrollTo(index, jump);
  }

  function onSelect() {
    if (!carouselState.api) {
      return;
    }
    carouselState.selectedIndex = carouselState.api.selectedScrollSnap();
    carouselState.canScrollNext = carouselState.api.canScrollNext();
    carouselState.canScrollPrev = carouselState.api.canScrollPrev();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollPrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollNext();
    }
  }

  function onInit(event: CustomEvent<CarouselAPI>) {
    carouselState.api = event.detail;
    setApi(carouselState.api);

    carouselState.scrollSnaps = carouselState.api.scrollSnapList();
    carouselState.api.on("select", onSelect);
    onSelect();
  }

  $effect(() => () => {
    carouselState.api?.off("select", onSelect);
  });
</script>

<!-- biome-ignore lint/a11y/useSemanticElements: ref and restProps are typed against HTMLDivElement across this component's public API; swapping to <section> would be a type-breaking change -->
<div
  aria-roledescription="carousel"
  class={cn("relative", className)}
  data-slot="carousel"
  role="region"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
