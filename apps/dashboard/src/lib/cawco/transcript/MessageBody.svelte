<script lang="ts">
  /**
   * A turn's words — plain running text at 74ch, no card, no bubble. Markdown
   * so a fenced block or a list reads as one, and the `.msg` frame carries the
   * mock's inline-code and measure.
   *
   * The type and rhythm rules below are `:global` on purpose. Streamdown puts
   * the `prose prose-sm …` class (see `#lib/prose.js`) on its own root div, and
   * `prose-sm` declares its own font-size, line-height and per-element em
   * margins there — so anything set on `.msg` alone is inherited into that root
   * and then immediately overridden. The scale lives on the token sheet, not in
   * the typography plugin, so the root is restated here.
   */
  import { Markdown } from "#lib/components/ui/markdown/index.js";

  let {
    source,
    streaming = false,
    fades = false,
  }: {
    source: string;
    streaming?: boolean;
    /** Mounted streaming: each chunk's words fade in as they land. */
    fades?: boolean;
  } = $props();
</script>

<div class="msg">
  <Markdown {fades} {source} {streaming} />
</div>

<style>
  .msg {
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    max-inline-size: 74ch;

    & :global(.prose) {
      font-size: var(--text-body);
      font-weight: var(--weight-body);
      line-height: var(--leading-body);
      color: var(--ink-strong);
    }

    /* A turn's words wrap `stable`, streamed or settled: the page's running
       text is `pretty` and its headings `balance`, and both re-wrap the
       lines already drawn when a streamed chunk lands — words on screen hop
       between lines as new ones arrive. Stable keeps every earlier line where
       it is (MDN: "the lines that come before the lines they are editing
       remain static"), and the settled turn wraps the same way, so settling
       moves nothing. */
    & :global(:is(p, li, h1, h2, h3, h4, h5, h6)) {
      text-wrap-style: stable;
    }

    /* ---- Block rhythm. The plugin's em-scaled margins are off the --space
       ladder; one gap between every pair of blocks puts them back on it, and
       a turn never opens or closes with dead space. Every block takes the gap
       and the first gives it back (the more specific rule): written `* + *`,
       a sibling ending on anything, every block streamed in restyled the
       whole reply. */
    & :global(.prose > *) {
      margin-block-start: var(--space-3);
    }
    & :global(.prose > :first-child) {
      margin-block-start: 0;
    }
    & :global(.prose > :last-child) {
      margin-block-end: 0;
    }
    & :global(p),
    & :global(ul),
    & :global(ol),
    & :global(blockquote) {
      margin-block: 0;
    }
    /* Nested rhythm the top-level rule cannot reach. */
    & :global(p + p) {
      margin-block-start: var(--space-3);
    }
    /* A list holds only items: every one but the first. Structural, not a
       sibling ending on the item, so an item put in restyles its list. */
    & :global(li:where(:not(:first-child))) {
      margin-block-start: var(--space-1);
    }
    & :global(li > ul),
    & :global(li > ol) {
      margin-block-start: var(--space-1);
    }
    & :global(ul),
    & :global(ol) {
      padding-inline-start: var(--space-5);
    }

    /* A reply is not a document: its headings are emphasis, not a title page. */
    & :global(.prose :is(h1, h2, h3, h4, h5, h6)) {
      font-size: var(--text-body);
      line-height: var(--leading-ui);
      font-weight: var(--weight-strong);
      color: var(--ink-strong);
    }
    & :global(.prose > :is(h1, h2, h3, h4, h5, h6):where(:not(:first-child))) {
      margin-block-start: var(--space-5);
    }

    /* Inline code is a chip on the code surface (DESIGN.md: code-bg),
       edged with a hairline so it reads on the recess a transcript sits on
       as well as on a raised card. It is one box on the line: a token that
       fits moves to the next line whole (`ev-3121` never splits at its
       hyphen), and only one longer than a whole line wraps inside it. */
    & :global(:not(pre) > code) {
      display: inline-block;
      max-inline-size: 100%;
      vertical-align: baseline;
      font-family: var(--font-mono);
      font-size: var(--text-label);
      line-height: var(--leading-ui);
      background: var(--code-bg);
      box-shadow: inset 0 0 0 1px var(--border-hairline);
      padding-block: 0;
      padding-inline: 4px;
      border-radius: var(--radius-xs);
      overflow-wrap: anywhere;
    }
    /* A fence renders through OutputBlock, which paints its own well inside a
       `.not-prose` wrapper; the direct-child selector is the fallback for any
       `pre` that reaches prose itself, and leaves OutputBlock's alone. */
    & :global(.prose > pre) {
      font-family: var(--font-mono);
      font-size: var(--text-label);
      line-height: var(--leading-body);
      background: var(--surface-recess);
      border-radius: var(--radius-sm);
      padding: var(--space-3);
      overflow-x: auto;
    }
    & :global(.prose > pre code) {
      background: none;
      padding: 0;
      font-size: inherit;
    }
  }
</style>
