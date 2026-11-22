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

  /** What Embla reports; the props are read through the context's getters, so a prop set on the live carousel reaches its content. */
  const embla = $state<
    Pick<
      EmblaContext,
      | "api"
      | "canScrollNext"
      | "canScrollPrev"
      | "scrollSnaps"
      | "selectedIndex"
    >
  >({
    api: undefined,
    canScrollNext: false,
    canScrollPrev: false,
    scrollSnaps: [],
    selectedIndex: 0,
  });

  const carouselState: EmblaContext = setEmblaContext({
    get api() {
      return embla.api;
    },
    get canScrollNext() {
      return embla.canScrollNext;
    },
    get canScrollPrev() {
      return embla.canScrollPrev;
    },
    get scrollSnaps() {
      return embla.scrollSnaps;
    },
    get selectedIndex() {
      return embla.selectedIndex;
    },
    get orientation() {
      return orientation;
    },
    get options() {
      return opts;
    },
    get plugins() {
      return plugins;
    },
    scrollPrev,
    scrollNext,
    scrollTo,
    handleKeyDown,
    onInit,
  });

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
    embla.selectedIndex = carouselState.api.selectedScrollSnap();
    embla.canScrollNext = carouselState.api.canScrollNext();
    embla.canScrollPrev = carouselState.api.canScrollPrev();
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
    embla.api = event.detail;
    setApi(event.detail);

    embla.scrollSnaps = event.detail.scrollSnapList();
    event.detail.on("select", onSelect);
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
