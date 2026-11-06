<script lang="ts">
  /**
   * The preview's mode as the head's segmented control: Interact, Comment,
   * Draw (V, C, D; Esc back to Interact), alone in a glass of its own, the
   * kit's one segmented recipe (tabs/thumb.ts), which in glass is a capsule
   * with capsule segments concentric in it (DESIGN.md, The Glass Contour
   * Rule; HIG, Segmented controls: symbols alone, equal segments). Where the
   * head has no room for its three segments it is ModeButton instead.
   */
  import { type PreviewMode, previewMode } from "@cawco/core/comments";
  import { previewWords } from "@cawco/core/words/preview";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconInteract, IconPen, IconPin } from "#lib/icons.js";

  let {
    mode,
    onchange,
  }: {
    /** The mode it stands on. */
    mode: PreviewMode;
    /** A segment chosen. */
    onchange: (next: PreviewMode) => void;
  } = $props();
</script>

<div data-slot="modes">
  <BarGlass form="group">
    <Tabs
      onValueChange={(next) => onchange(previewMode(next) ?? "interact")}
      size="compact"
      value={mode}
      values={["interact", "comment", "draw"]}
    >
      <TabsList aria-label={previewWords.previewMode}>
        <TabItem
          aria-keyshortcuts="V"
          glyphOnly
          icon={IconInteract}
          label="Interact"
          title="Interact (V): the page gets every click"
          value="interact"
        />
        <TabItem
          aria-keyshortcuts="C"
          glyphOnly
          icon={IconPin}
          label="Comment"
          title="Comment (C): a click pins a comment"
          value="comment"
        />
        <TabItem
          aria-keyshortcuts="D"
          glyphOnly
          icon={IconPen}
          label="Draw"
          title="Draw (D): drag to draw on the page"
          value="draw"
        />
      </TabsList>
    </Tabs>
  </BarGlass>
</div>
