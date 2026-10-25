<script lang="ts">
  import { designGraphWords as words } from "@cawco/core";
  /**
   * What a clip does to its element (Projects spec §5.10, "Readable
   * labels", pin 27: "color things differently"): brings it in, changes it
   * where it stands, or takes it away, each its own glyph in its own hue,
   * named for a reader. The same hue colours the clip's bar.
   */
  import type { ClipKind } from "@cawco/core/design-graph";
  import { IconClipChange, IconClipEnter, IconClipExit } from "#lib/icons.js";

  let { kind }: { kind: ClipKind } = $props();

  const GLYPHS = {
    enter: IconClipEnter,
    change: IconClipChange,
    exit: IconClipExit,
  } as const;
  const Glyph = $derived(GLYPHS[kind]);
</script>

<span
  aria-label={words.kinds[kind]}
  class="grid size-icon-md flex-none place-items-center data-[kind=change]:text-c-clip-change data-[kind=enter]:text-c-clip-enter data-[kind=exit]:text-c-clip-exit [&_svg]:size-icon-md"
  data-kind={kind}
  role="img"
>
  <Glyph />
</span>
