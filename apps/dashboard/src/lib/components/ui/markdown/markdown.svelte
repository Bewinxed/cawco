<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  const markdownVariants = tv({
    variants: {
      /**
       * Prose standing in a surface whose type it takes (a release's notes
       * in a toast, a card or Configure › Updates): the surface's font and
       * ink, its paragraphs flush, its bullets a grid a row-gap apart with
       * muted markers, and long words broken anywhere. Only the structure
       * stays the prose's.
       */
      look: {
        surface:
          "[&_li]:wrap-anywhere font-inherit text-inherit [&_li]:m-0 [&_li]:p-0 [&_li]:marker:text-ink-muted [&_p]:m-0 [&_ul]:m-0 [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-space-row [&_ul]:ps-space-4",
      },
    },
  });

  type MarkdownLooks = VariantProps<typeof markdownVariants>;
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import {
    Markdown,
    type MarkdownSnippets,
    type MarkdownWhen,
  } from "svelte-words";
  import { dur, motionOk } from "#lib/platform/motion/curves.svelte.js";
  import { PROSE } from "#lib/prose.js";
  import { cn } from "#lib/utils.js";
  import { draw, stepping } from "../collapsible/draw";
  import { BREAK, literalHtml } from "./literal-html";
  import { mermaidFor } from "./mermaid.svelte";

  let {
    source,
    invert = false,
    streaming = false,
    fades = false,
    look,
    class: className,
    marks = (words: string) => words,
    link,
    inlineCode,
    code,
    when,
  }: MarkdownLooks &
    MarkdownSnippets & {
      source: string;
      invert?: boolean;
      streaming?: boolean;
      /** Its prose root's own utilities, over the house prose (a surface whose
        type the prose takes, as the release notes' panel). */
      class?: string;
      /**
       * Fade in what each streamed chunk adds, and the last words a message
       * draws as it settles. Only ever the words a chunk ADDS: the text already
       * on screen when this mounts (a conversation opened mid-answer, a row
       * the virtualiser remounted) is never replayed.
       */
      fades?: boolean;
      /**
       * The words as the host marks them before they are drawn (cawco/Markdown:
       * a mention as a session's reference, a skill as its chip): the source
       * as it is when none is given.
       */
      marks?: (words: string) => string;
      /** Which links, code spans and fences the host's snippets take; the rest are drawn as markdown draws them. */
      when?: MarkdownWhen;
    } = $props();

  /**
   * The link destinations drawn: the web's, mail, phone, a path in the app,
   * and CawCo's rich references (`cawco:`, core references.ts), which the
   * host's `link` snippet draws (cawco/Markdown). Any other scheme is
   * dropped, and its link reads as its text.
   */
  const SCHEMES = new Set(["http", "https", "mailto", "tel", "cawco"]);
  const SCHEME = /^([a-z][a-z0-9+.-]*):/iu;
  const urlTransform = (url: string): string | null => {
    const scheme = SCHEME.exec(url)?.[1]?.toLowerCase();
    return scheme === undefined || SCHEMES.has(scheme) ? url : null;
  };

  /** A link with a destination outside the app opens beside it. */
  const ELSEWHERE = /^<a (?=[^>]*\shref="(?!\/))/u;
  /** Each `<br>` the words wrote, a line break (literal-html.ts). */
  const broken = (html: string): string => html.replaceAll(BREAK, "<br>");
  /** A table scrolls sideways inside the prose's width. */
  const components = {
    a: (html: string) =>
      html.replace(ELSEWHERE, '<a target="_blank" rel="noopener noreferrer" '),
    table: (html: string) =>
      `<div class="max-w-full overflow-x-auto">${html}</div>`,
    p: broken,
    li: broken,
    td: broken,
    th: broken,
  };

  /**
   * The words as drawn: the host's marks, and raw HTML as the text it is
   * (literal-html.ts).
   */
  const written = (words: string): string => literalHtml(marks(words));

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
    written(streaming ? source.slice(0, source.search(/\S*$/u)) : source)
  );

  /** A fence's opening or closing line: three or more backticks or tildes. */
  const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;

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
   * more per step: Words renders a long reply's HTML in a fraction of a
   * millisecond, but the browser still styles and lays out every block it
   * adds (a page of markdown was 15ms of layout in WebKit), too much for one
   * frame. Anywhere else it is drawn whole.
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
    upto >= source.length ? drawn : written(source.slice(0, upto))
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
   * Whether this message fades what it adds: one that mounted streaming,
   * from then on, its settle included. One that mounted settled draws in
   * steps, and its steps never fade.
   */
  const streamed = untrack(() => streaming);

  /**
   * Each chunk's words fade in together: one short opacity fade per chunk
   * (--duration-menu, --ease-crossfade: app.css), no stagger inside it, nothing
   * that moves.
   */
  const animated = $derived(
    streamed && fades && motionOk.current
      ? {
          // Read as the fade runs: the token is the page's.
          get duration() {
            return dur("--duration-menu");
          },
        }
      : false
  );
</script>

<div data-slot="md" class="contents">
  <Markdown
    class={cn(
      PROSE,
      invert && "prose-invert",
      markdownVariants({ look }),
      className
    )}
    {animated}
    {code}
    {inlineCode}
    {link}
    options={{
      components,
      controls: false,
      lineNumbers: false,
      plugins: { mermaid: mermaidFor(content) },
      urlTransform,
    }}
    source={content}
    {streaming}
    {when}
  />
</div>
