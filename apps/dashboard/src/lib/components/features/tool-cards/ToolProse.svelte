<script lang="ts">
  /**
   * Markdown a tool carried — a memory document, a skill's arguments — at the
   * transcript's small scale. Settled text, so it renders static: no stream,
   * no word reveal. The rules for the rendered markdown's own DOM are the
   * `tool-prose` component in theme.css, anchored under `data-slot="tprose"`:
   * prose-sm restates its own size on streamdown's root.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";

  let { source }: { source: string } = $props();
</script>

<div
  data-slot="tprose"
  class="text-size-body font-normal leading-body text-ink-strong"
>
  <Markdown {source} />
</div>
