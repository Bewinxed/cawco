/**
 * The kit's Carousel (Component Story Format 3, live components) in a frame
 * of its own (carousel-frame): a reply's slides, the first in view. The
 * meta's args are every story's.
 */
import CarouselFrame from "./carousel-frame.svelte";

export default {
  title: "Kit/Carousel",
  component: CarouselFrame,
  args: {
    slides: [
      "1. The phone scans the hub's code.",
      "2. The hub asks the owner to approve the phone.",
      "3. The phone answers permissions from the lock screen.",
    ],
  },
};

/** The first slide in view. */
export const FirstSlide = {};
