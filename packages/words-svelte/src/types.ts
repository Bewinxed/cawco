/**
 * This package's own types: the Svelte parts. Everything Words takes is
 * Words' own type (words.ts), passed through as Words declares it.
 */
import type { Snippet } from "svelte";
import type {
  AnimateOptions,
  Caret,
  CodeOptions,
  HtmlOptions,
} from "./words.js";

/** A link, as its `link` snippet receives it. */
export interface MarkdownLink {
  /**
   * Its destination as `urlTransform` returned it, an app's own scheme
   * included; null when the check refused it.
   */
  href: string | null;
  /** What it holds, as the escaped HTML Words wrote. */
  html: string;
  /** What it holds, as text. */
  text: string;
  title: string | null;
}

/** An image, as its `image` snippet receives it. */
export interface MarkdownImage {
  alt: string;
  /** Its source as `urlTransform` returned it, an app's own scheme included. */
  src: string;
  title: string | null;
}

/** A code span, as its `inlineCode` snippet receives it. */
export interface MarkdownInlineCode {
  code: string;
}

/** What each snippet receives; a fenced block's is Words' own `CodeOptions`. */
export interface MarkdownSnippetValues {
  code: CodeOptions;
  image: MarkdownImage;
  inlineCode: MarkdownInlineCode;
  link: MarkdownLink;
}

export type MarkdownSnippetKind = keyof MarkdownSnippetValues;

/** A placeholder's snippet kind and what its snippet receives. */
export type Slotted = {
  [Kind in MarkdownSnippetKind]: {
    kind: Kind;
    value: MarkdownSnippetValues[Kind];
  };
}[MarkdownSnippetKind];

/** Svelte markup drawn in place of the elements Words writes. */
export type MarkdownSnippets = {
  [Kind in MarkdownSnippetKind]?: Snippet<[MarkdownSnippetValues[Kind]]>;
};

/**
 * Which elements a snippet takes, by what it would receive: the others stay
 * as Words writes them. A snippet takes every element of its kind when its
 * kind is left out.
 */
export type MarkdownWhen = {
  [Kind in MarkdownSnippetKind]?: (
    value: MarkdownSnippetValues[Kind]
  ) => boolean;
};

/** How the markdown renders, its source left out: what `setMarkdownDefaults` provides. */
export interface MarkdownOptions extends MarkdownSnippets {
  /**
   * Words' fade of the text a stream adds (`true`, or `{ duration }`). Its
   * keyframes are Words' stylesheet's, or your own
   * `[data-markdown][data-animated="true"]` rule. Text already drawn when
   * the element first renders never fades.
   */
  animated?: boolean | AnimateOptions;
  /** Words' caret at a stream's end. Its glyph is Words' stylesheet's, or your own `[data-markdown="caret"]` rule. */
  caret?: Caret;
  /**
   * Words' renderer options, passed to Words as they are: `components`,
   * `plugins`, `urlTransform`, `math`, `controls` and every other. The
   * snippets' hooks are added to `components`, `plugins.renderers` and
   * `urlTransform`, after yours.
   */
  options?: HtmlOptions;
  /** Complete unfinished emphasis, code and links while the source streams. Default true. */
  repair?: boolean;
  when?: MarkdownWhen;
}

/** Everything the `markdown` attachment reads. */
export interface MarkdownInput extends MarkdownOptions {
  /**
   * The context snippets are drawn in (`getAllContexts()` of the component
   * they belong to), for components inside them that read context.
   */
  context?: Map<unknown, unknown>;
  /** The whole markdown so far. */
  source: string;
  /** More of the source is still coming. */
  streaming?: boolean;
}
