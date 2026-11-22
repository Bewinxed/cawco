<script lang="ts">
  /**
   * The preview's mode as the head's segmented control: Interact, Comment,
   * Draw (V, C, D; Esc back to Interact), the kit's BarSegments, its glass
   * the switch's one container and each segment a bar item (DESIGN.md, The
   * Glass Contour Rule; HIG, Segmented controls: symbols alone, equal
   * segments). Where the head has no room for its three segments it is
   * ModeButton instead.
   */
  import { type PreviewMode, previewMode } from "@cawco/core/comments/model";
  import { previewWords } from "@cawco/core/words/preview";
  import { BarSegments } from "#lib/components/ui/bar-glass/index.js";
  import {
    IconCommentLinear,
    IconInteractLinear,
    IconPenLinear,
  } from "#lib/icons.js";

  let {
    mode,
    onchange,
  }: {
    /** The mode it stands on. */
    mode: PreviewMode;
    /** A segment chosen. */
    onchange: (next: PreviewMode) => void;
  } = $props();

  const SEGMENTS = [
    {
      value: "interact",
      label: previewWords.modes.interact,
      icon: IconInteractLinear,
      keys: "V",
      tip: previewWords.modeTips.interact,
    },
    {
      value: "comment",
      label: previewWords.modes.comment,
      icon: IconCommentLinear,
      keys: "C",
      tip: previewWords.modeTips.comment,
    },
    {
      value: "draw",
      label: previewWords.modes.draw,
      icon: IconPenLinear,
      keys: "D",
      tip: previewWords.modeTips.draw,
    },
  ] as const;
</script>

<div data-slot="modes">
  <BarSegments
    label={previewWords.previewMode}
    onValueChange={(next) => onchange(previewMode(next) ?? "interact")}
    segments={SEGMENTS}
    value={mode}
  />
</div>
