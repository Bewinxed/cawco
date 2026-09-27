<script lang="ts">
  import {
    Streamdown,
    theme as streamdownTheme,
    type Theme,
  } from "svelte-streamdown";
  import OutputBlock from "$lib/components/features/tool-cards/OutputBlock.svelte";
  import { PROSE } from "$lib/prose";
  import { motionOk } from "$lib/whiffle/motion/curves.svelte";

  let {
    source,
    invert = false,
    streaming = false,
    fades = false,
  }: {
    source: string;
    invert?: boolean;
    streaming?: boolean;
    /**
     * Fade in what each streamed chunk adds. Only ever the words a chunk ADDS:
     * the text already on screen when this mounts — a conversation opened
     * mid-answer, a row the virtualiser remounted — is never replayed.
     */
    fades?: boolean;
  } = $props();

  // Streamdown's stock themes hardcode a Tailwind palette (bg-gray-100,
  // text-blue-600, marker:hidden) that would out-shout PROSE. Blank every
  // group PROSE already owns and keep only what has no prose equivalent: the
  // table wrapper needs its own scroll container. Groups left at their
  // defaults — alerts, footnotes, citations, popovers — are streamdown chrome
  // that prose says nothing about, and the `code` group is not here because a
  // fence never reaches streamdown's renderer (see the snippet below).
  const PLAIN: Theme = {
    ...streamdownTheme,
    link: { base: "", blocked: "" },
    h1: { base: "" },
    h2: { base: "" },
    h3: { base: "" },
    h4: { base: "" },
    h5: { base: "" },
    h6: { base: "" },
    paragraph: { base: "" },
    ul: { base: "" },
    ol: { base: "" },
    li: { base: "", checkbox: "mr-2" },
    codespan: { base: "" },
    image: { base: "", image: "" },
    blockquote: { base: "" },
    table: { base: "overflow-x-auto max-w-full", table: "" },
    thead: { base: "" },
    tbody: { base: "" },
    tfoot: { base: "" },
    tr: { base: "" },
    td: { base: "" },
    th: { base: "" },
    sup: { base: "" },
    sub: { base: "" },
    hr: { base: "" },
    strong: { base: "" },
    em: { base: "" },
    del: { base: "" },
    math: { block: "", inline: "" },
    descriptionList: { base: "" },
    descriptionTerm: { base: "" },
    descriptionDetail: { base: "" },
  };

  let host = $state<HTMLElement>();
  /**
   * How much text was on screen after the last update. A chunk's words are
   * exactly the text past this mark, so they are found from the data, not
   * from when their spans happened to mount — Streamdown re-creates every
   * token span once, right after it mounts, and marking by mount would
   * replay the whole paragraph.
   */
  let shown = -1;

  /**
   * Each chunk's words fade in together — one short opacity fade per chunk
   * (--dur-menu, --ease-out), no stagger inside it, no blur, nothing that
   * moves. A word the chunk only EXTENDS ("wor" → "world") is not new, and
   * keeps its place.
   */
  function fadeFrom(root: HTMLElement, mark: number): void {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const fresh = new Set<Element>();
    let offset = 0;
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const start = offset;
      offset += node.nodeValue?.length ?? 0;
      if (start >= mark && node.parentElement) {
        fresh.add(node.parentElement);
      }
    }
    if (fresh.size === 0) {
      return;
    }
    const style = getComputedStyle(root);
    const timing = {
      duration: Number.parseFloat(style.getPropertyValue("--dur-menu")),
      easing: style.getPropertyValue("--ease-out"),
    };
    for (const element of fresh) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    }
  }

  $effect(() => {
    // biome-ignore lint/complexity/noVoid: a new chunk is what re-runs this.
    void source;
    const root = host;
    if (!(root && streaming)) {
      shown = -1;
      return;
    }
    const length = root.textContent?.length ?? 0;
    if (shown >= 0 && length > shown && fades && motionOk.current) {
      fadeFrom(root, shown);
    }
    shown = length;
  });
</script>

<!-- While a message streams, Streamdown renders each word as a span of its
     own — from the first render (`animateOnMount`), because the flag that
     would switch spans on after mount is not reactive and a paragraph that
     mounted as plain text stayed plain for good. That is what lets a chunk's
     words be told from the ones already on screen. Streamdown's own per-word
     animation is switched off below, so mounting with spans replays nothing;
     the chunk fade above is the only motion text has. Settled text renders
     static: plain text nodes, the same layout. -->
<div class="md" bind:this={host}>
  <Streamdown
    animation={{
      enabled: streaming,
      animateOnMount: true,
      tokenize: 'word',
    }}
    class="{PROSE} {invert ? 'prose-invert' : ''}"
    content={source}
    controls={{ mermaid: false, table: false }}
    mergeTheme={false}
    static={!streaming}
    theme={PLAIN}
  >
    <!-- A fence is code, and the console has one surface for code: the same well a
	     tool result opens into, painted by the same highlighter. Streamdown can
	     highlight fences itself, but it resolves one shiki theme at a time and
	     writes it as inline colours — registering a custom pair through its
	     `shikiThemes` pins every fence to whichever theme is listed first, and
	     following the appearance instead means re-tokenizing every block on every
	     switch, through a second shiki with a second cache. Ours carries both inks
	     on the token and lets CSS choose. Prose dresses every `pre` and `code` it
	     contains, so the well opts out of that dressing here; inline code
	     (`codespan`) keeps it, because it is prose, not a listing. -->
    {#snippet code({ token })}
      <div
        class="not-prose my-3 [&_code]:bg-transparent! [&_code]:p-0! [&_pre]:border-0! [&_pre]:bg-transparent!"
      >
        <OutputBlock language={token.lang} text={token.text} />
      </div>
    {/snippet}
  </Streamdown>
</div>

<style>
  .md {
    display: contents;

    /* Streamdown writes its token and block animation inline; the chunk fade
       in the script is the only motion streamed text has. */
    & :global([style*="sd-"]) {
      animation: none !important;
    }
    /* Its token spans are inline-block and pre-wrap, which wraps a line
       differently from the plain text the same words settle into; inline,
       with the prose's own white-space, the streamed paragraph and the
       settled one lay out identically. */
    & :global(span[style*="sd-"]) {
      display: inline !important;
      white-space: inherit !important;
    }
  }
</style>
