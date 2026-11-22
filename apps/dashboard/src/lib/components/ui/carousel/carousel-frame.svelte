<script lang="ts">
  /**
   * The kit's Carousel in a frame of its own (its states file's): its
   * slides in a well, as a reply's slides block composes it.
   */
  import * as Carousel from "./index.js";

  let {
    slides,
  }: {
    /** Each slide's words. */
    slides: string[];
  } = $props();
</script>

<div class="w-sm max-w-full rounded-lg bg-surface-recess">
  <Carousel.Root aria-label={`${slides.length} slides`}>
    <Carousel.Content>
      {#each slides as slide, index (slide)}
        <Carousel.Item aria-label={`Slide ${index + 1} of ${slides.length}`}>
          <p class="min-w-0 p-space-4 type-body">{slide}</p>
        </Carousel.Item>
      {/each}
    </Carousel.Content>
  </Carousel.Root>
</div>
