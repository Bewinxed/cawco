<!--
  A block's slideshow (tsk-330): its children one at a time on the kit's
  carousel (components/ui/carousel, Embla), the reply's measure wide, each
  child a slide the slideshow's whole width. Under it its arrows, its count
  ("2 of 4") and its caption; a finger swipes it, and the arrow keys step
  it while focus is in it. Its slides stand in the kit's well, every one
  as tall as the tallest, so nothing under it moves as it steps.

  Replaced, it stands at its first slide with its count, no carousel
  running: its block is frozen to plain markup.
-->
<script lang="ts">
  import { transcriptWords } from "@cawco/core/words/transcript";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Carousel from "#lib/components/ui/carousel/index.js";
  import { IconChevronLeft, IconChevronRight } from "#lib/icons.js";
  import { blockMediaHere } from "./block-media";
  import { MEASURE_ROOM } from "./block-size";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; caption?: unknown }> = $props();

  const media = blockMediaHere();
  const slides = $derived(Array.isArray(props.children) ? props.children : []);
  const caption = $derived(props.caption ? String(props.caption) : "");

  let api = $state<Carousel.CarouselAPI>();
  let at = $state(0);
  let canBack = $state(false);
  let canOn = $state(false);
  $effect(() => {
    const carousel = api;
    if (!carousel) {
      return;
    }
    const read = () => {
      at = carousel.selectedScrollSnap();
      canBack = carousel.canScrollPrev();
      canOn = carousel.canScrollNext();
    };
    read();
    carousel.on("select", read).on("reInit", read);
    return () => {
      carousel.off("select", read).off("reInit", read);
    };
  });

  function stepped(event: KeyboardEvent) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      api?.scrollPrev();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      api?.scrollNext();
    }
  }
</script>

{#snippet foot(count: number)}
  <figcaption
    class="mt-space-2 flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1"
  >
    <span class="flex flex-none items-center gap-space-1">
      <Button
        aria-label={transcriptWords.blockSlidePrevious}
        disabled={media.still || !canBack}
        icon={IconChevronLeft}
        onclick={() => api?.scrollPrev()}
        size="sm"
        variant="ghost"
      />
      <span aria-live="polite" class="type-label text-ink-muted num">
        {transcriptWords.blockSlideCount(at + 1, count)}
      </span>
      <Button
        aria-label={transcriptWords.blockSlideNext}
        disabled={media.still || !canOn}
        icon={IconChevronRight}
        onclick={() => api?.scrollNext()}
        size="sm"
        variant="ghost"
      />
    </span>
    {#if caption}
      <span class="min-w-0 type-meta text-ink-muted wrap-anywhere"
        >{caption}</span
      >
    {/if}
  </figcaption>
{/snippet}

<!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: the arrow keys step the slideshow while focus is in it, as the APG carousel pattern asks. -->
<figure
  class={["m-0 min-w-0", MEASURE_ROOM]}
  data-slot="block-slides"
  onkeydown={stepped}
>
  <!-- Its slides stand in the kit's well, so a slide reads as one, and the
       tallest one's room is the well's. -->
  <div
    class="min-w-0 overflow-clip rounded-md border border-border-well bg-surface-well"
    data-slot="slides-well"
  >
    {#if media.still}
      <div class="min-w-0 p-space-4">{@render renderNode(slides[0])}</div>
    {:else}
      <Carousel.Root
        aria-label={transcriptWords.blockSlides(slides.length)}
        setApi={(set) => {
          api = set;
        }}
      >
        <Carousel.Content>
          {#each slides as slide, index (index)}
            <Carousel.Item
              aria-label={transcriptWords.blockSlideCount(
                index + 1,
                slides.length
              )}
            >
              <div class="min-w-0 p-space-4">
                {@render renderNode(slide)}
              </div>
            </Carousel.Item>
          {/each}
        </Carousel.Content>
      </Carousel.Root>
    {/if}
  </div>
  {@render foot(slides.length)}
</figure>
