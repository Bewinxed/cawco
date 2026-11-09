/**
 * The house's picture viewer: PhotoSwipe (https://photoswipe.com) on the
 * house's glyphs, clock and chrome (`cawco-pswp`, lightbox/photoswipe.css),
 * one setup for every page that opens a picture large: the dashboard's
 * Lightbox and a decision page's Image (decisions/host/Image.svelte).
 * PhotoSwipe loads the first time a picture is opened; its own sheet comes
 * with the page that opens it (Lightbox imports it, the decision host's
 * sheet carries it).
 */
import type PhotoSwipe from "photoswipe";
import type { PhotoSwipeOptions } from "photoswipe";
import { type Component, mount, unmount } from "svelte";
import {
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconZoomIn,
} from "#lib/icons.js";
import { dur, ease, motionOk } from "#lib/platform/motion/curves.svelte.js";

/** A glyph component's markup, for PhotoSwipe's `…SVG` button options. */
function markup(glyph: Component): string {
  const host = document.createElement("div");
  const drawn = mount(glyph, { target: host });
  const html = host.innerHTML;
  unmount(drawn);
  return html;
}

/**
 * PhotoSwipe, loaded: a maker of a viewer on the house's look, `options`
 * over it. The viewer is made, not opened: its caller hears its events,
 * then calls `init()`.
 */
export async function loadPhotoSwipe(): Promise<
  (options: PhotoSwipeOptions) => PhotoSwipe
> {
  const { default: PhotoSwipeCore } = await import("photoswipe");
  return (options) =>
    new PhotoSwipeCore({
      mainClass: "cawco-pswp",
      bgOpacity: 1,
      showHideAnimationType: motionOk.current ? "zoom" : "none",
      showAnimationDuration: dur("--dur-panel"),
      hideAnimationDuration: dur("--dur-exit"),
      easing: ease("--ease-drawer"),
      closeTitle: "Close image",
      closeSVG: markup(IconClose),
      arrowPrevSVG: markup(IconChevronLeft),
      arrowNextSVG: markup(IconChevronRight),
      zoomSVG: markup(IconZoomIn),
      ...options,
    });
}
