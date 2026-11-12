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
  import { frameObserver, frameSize } from "../frame-observer";
  import { rise } from "../motion/curves.svelte";

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
    const groups = [...row.children] as HTMLElement[];
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
   */
  const measured: Attachment<HTMLElement> = (row) => {
    untrack(() => {
      need = needOf(row);
    });
    let read = 0;
    const sized = frameObserver(
      () => {
        for (const group of row.children) {
          sized.observe(group);
        }
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
    const added = new MutationObserver(() => sized.readNext());
    added.observe(row, { childList: true });
    return () => {
      sized.disconnect();
      added.disconnect();
    };
  };
</script>

<div
  data-slot="preview-tools"
  class={[
    "pointer-events-none absolute inset-x-0 bottom-space-3 z-1 mb-(--lift) flex flex-nowrap items-end gap-space-2 px-space-3 transition-[translate,opacity] duration-(--dur-panel) ease-drawer",
    // Spread, its groups keep their own width, so the row's need is theirs
    // (the surface folds them past it); centred (folded), a group that
    // gives up width (`min-w-0`) takes the row's shortfall.
    spread ? "justify-between *:flex-none" : "justify-center",
    away ? "translate-y-full opacity-0" : "*:pointer-events-auto",
  ]}
  style:--lift="{lift}px"
  {@attach frameSize(
    (node: HTMLElement) => node.offsetHeight,
    (value) => {
      height = value;
    }
  )}
  {@attach measured}
  in:rise={"--dur-panel"}
  out:rise={"--dur-exit"}
>
  {@render children()}
</div>
