/**
 * Words' options for a render, with the snippets' elements written as
 * placeholders: an element a snippet takes becomes a `display: contents`
 * element carrying its kind and its value as JSON, which the attachment
 * mounts the snippet into (mounts.svelte.ts). A placeholder holds nothing,
 * or, rendered for the server, what Words would have written there, so the
 * page reads whole before it hydrates.
 *
 * Every element comes through Words' documented hooks: a link, an image and
 * a code span through `components` (the element's HTML in, HTML out), a
 * fenced block through `plugins.renderers` (its code, language and state).
 */
import type {
  MarkdownInput,
  MarkdownSnippetKind,
  MarkdownSnippetValues,
} from "./types.js";
import {
  type CodeOptions,
  type Components,
  createHtmlRenderer,
  defaultUrlTransform,
  escapeHtml,
  type HtmlOptions,
} from "./words.js";

/** The attribute naming a placeholder's snippet. */
export const SLOT = "data-words-snippet";
/** The attribute holding a placeholder's value, as JSON. */
export const VALUE = "data-words-value";

/**
 * Words checks every URL `urlTransform` returns, so a destination only a
 * snippet may draw (an app's own scheme) passes the check as a relative
 * URL, a fragment carrying it, and is read back from there.
 */
const CARRIED = "#words-svelte:";
const CARRIED_ATTRIBUTE = new RegExp(` (?:href|src)="${CARRIED}[^"]*"`, "gu");

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
};
const ENTITY = /&(?:amp|lt|gt|quot|#39|#x27);/gu;
/** Escaped HTML's text. */
const decodeHtml = (value: string): string =>
  value.replace(ENTITY, (entity) => ENTITIES[entity] ?? entity);

const ATTRIBUTE = /\s([\w:-]+)(?:="([^"]*)")?/gu;
const TAG = /<[^>]*>/gu;

/** An element's HTML read: its opening tag's attributes, and what it holds. */
function readElement(html: string): {
  attributes: Map<string, string>;
  inner: string;
} {
  const open = html.indexOf(">");
  const attributes = new Map<string, string>();
  for (const [, name = "", value = ""] of html
    .slice(0, open)
    .matchAll(ATTRIBUTE)) {
    attributes.set(name, decodeHtml(value));
  }
  const close = html.lastIndexOf("</");
  return { attributes, inner: close > open ? html.slice(open + 1, close) : "" };
}

const textOf = (html: string): string => decodeHtml(html.replace(TAG, ""));

/** A URL as `urlTransform` returned it, carried or not. */
const urlOf = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }
  return value.startsWith(CARRIED)
    ? decodeURIComponent(value.slice(CARRIED.length))
    : value;
};

type ElementKind = Exclude<MarkdownSnippetKind, "code">;
type Read = {
  [Kind in ElementKind]: (html: string) => MarkdownSnippetValues[Kind] | null;
};

/** What each kind's element holds, or null when the snippet leaves it to Words. */
const READ: Read = {
  link: (html) => {
    const { attributes, inner } = readElement(html);
    // A footnote's reference and its way back stay Words'.
    if (
      attributes.has("data-footnote-ref") ||
      attributes.has("data-footnote-backref")
    ) {
      return null;
    }
    return {
      href: urlOf(attributes.get("href")),
      title: attributes.get("title") ?? null,
      html: inner,
      text: textOf(inner),
    };
  },
  image: (html) => {
    const { attributes } = readElement(html);
    return {
      src: urlOf(attributes.get("src")) ?? "",
      alt: attributes.get("alt") ?? "",
      title: attributes.get("title") ?? null,
    };
  },
  inlineCode: (html) => ({ code: textOf(readElement(html).inner) }),
};

/** A placeholder for `kind`'s snippet, receiving `value`, holding `fallback`. */
function placeholder(
  kind: MarkdownSnippetKind,
  value: MarkdownSnippetValues[MarkdownSnippetKind],
  fallback: string
): string {
  const tag = kind === "code" ? "div" : "span";
  return `<${tag} ${SLOT}="${kind}" ${VALUE}="${escapeHtml(JSON.stringify(value))}" style="display:contents">${fallback}</${tag}>`;
}

