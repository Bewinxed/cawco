<script lang="ts">
  /**
   * What a clip changes on its element (the owner's pick "Its own colour
   * per kind" on design-graph-finish; mockup round 29's six kinds): its
   * opacity, position, size, colour, words or unfold, each its own glyph in
   * its own hue, named for a reader. The same hue colours the clip's length
   * and its bar.
   */
  import type { ClipKind } from "@cawco/core/design-graph";
  import { designGraphWords as words } from "@cawco/core/words/design-graph";
  import {
    IconClipColour,
    IconClipOpacity,
    IconClipPosition,
    IconClipSize,
    IconClipText,
    IconClipUnfold,
  } from "#lib/icons.js";

  let { kind }: { kind: ClipKind } = $props();

  const GLYPHS = {
    opacity: IconClipOpacity,
    position: IconClipPosition,
    size: IconClipSize,
    colour: IconClipColour,
    text: IconClipText,
    unfold: IconClipUnfold,
  } as const;
  /** Each kind's hue on its glyph (design/tokens: c-clip-*). */
  const INK = {
    opacity: "text-c-clip-opacity",
    position: "text-c-clip-position",
    size: "text-c-clip-size",
    colour: "text-c-clip-colour",
    text: "text-c-clip-text",
    unfold: "text-c-clip-unfold",
  } as const;
  const Glyph = $derived(GLYPHS[kind]);
</script>

<span
  aria-label={words.kinds[kind]}
  class={[
    "grid size-icon-md flex-none place-items-center [&_svg]:size-icon-md",
    INK[kind],
  ]}
  data-kind={kind}
  role="img"
>
  <Glyph />
</span>
