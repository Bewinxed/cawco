<script lang="ts">
  import { untrack } from "svelte";
  import {
    Streamdown,
    theme as streamdownTheme,
    type Theme,
  } from "svelte-streamdown";
  import { dur, ease, motionOk } from "$lib/cawco/motion/curves.svelte";
  import OutputBlock from "$lib/components/features/tool-cards/OutputBlock.svelte";
  import { PROSE } from "$lib/prose";
  import { draw, stepping } from "../collapsible/draw";

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
     * Fade in what each streamed chunk adds, and the last words a message
     * draws as it settles. Only ever the words a chunk ADDS: the text already
     * on screen when this mounts — a conversation opened mid-answer, a row
     * the virtualiser remounted — is never replayed.
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

  /**
   * What is drawn of a streaming message: everything up to its last whole
   * word. A word still arriving ("crac" → "cracked") grows in place, and a
   * word that grows at the end of a line wraps to the next one — the last
   * word of a line dropping a line on every other chunk — and fades only its
   * first half in. Held back until the whitespace after it lands, a word is
   * drawn once, whole, and never changes width; a word still held when the
   * message settles is drawn then, faded in like one more chunk.
   */
  const drawn = $derived(
    streaming ? source.slice(0, source.search(/\S*$/)) : source
  );

  /** A fence's opening or closing line: three or more backticks or tildes. */
  const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

  /**
   * Where a block can end: after a blank line outside a fence, where the
   * next line starts one. Cutting the text there leaves whole blocks, so
   * each prefix renders as the finished message's first blocks do.
   */
  function blockEnds(text: string): number[] {
    const ends: number[] = [];
    let fence: string | null = null;
    let blank = false;
    let offset = 0;
    for (const line of text.split("\n")) {
      const marker = line.match(FENCE)?.[1];
      if (fence === null && blank && line.trim() !== "" && offset > 0) {
        ends.push(offset);
      }
      if (marker && (fence === null || marker.startsWith(fence))) {
        fence = fence === null ? marker : null;
      }
      blank = line.trim() === "";
      offset += line.length + 1;
    }
    return ends;
  }

  /**
   * How much of a settled message is drawn. Mounted by a step of something
   * drawn in steps (`draw`), a message draws its first block and then one
   * more per step — a page of markdown was 10ms to build and 15ms to lay out
   * in WebKit, too much for one frame. Anywhere else it is drawn whole.
   */
  const ends = $derived(blockEnds(source));
  let upto = $state(
    untrack(() =>
      !streaming && stepping()
        ? (ends[0] ?? source.length)
        : Number.POSITIVE_INFINITY
    )
  );
  const content = $derived(
    upto >= source.length ? drawn : source.slice(0, upto)
  );
  $effect(() => {
    if (untrack(() => upto >= source.length)) {
      return;
    }
    return draw({
      step: () => {
        const next = ends.find((end) => end > upto);
        upto = next ?? source.length;
        return upto < source.length;
      },
    });
  });

  /**
   * How Streamdown draws this message for as long as it is drawn: block by
   * block with a span per word when it mounted streaming, whole and plain
   * when it mounted settled. Fixed at mount, because switching is a rebuild:
   * Streamdown swaps the two renders in an `{#if}`, so a streamed answer
   * turning static as it settled threw every block away and drew the whole
   * reply again — 2,600 elements styled and laid out inside the frame the
   * answer finished in. A message that streamed keeps the render it
   * streamed in, and settling is its last chunk; the two lay out the same
   * (see the token spans' styles below).
   */
  const tokens = untrack(() => streaming);

  /** A word Streamdown renders as a span of its own in the streamed render. */
  const TOKEN = 'span[style*="sd-"]';
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
   *
   * The chunk's words are the text past `mark`, so they are walked back
   * from the end (`length` is the text's whole length) and the walk stops
   * at the mark: a chunk costs its own words. Walked from the start, every
   * chunk of a long reply visited all its 2,400 words (1.3ms each time).
   */
  function fadeFrom(root: HTMLElement, mark: number, length: number): void {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const fresh = new Set<Element>();
    let offset = length;
    for (let node = walk.lastChild(); node; node = walk.previousNode()) {
      offset -= node.nodeValue?.length ?? 0;
      if (offset < mark) {
        break;
      }
      // Only a word's own span fades. Text Streamdown writes straight into a
      // block has no span of its own, and fading its block would fade every
      // word already in it.
      const token = node.parentElement;
      if (token?.matches(TOKEN)) {
        fresh.add(token);
      }
    }
    const duration = dur("--dur-menu");
    const easing = ease("--ease-out");
    for (const element of fresh) {
      element.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing });
    }
  }

  // Every chunk, and the settle: the words a message held back while it
  // streamed are drawn as it settles, and fade in like one more chunk. A
  // fade already running when it settles plays on: its spans are the same
  // elements.
  $effect(() => {
    // biome-ignore lint/complexity/noVoid: a new chunk is what re-runs this.
    void drawn;
    const root = host;
    if (!(root && tokens)) {
      return;
    }
    const length = root.textContent?.length ?? 0;
    if (shown >= 0 && length > shown && fades && motionOk.current) {
      fadeFrom(root, shown, length);
    }
    shown = length;
  });
</script>

<!-- A message that streams has Streamdown render each word as a span of its
     own — from the first render (`animateOnMount`), because the flag that
     would switch spans on after mount is not reactive and a paragraph that
     mounted as plain text stayed plain for good. That is what lets a chunk's
     words be told from the ones already on screen. Streamdown's own per-word
     animation is switched off below, so mounting with spans replays nothing;
     the chunk fade above is the only motion text has. A message that mounts
     settled renders static: plain text nodes, the same layout. -->
<div class="md" bind:this={host}>
  <Streamdown
    animation={{
      enabled: tokens,
      animateOnMount: true,
      tokenize: 'word',
    }}
    class="{PROSE} {invert ? 'prose-invert' : ''}"
    {content}
    controls={{ mermaid: false, table: false }}
    mergeTheme={false}
    static={!tokens}
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
