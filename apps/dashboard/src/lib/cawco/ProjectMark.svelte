<script lang="ts">
  /**
   * The project's mark: the folder on its hued tile, as the rail's projects
   * list draws it. A session's mark is its own (SessionMark).
   */
  import { IconFolder } from "#lib/icons.js";
  import type { MarkHue } from "./mark";

  let { hue }: { hue: MarkHue } = $props();
</script>

<span aria-hidden="true" class="project-mark" style:--fill="var(--mark-{hue})">
  <IconFolder aria-hidden="true" class="project-mark-glyph" />
</span>

<style>
  /* The rail's lead slot (18px) with its 12px glyph: 3px of inset, a mark
     rather than a glyph in a box. */
  .project-mark {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: 18px;
    block-size: 18px;
    border-radius: var(--radius-xs);
    background-color: var(--fill);
    background-image: var(--mark-overlay);
    color: var(--mark-glyph);
  }
  .project-mark :global(.project-mark-glyph) {
    inline-size: 12px;
    block-size: 12px;
  }
</style>
