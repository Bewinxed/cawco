<script lang="ts">
  /**
   * Markdown a tool carried — a memory document, a skill's arguments — at the
   * transcript's small scale. Settled text, so it renders static: no stream,
   * no word reveal. The rules are `:global` for the same reason MessageBody's
   * are: prose-sm restates its own size on streamdown's root.
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

<style>
  /* residual: foreign-dom — the rendered markdown's own DOM */
  [data-slot="tprose"] :global(.prose) {
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
  }
  /* Every block takes the gap and the first gives it back (the more
     specific rule below): `* + *` restyled the whole document per block. */
  [data-slot="tprose"] :global(.prose > *) {
    margin-top: var(--space-2);
  }
  [data-slot="tprose"] :global(.prose > :first-child) {
    margin-top: 0;
  }
  [data-slot="tprose"] :global(.prose > :last-child) {
    margin-bottom: 0;
  }
  [data-slot="tprose"] :global(p),
  [data-slot="tprose"] :global(ul),
  [data-slot="tprose"] :global(ol),
  [data-slot="tprose"] :global(blockquote) {
    margin-block: 0;
  }
  /* A list holds only items: every one but the first. */
  [data-slot="tprose"] :global(li:where(:not(:first-child))) {
    margin-top: var(--space-1);
  }
  [data-slot="tprose"] :global(ul),
  [data-slot="tprose"] :global(ol) {
    padding-left: var(--space-5);
  }
  [data-slot="tprose"] :global(.prose h1),
  [data-slot="tprose"] :global(.prose h2),
  [data-slot="tprose"] :global(.prose h3),
  [data-slot="tprose"] :global(.prose h4),
  [data-slot="tprose"] :global(.prose h5),
  [data-slot="tprose"] :global(.prose h6) {
    font-size: var(--text-label);
    line-height: var(--leading-ui);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  [data-slot="tprose"]
    :global(.prose > :is(h1, h2, h3, h4):where(:not(:first-child))) {
    margin-top: var(--space-4);
  }
  /* residual: pseudo */
  /* prose wraps inline code in literal backticks; the code face already
     marks it. */
  [data-slot="tprose"] :global(code::before),
  [data-slot="tprose"] :global(code::after) {
    content: none;
  }
  /* residual: foreign-dom */
  [data-slot="tprose"] :global(code) {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
  }
</style>
