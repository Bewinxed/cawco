# @cawco/words-svelte

Streaming markdown for Svelte 5, on [`@pierre/words`](https://diffs.com/docs#words):
CommonMark and GFM parsed in WebAssembly, written into the DOM and patched in
place as the text grows, so a reply streamed a few words at a time re-renders
only what changed. Links, images, code spans and code blocks can be drawn by
your own snippets, which stay mounted, with their state, while the text around
them streams.

```sh
bun add @cawco/words-svelte @pierre/words
```

`svelte` (5.40 or later) and `@pierre/words` are peer dependencies.

## A message

```svelte
<script lang="ts">
  import { Markdown } from "@cawco/words-svelte";

  let { text, streaming }: { text: string; streaming: boolean } = $props();
</script>

<Markdown source={text} {streaming} fade class="prose" />
```

Pass the whole text so far as `source` on every update, and `streaming` while
more of it is coming. While it streams, unfinished emphasis, code and links
are completed for display (`repair`, on by default). When `streaming` turns
false, the text renders as written.

Every other attribute (`class` with Svelte's arrays and objects, `id`,
`aria-*`, an `{@attach}`) goes on the root `<div data-markdown="root">`.

## Your markup in the output

Give a snippet for a kind of element, and the package draws it in that
element's place: `link`, `image`, `inlineCode` and `code` (a fenced block).
`when` narrows a snippet to some of its elements; the rest stay as Words
writes them.

```svelte
<script lang="ts">
  import { Markdown, type MarkdownCode, type MarkdownLink } from "@cawco/words-svelte";
  import CodeBlock from "./CodeBlock.svelte";
  import UserChip from "./UserChip.svelte";

  let { text, streaming } = $props();
</script>

{#snippet code({ code, language, isIncomplete }: MarkdownCode)}
  <CodeBlock {code} {language} live={isIncomplete} />
{/snippet}

{#snippet link({ href, text }: MarkdownLink)}
  <UserChip id={href?.slice("app:user/".length)} label={text} />
{/snippet}

<Markdown
  source={text}
  {streaming}
  {code}
  {link}
  when={{ link: ({ href }) => !!href?.startsWith("app:user/") }}
  urlTransform={(url) => (url.startsWith("app:user/") || !url.includes(":") || /^https?:/.test(url) ? url : null)}
/>
```

| Snippet      | Receives                                                                  |
| ------------ | ------------------------------------------------------------------------- |
| `link`       | `{ href: string \| null, title: string \| null, html: string, text: string }` |
| `image`      | `{ src: string, alt: string, title: string \| null }`                     |
| `inlineCode` | `{ code: string }`                                                        |
| `code`       | `{ code: string, language: string, isIncomplete: boolean }`               |

- A snippet is mounted once for its element and given new values as the
  element changes: a code block streaming line by line keeps one mounted
  component from its first line to the end of the stream. It is unmounted
  when its element goes away, and when the markdown is destroyed.
- Snippets are drawn in the context of the component that renders
  `<Markdown>`, so components inside them read that component's context.
- `html` is the link's content as escaped HTML Words wrote, safe for
  `{@html}`.
- A link or image snippet receives the URL your `urlTransform` returned, even
  one Words' own check refuses (an app's own scheme, as above): escape or
  check it as you draw it. Words draws every other link, and checks it.
- `language` is `text` for a fence that names none.

## Options

| Prop                                     | Default | What it does                                                                                       |
| ---------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `source`                                 |         | The whole markdown so far.                                                                         |
| `streaming`                              | `false` | More of the source is coming.                                                                      |
| `repair`                                 | `true`  | Complete unfinished syntax while streaming.                                                        |
| `fade`                                   | `false` | Fade in the text each update adds: `true`, or `{ duration, easing }` (180 ms, `ease-out`).          |
| `caret`                                  |         | `'block'` or `'circle'` at the end while streaming; its glyph is `@pierre/words/styles.css`'s.     |
| `link`, `image`, `inlineCode`, `code`    |         | Snippets, above.                                                                                   |
| `when`                                   |         | Per snippet, which elements it takes.                                                              |
| `components`                             |         | Words' hooks: a tag name (or `inlineCode`) to a function from the element's HTML to new HTML.      |
| `plugins`                                |         | Words' `code` highlighter, `mermaid` and `renderers`.                                             |
| `urlTransform`                           |         | Each `href` and `src` before Words checks it; `null` drops it.                                     |
| `math`, `cjk`                            | `false` | TeX as SVG; CJK-friendly emphasis.                                                                 |
| `controls`, `lineNumbers`                | `true`  | Words' copy and download buttons and line numbers on the code blocks it draws.                     |
| `allowedElements`, `disallowedElements`, `unwrapDisallowed` | | Words' element filters.                                                                |
| `idPrefix`                               | unique  | Prefix of footnote ids; each instance has its own.                                                 |

Options are read reactively: change a prop and the output follows, rendered
again only when a value changed. Nothing needs to be memoized. A new hook
function applies to the output written after it, as in Words.

The fade never replays text already on screen when the element first renders,
and the text the last update adds as the stream ends fades in too. Reduced
motion turns it off. Code blocks, snippets and the caret never fade.

Words' stylesheet (`@pierre/words/styles.css`) is optional: import it for its
look, or style `[data-markdown="…"]` elements yourself.

## Defaults for a subtree

```svelte
<script lang="ts">
  import { setMarkdownDefaults } from "@cawco/words-svelte";
  import { plugins } from "./highlighting";

  setMarkdownDefaults({ plugins, controls: false, urlTransform: (url) => url });
</script>
```

Every `<Markdown>` under this component starts from these options (snippets
included), each prop it is given overriding them. A nested call merges over
its ancestor's.

## The attachment

`<Markdown>` is a `<div>` with the `markdown` attachment on it. Put the
attachment on any element of your own:

```svelte
<script lang="ts">
  import { getAllContexts } from "svelte";
  import { markdown } from "@cawco/words-svelte";

  let { text, streaming } = $props();
  const context = getAllContexts();
</script>

<article {@attach markdown(() => ({ source: text, streaming, fade: true, context }))}></article>
```

The function is read in an effect, so whatever it reads is tracked. Pass
`context` for snippets that read context.

## Server rendering

`<Markdown>` writes its HTML on the server, and on hydration the attachment
adopts it: the server's nodes stay, and snippets mount into their places.
Until then each snippet's element reads as Words writes it. `renderMarkdown(input)`
returns the same HTML, for a server that renders without Svelte or for an
element the attachment then takes over.

## Credits

Built on [`@pierre/words`](https://github.com/pierrecomputer/pierre/tree/main/packages/words)
by The Pierre Computer Company (Apache-2.0), through its `createDomRenderer`
and `createHtmlRenderer`.
