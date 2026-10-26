<script lang="ts">
  /**
   * A Configure card's commit row: the card's own foot, on the card's
   * surface, held at the page's foot (sticky) while what it commits runs on
   * under it, with the house edge fade above it so that passes under it
   * (DESIGN.md, the update notice's footer: "on the panel's surface with the
   * house edge fade above it"), at every width. Over a keyboard it stands on
   * the keyboard with the fields kept clear of it (aboveKeyboard).
   *
   * Its scroller is the page (SectionFrame's, EditorFrame's), padded
   * `space-2` at its foot: the row stands that far past the padding's edge,
   * on the scroller's own, so nothing shows under it.
   */
  import type { Snippet } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { aboveKeyboard } from "#lib/cawco/visible-viewport.svelte.js";

  let {
    children,
    onPadding = false,
    "data-slot": slot,
  }: {
    children: Snippet;
    /**
     * It ends a card that keeps its own foot padding (SectionFrame's): it
     * stands over that padding, so the card's foot is the row's own.
     */
    onPadding?: boolean;
    "data-slot"?: string;
  } = $props();

  /** An overflow that scrolls. */
  const SCROLLS = /(auto|scroll)/u;
  /** The nearest ancestor that scrolls up and down: the page. */
  const scrollerOf = (node: HTMLElement): HTMLElement | null => {
    let at = node.parentElement;
    while (at && !SCROLLS.test(getComputedStyle(at).overflowY)) {
      at = at.parentElement;
    }
    return at;
  };

  /**
   * Whether what the row commits runs on under it (`data-stuck`): the page
   * can scroll further down. Read in the next frame (frameObserver) as the
   * page scrolls or changes size.
   */
  function stuck(node: HTMLElement) {
    const page = scrollerOf(node);
    if (!page) {
      return;
    }
    const read = () => {
      node.toggleAttribute(
        "data-stuck",
        page.scrollTop + page.clientHeight < page.scrollHeight - 0.5
      );
    };
    const sizes = frameObserver(read);
    const soon = () => sizes.request();
    page.addEventListener("scroll", soon, { passive: true });
    sizes.observe(page);
    if (page.firstElementChild) {
      sizes.observe(page.firstElementChild);
    }
    soon();
    return () => {
      page.removeEventListener("scroll", soon);
      sizes.disconnect();
    };
  }
</script>

<footer
  data-slot={slot}
  data-on-padding={onPadding || undefined}
  class="sticky -bottom-space-2 z-1 mt-auto flex flex-none flex-col gap-space-3 bg-surface-raised pt-space-3 pb-(--foot-pb) data-on-padding:-mb-space-6 before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-c-edge-fade-len before:bg-linear-to-b/srgb before:from-transparent before:to-surface-raised before:opacity-0 before:transition-[opacity] before:duration-(--dur-control) before:ease-out data-stuck:before:opacity-100 max-phone:before:h-c-edge-fade-len-phone"
  data-safe-bottom
  style:--foot-pb="calc(var(--space-6) + var(--safe-bottom))"
  {@attach aboveKeyboard()}
  {@attach stuck}
>
  {@render children()}
</footer>
