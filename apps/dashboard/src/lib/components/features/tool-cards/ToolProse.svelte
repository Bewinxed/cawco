<script lang="ts">
  /**
   * Markdown a tool carried — a memory document, a skill's arguments — at the
   * transcript's small scale. Settled text, so it renders static: no stream,
   * no word reveal. Its look is Typography's own modifiers (`prose-p:`,
   * `prose-ul:`, …) and the theme's `prose-*` variants on this element, which
   * reach the `.prose` root Markdown renders below it: prose-sm restates its
   * own size and leading on that root.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";

  let { source }: { source: string } = $props();
</script>

<div
  data-slot="tprose"
  class="text-size-body font-normal leading-body text-ink-strong prose-root:text-size-body prose-root:font-normal prose-root:leading-body prose-root:text-ink-strong prose-p:my-0 prose-ul:my-0 prose-ol:my-0 prose-blockquote:my-0 prose-ul:ps-space-5 prose-ol:ps-space-5 prose-li:my-0 prose-item:mt-space-1 prose-block:mt-space-2 prose-block:first:mt-0 prose-block:last:mb-0 prose-heading:text-size-label prose-heading:leading-ui prose-heading:font-medium prose-heading:text-ink-strong prose-block-heading:mt-space-4"
>
  <Markdown {source} />
</div>
