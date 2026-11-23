<script lang="ts">
  /**
   * The tools that act on what the panel shows, floating over it at its
   * foot, centred, as iOS's bottom toolbar floats its Liquid Glass over
   * content (the owner's pins on the Working area: "these tools can float
   * over the preview", and of the view options, "all of these need to be
   * directly visible"): the mode, then for a component the stage's view.
   * Each group is a glass of its own, side by side on one row, which never
   * wraps (the owner's pin: "this should NOT be on a 2nd row"): it says the
   * width its groups need at their own size (`need`), and the surface folds
   * them to their compact form while it is narrower than that. Nothing
   * between the glasses takes a press from the page.
   */
  import { type Snippet, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { frameObserver, frameSize } from "../../platform/frame-observer";
  import { rise } from "../../platform/motion/curves.svelte";

  let {
    lift = 0,
    spread = false,
    away = false,
    height = $bindable(0),
    need = $bindable(0),
    children,
  }: {
    /** What stands over the foot already (a decision page's own Send bar), px: the tools stand above it. */
    lift?: number;
    /** Stepped aside below the foot while the drawing scrolls down (a phone's, a narrow card's): a scroll up or a press brings it back. */
    away?: boolean;
    /** Its groups stand at the two ends (the mode leading, the view trailing), not centred. */
    spread?: boolean;
    /** Its own height, px: what rises over it stands above it (the design graph's map, move and dials). */
    height?: number;
    /** The width its groups need on one row at their own size, its inset and gaps included, px: the surface folds them while it is narrower. */
    need?: number;
    children: Snippet;
  } = $props();

  /** The row's need: each group at its own width (spread, none shrinks), the gaps between them and the inset. */
  const needOf = (row: HTMLElement): number => {
    const style = getComputedStyle(row);
    const groups = [...row.children].filter(
      (child) => child instanceof HTMLElement
    );
    const gap = Number.parseFloat(style.columnGap) || 0;
    const across = groups.reduce((sum, group) => sum + group.offsetWidth, 0);
    return Math.ceil(
      across +
        gap * Math.max(0, groups.length - 1) +
        Number.parseFloat(style.paddingInlineStart) +
        Number.parseFloat(style.paddingInlineEnd)
    );
  };
  /**
   * Its need, heard as a group resizes (frameObserver, read inside the
   * delivery) or a group comes or goes (a mutation, read in the next
   * frame's delivery): the row's own box keeps its width as they change.
   *
   * A group is observed as it comes and let go as it goes, in the mutation
   * that says so; the answer only writes the need. A target observed afresh
   * reports its size in the next delivery whether or not it changed, so the
   * answer observing every group again had each one report in the next
   * frame, whose answer observed them again: a frame callback, a delivery
   * and that frame's whole lifecycle on every frame the tools stood, at
   * rest (the owner's trace of nightly 8296: 317 of 339 frame callbacks in
   * 3.2s of a page at rest, with a comment's card open).
   */
  const measured: Attachment<HTMLElement> = (row) => {
    untrack(() => {
      need = needOf(row);
    });
    let read = 0;
    const sized = frameObserver(
      () => {
        need = read;
      },
      {
        read: () => {
          read = needOf(row);
        },
      }
    );
    sized.observe(row);
    for (const group of row.children) {
      sized.observe(group);
    }
    const groups = new MutationObserver((records) => {
      for (const record of records) {
        for (const gone of record.removedNodes) {
          if (gone instanceof Element) {
            sized.unobserve(gone);
          }
        }
        for (const come of record.addedNodes) {
          if (come instanceof Element) {
            sized.observe(come);
          }
        }
      }
      sized.readNext();
    });
    groups.observe(row, { childList: true });
    return () => {
      sized.disconnect();
      groups.disconnect();
    };
  };
</script>

<div
  data-slot="preview-tools"
  class={[
    "pointer-events-none absolute inset-x-0 bottom-space-3 z-1 mb-(--lift) flex flex-nowrap items-end gap-space-2 px-space-3 transition-[translate,opacity] duration-(--duration-slow) ease-drawer",
    // Spread, its groups keep their own width, so the row's need is theirs
    // (the surface folds them past it); centred (folded), a group that
    // gives up width (`min-w-0`) takes the row's shortfall.
    spread ? "justify-between [&>*]:flex-none" : "justify-center",
    away ? "translate-y-full opacity-0" : "[&>*]:pointer-events-auto",
  ]}
  style:--lift="{lift}px"
  {@attach frameSize(
    (node: HTMLElement) => node.offsetHeight,
    (value) => {
      height = value;
    }
  )}
  {@attach measured}
  in:rise={"--duration-slow"}
  out:rise={"--duration-base"}
>
  {@render children()}
</div>
