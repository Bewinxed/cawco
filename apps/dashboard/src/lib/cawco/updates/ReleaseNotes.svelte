<script lang="ts">
  /**
   * A release's notes as the markdown they are (docs/releases/README.md):
   * each section's heading in the label role, then its bullets as a list,
   * drawn by the app's one markdown renderer. The toast, the Home card and
   * Configure › Updates all show notes through this, at the size of the
   * text around them.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";

  let { source }: { source: string } = $props();
</script>

<div class="release-notes"><Markdown {source} /></div>

<style>
  /* Prose's own scale is for a document; notes sit inside a toast or a card
     and take that surface's type, so the prose here inherits it and keeps
     only its structure. Every rule sits one class above prose's `:where()`. */
  .release-notes :global(.prose) {
    font: inherit;
    color: inherit;
  }
  .release-notes :global(:is(h1, h2, h3, h4, h5, h6)) {
    margin: var(--space-3) 0 var(--space-1);
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .release-notes :global(:is(h1, h2, h3, h4, h5, h6):first-child) {
    margin-top: 0;
  }
  .release-notes :global(p) {
    margin: 0;
  }
  .release-notes :global(ul) {
    display: grid;
    gap: var(--space-row);
    margin: 0;
    padding-inline-start: var(--space-4);
    list-style: disc;
  }
  .release-notes :global(li) {
    margin: 0;
    padding: 0;
    overflow-wrap: anywhere;
  }
  .release-notes :global(li::marker) {
    color: var(--ink-muted);
  }
</style>