/**
 * The Words hook that writes `kind`'s elements as its snippet's
 * placeholders: those `take` takes, every one when it is left out. `own`
 * is what Words writes of an element the snippet leaves.
 */
function hookOf<Kind extends ElementKind>(
  kind: Kind,
  take: ((value: MarkdownSnippetValues[Kind]) => boolean) | undefined,
  own: (html: string) => string,
  fallback: boolean
): (html: string) => string {
  const read: Read[Kind] = READ[kind];
  return (html) => {
    const value = read(html);
    // A carried URL is a snippet's alone: Words draws a link without it,
    // and no image, as it does for a URL its check refuses.
    const bare = html.replace(CARRIED_ATTRIBUTE, "");
    const words = kind === "image" && bare !== html ? "" : own(bare);
    if (value === null || !(take?.(value) ?? true)) {
      return words;
    }
    return placeholder(kind, value, fallback ? words : "");
  };
}

/** The info string's first word of each fence in `source`: the languages Words hands a renderer. */
const FENCE_LANGUAGE = /(?:`{3,}|~{3,})[ \t]*([^\s`~]+)/gu;
function fenceLanguages(source: string): string[] {
  const languages = new Set(["text"]);
  for (const [, language = ""] of source.matchAll(FENCE_LANGUAGE)) {
    languages.add(language);
  }
  return [...languages].sort();
}

/**
 * The options one rendered element gives Words, for each input in turn.
 * `fallback` writes, inside each placeholder, what Words would have written
 * there: the server's render. Words keeps what it rendered while the
 * options it is given compare equal, so the fence renderer is one function
 * for the element's life, reading the latest input.
 */
export function wordsOptionsOf(
  fallback: boolean
): (input: MarkdownInput) => HtmlOptions {
  let current: MarkdownInput | undefined;
  const fence = (block: CodeOptions): string | null => {
    if (!(current?.code && (current.when?.code?.(block) ?? true))) {
      return null;
    }
    return placeholder(
      "code",
      block,
      fallback ? `<pre><code>${escapeHtml(block.code)}</code></pre>` : ""
    );
  };
  return (input) => {
    current = input;
    const options = input.options ?? {};
    const { components = {}, plugins, urlTransform } = options;
    const when = input.when ?? {};
    /** What Words writes of an element no snippet takes: the consumer's own hook's, if any. */
    const own =
      (tag: string) =>
      (html: string): string =>
        components[tag]?.(html) ?? html;
    const hooks: Components = {};
    // In the order they run: a link's text is read before its code spans are.
    if (input.link) {
      hooks.a = hookOf("link", when.link, own("a"), fallback);
    }
    if (input.image) {
      hooks.img = hookOf("image", when.image, own("img"), fallback);
    }
    if (input.inlineCode) {
      hooks.inlineCode = hookOf(
        "inlineCode",
        when.inlineCode,
        own("inlineCode"),
        fallback
      );
    }
    /** Whether a snippet may draw a `key` URL Words' check refuses. */
    const carries = (key: "href" | "src"): boolean =>
      key === "href" ? !!input.link : !!input.image;
    return {
      ...options,
      components: { ...hooks, ...components, ...hooks },
      plugins: input.code
        ? {
            ...plugins,
            renderers: [
              ...(plugins?.renderers ?? []),
              { language: fenceLanguages(input.source), render: fence },
            ],
          }
        : plugins,
      urlTransform:
        urlTransform &&
        ((url, key) => {
          const next = urlTransform(url, key);
          return next === null ||
            next === undefined ||
            !carries(key) ||
            defaultUrlTransform(next) !== undefined
            ? next
            : CARRIED + encodeURIComponent(next);
        }),
    };
  };
}

/**
 * `input` rendered once, as HTML: what Words writes, each element a snippet
 * takes written as Words writes it, inside the placeholder the snippet
 * mounts into once the `markdown` attachment runs on the element holding it.
 */
export function renderMarkdown(input: MarkdownInput): string {
  const renderer = createHtmlRenderer(wordsOptionsOf(true)(input));
  try {
    const streaming = input.streaming ?? false;
    return renderer.render(
      input.source,
      streaming && (input.repair ?? true),
      streaming
    ).html;
  } finally {
    renderer.dispose();
  }
}
