/**
 * Markdown as the flat text it reads as: what a peek shows of an agent's
 * reply. Rendered by the renderer the transcript draws with (@pierre/words),
 * then read back out of its HTML with every piece of syntax gone — emphasis
 * as its words, a heading as its text, a list item as "• text" on its own
 * line, a link as its text, inline code without its backticks, a fence as
 * its code, an image as its alt text, a table row as its cells joined by two
 * spaces. Blocks stay a blank line apart, as they were written.
 */
import { renderToHtml } from "@pierre/words";
import {
  BREAK,
  literalHtml,
} from "#lib/components/ui/markdown/literal-html.js";

/** An element of the rendered HTML, and what it holds. */
interface Tag {
  alt: string;
  children: Part[];
  tag: string;
}
type Part = Tag | string;

const TOKEN = /<(\/?)([a-z][a-z0-9]*)([^>]*)>|[^<]+/gu;
const ALT = /\salt="([^"]*)"/u;
const VOID = new Set(["br", "hr", "img", "input"]);
const ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot));/giu;
const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
};
const LAST_LINE_FEED = /\n$/u;

/** One entity the renderer wrote, as its character. */
const character = (
  entity: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined
): string => {
  if (decimal) {
    return String.fromCodePoint(Number.parseInt(decimal, 10));
  }
  if (hex) {
    return String.fromCodePoint(Number.parseInt(hex, 16));
  }
  return NAMED[name?.toLowerCase() ?? ""] ?? entity;
};

/** The renderer's text, a `<br>` the words wrote a line break (literal-html.ts). */
const decode = (text: string): string =>
  text.replaceAll(BREAK, "\n").replace(ENTITY, character);

/** The renderer's HTML as a tree. It writes well-formed HTML, so a closing tag closes the element open. */
function parse(markup: string): Tag {
  const root: Tag = { tag: "", alt: "", children: [] };
  const open = [root];
  for (const [token, closing, tag, attributes = ""] of markup.matchAll(TOKEN)) {
    const parent = open.at(-1) ?? root;
    if (tag === undefined) {
      parent.children.push(decode(token));
    } else if (closing) {
      if (open.length > 1) {
        open.pop();
      }
    } else {
      const element: Tag = {
        tag,
        alt: decode(ALT.exec(attributes)?.[1] ?? ""),
        children: [],
      };
      parent.children.push(element);
      if (!VOID.has(tag)) {
        open.push(element);
      }
    }
  }
  return root;
}

const kids = (node: Tag): Tag[] =>
  node.children.filter((child): child is Tag => typeof child !== "string");

/** An element's words on one run: a line break kept, everything else its text. */
function inline(node: Part): string {
  if (typeof node === "string") {
    return node;
  }
  switch (node.tag) {
    case "br":
      return "\n";
    case "img":
      return node.alt;
    default: {
      let out = "";
      for (const child of node.children) {
        // The line a hard break ends is written after its `<br />` too.
        out +=
          typeof child === "string" &&
          out.endsWith("\n") &&
          child.startsWith("\n")
            ? inline(child.slice(1))
            : inline(child);
      }
      return out;
    }
  }
}

const BLOCKS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "pre",
  "ul",
  "ol",
  "table",
  "blockquote",
  "section",
  "hr",
]);

/** A container's blocks, flat: what it holds outside them is a list item's own words, or whitespace. */
function blocks(node: Tag, depth: number): string[] {
  const out: string[] = [];
  for (const child of kids(node).filter((kid) => BLOCKS.has(kid.tag))) {
    switch (child.tag) {
      case "hr":
        break;
      case "pre":
        out.push(inline(child).replace(LAST_LINE_FEED, ""));
        break;
      case "ul":
      case "ol":
        out.push(items(child, depth).join("\n"));
        break;
      case "table":
        out.push(rows(child).join("\n"));
        break;
      case "blockquote":
      case "section":
        out.push(...blocks(child, depth));
        break;
      default:
        out.push(inline(child).replace(LAST_LINE_FEED, ""));
    }
  }
  return out;
}

/** One line per item, its nested list indented under it. */
function items(list: Tag, depth: number): string[] {
  const indent = "  ".repeat(depth);
  return kids(list).map((item) => {
    // A tight item's words stand in it bare, before any nested block.
    const words = item.children
      .filter((child) => typeof child === "string" || !BLOCKS.has(child.tag))
      .map(inline)
      .join("")
      .trim();
    const nested = blocks(item, depth + 1);
    const [head = "", ...rest] = words ? [words, ...nested] : nested;
    return [`${indent}• ${head}`, ...rest].join("\n");
  });
}

/** A table's rows, header first: each row's cells joined by two spaces. */
function rows(table: Tag): string[] {
  return kids(table).flatMap((section) =>
    kids(section).map((row) =>
      kids(row)
        .map((cell) => inline(cell).trim())
        .join("  ")
    )
  );
}

const rendered = (source: string, incomplete: boolean): string =>
  new TextDecoder().decode(
    renderToHtml(literalHtml(source), { incomplete, skipHtml: true })
  );

/** The word a stream is still writing: whatever follows its last whitespace. */
const LAST_WORD = /\S*$/u;

/** A finished reply, flat. */
export function plainMarkdown(source: string): string {
  return blocks(parse(rendered(source, false)), 0).join("\n\n");
}

/**
 * A reply still streaming, flat. Drawn up to its last whole word, so a marker
 * or a link still arriving ("**bo", "[lin") is held back with the word it is
 * part of; the renderer closes what the drawn words leave open ("**bold
 * text" reads as "bold text" until its closer lands).
 */
export function plainStreaming(source: string): string {
  const drawn = source.slice(0, source.search(LAST_WORD));
  return blocks(parse(rendered(drawn.trim(), true)), 0).join("\n\n");
}
